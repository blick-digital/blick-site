"""
Серверная часть админки BLICK (Vercel, Python).

Один файл — один адрес /api/admin, действие задаётся параметром ?action=…:
  ping   — проверка, что функция жива (без входа);
  me     — вошли ли вы (по cookie);
  login  — вход по логину и паролю (POST);
  logout — выход (POST);
  save   — записать список кейсов в js/data.js в репозитории GitHub (POST, нужен вход);
  upload — загрузить картинку в assets/works/ (POST, нужен вход).

После записи в GitHub Vercel сам пересобирает сайт (обычно ~1 минута).

Секреты хранятся ТОЛЬКО в переменных окружения проекта Vercel, в код и репозиторий они не попадают:
  ADMIN_LOGIN, ADMIN_PASSWORD_HASH, SESSION_SECRET, GITHUB_TOKEN, GITHUB_REPO, GITHUB_BRANCH
"""
import base64
import hashlib
import hmac
import json
import os
import re
import time
from http.server import BaseHTTPRequestHandler
from urllib import error, parse, request

SESSION_TTL = 12 * 3600          # вход действует 12 часов
COOKIE = "blick_admin"
MAX_PROJECTS = 200
MAX_JSON = 1024 * 1024           # 1 МБ на весь список кейсов
MAX_UPLOAD = int(3.3 * 1024 * 1024)  # лимит тела запроса у Vercel ~4,5 МБ (base64 +33%)
IMG_EXT = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,80}$")


# ---------- пароль и сессия ----------
def hash_password(password: str, salt: bytes = None, iterations: int = 300_000) -> str:
    """Формат: pbkdf2$итерации$соль_hex$хеш_hex (PBKDF2-HMAC-SHA256; работает на любой сборке Python)."""
    salt = salt or os.urandom(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations, dklen=32)
    return f"pbkdf2${iterations}${salt.hex()}${dk.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        scheme, iters, salt_hex, hash_hex = stored.split("$")
        if scheme != "pbkdf2":
            return False
        dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), bytes.fromhex(salt_hex), int(iters), dklen=len(bytes.fromhex(hash_hex)))
        return hmac.compare_digest(dk, bytes.fromhex(hash_hex))
    except Exception:
        return False


def sign(payload: bytes, secret: str) -> str:
    return hmac.new(secret.encode("utf-8"), payload, hashlib.sha256).hexdigest()


def make_token(user: str, secret: str, now=None) -> str:
    exp = int((now or time.time()) + SESSION_TTL)
    payload = base64.urlsafe_b64encode(json.dumps({"u": user, "exp": exp}).encode("utf-8"))
    return payload.decode("ascii") + "." + sign(payload, secret)


def read_token(token: str, secret: str, now=None):
    try:
        payload_b64, sig = token.split(".", 1)
        if not hmac.compare_digest(sign(payload_b64.encode("ascii"), secret), sig):
            return None
        data = json.loads(base64.urlsafe_b64decode(payload_b64.encode("ascii")))
        if data.get("exp", 0) < (now or time.time()):
            return None
        return data.get("u")
    except Exception:
        return None


# ---------- GitHub ----------
def gh(method: str, path: str, body=None):
    repo = os.environ["GITHUB_REPO"]
    url = f"https://api.github.com/repos/{repo}/{path}"
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = request.Request(url, data=data, method=method, headers={
        "Authorization": "Bearer " + os.environ["GITHUB_TOKEN"],
        "Accept": "application/vnd.github+json",
        "User-Agent": "blick-admin",
        "Content-Type": "application/json",
    })
    try:
        with request.urlopen(req, timeout=25) as r:
            return r.status, json.loads(r.read().decode("utf-8") or "{}")
    except error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode("utf-8"))
        except Exception:
            return e.code, {}


def rewrite_projects(src: str, projects) -> str:
    start = src.index("window.PROJECTS")
    end = src.index("\n];", start)
    return src[:start] + "window.PROJECTS = " + json.dumps(projects, ensure_ascii=False, indent=2) + ";" + src[end + 3:]


def save_projects(projects):
    branch = os.environ.get("GITHUB_BRANCH", "main")
    for attempt in range(2):  # один повтор, если файл успели изменить параллельно
        code, info = gh("GET", f"contents/js/data.js?ref={parse.quote(branch)}")
        if code != 200:
            raise RuntimeError(f"не удалось прочитать js/data.js в GitHub ({code})")
        src = base64.b64decode(info["content"]).decode("utf-8")
        out = rewrite_projects(src, projects)
        code, res = gh("PUT", "contents/js/data.js", {
            "message": "Админка: обновление кейсов",
            "content": base64.b64encode(out.encode("utf-8")).decode("ascii"),
            "sha": info["sha"], "branch": branch,
        })
        if code in (200, 201):
            return
        if code not in (409, 422) or attempt == 1:
            raise RuntimeError(f"GitHub не принял изменения ({code}): {res.get('message', '')}")


def safe_name(name: str) -> str:
    name = os.path.basename(name or "file")
    stem, ext = os.path.splitext(name)
    stem = re.sub(r"[^\w\-]+", "-", stem, flags=re.UNICODE).strip("-_") or "file"
    return stem[:60] + ext.lower()


def upload_image(name: str, data_url: str) -> str:
    name = safe_name(name)
    stem, ext = os.path.splitext(name)
    if ext not in IMG_EXT:
        raise ValueError("можно загружать только картинки (jpg, png, webp, gif)")
    raw = base64.b64decode(data_url.split(",", 1)[1] if "," in data_url else data_url)
    if len(raw) > MAX_UPLOAD:
        raise ValueError("файл слишком большой (лимит ~3,3 МБ); админка сама уменьшает картинки перед загрузкой")
    branch = os.environ.get("GITHUB_BRANCH", "main")
    n, path = 2, f"assets/works/{name}"
    while True:  # не затираем существующие файлы
        code, _ = gh("GET", f"contents/{parse.quote(path)}?ref={parse.quote(branch)}")
        if code == 404:
            break
        if code != 200:
            raise RuntimeError(f"GitHub не отвечает ({code})")
        path, n = f"assets/works/{stem}-{n}{ext}", n + 1
    code, res = gh("PUT", f"contents/{parse.quote(path)}", {
        "message": f"Админка: картинка {path}",
        "content": base64.b64encode(raw).decode("ascii"), "branch": branch,
    })
    if code not in (200, 201):
        raise RuntimeError(f"GitHub не принял файл ({code}): {res.get('message', '')}")
    return path


def validate_projects(projects):
    if not isinstance(projects, list) or not (1 <= len(projects) <= MAX_PROJECTS):
        raise ValueError("некорректный список кейсов")
    seen = set()
    for p in projects:
        if not isinstance(p, dict) or not isinstance(p.get("slug"), str) or not SLUG_RE.match(p["slug"]):
            raise ValueError("у каждого кейса нужен адрес (slug): латиница, цифры и дефис")
        if p["slug"] in seen:
            raise ValueError("адреса кейсов (slug) не должны повторяться: " + p["slug"])
        seen.add(p["slug"])
        if not isinstance(p.get("title"), str) or not p["title"].strip():
            raise ValueError("у кейса нет названия: " + p["slug"])
    if len(json.dumps(projects, ensure_ascii=False)) > MAX_JSON:
        raise ValueError("данные слишком большие")


# ---------- HTTP ----------
class handler(BaseHTTPRequestHandler):
    def log_message(self, *a):  # тишина в логах, паролей там и так нет
        pass

    # --- служебное ---
    def _send(self, code, obj, cookie=None):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        if cookie:
            self.send_header("Set-Cookie", cookie)
        self.end_headers()
        self.wfile.write(body)

    def _configured(self):
        need = ["ADMIN_LOGIN", "ADMIN_PASSWORD_HASH", "SESSION_SECRET", "GITHUB_TOKEN", "GITHUB_REPO"]
        return [k for k in need if not os.environ.get(k)]

    def _user(self):
        secret = os.environ.get("SESSION_SECRET", "")
        for part in (self.headers.get("Cookie") or "").split(";"):
            k, _, v = part.strip().partition("=")
            if k == COOKIE and secret:
                return read_token(v, secret)
        return None

    def _csrf_ok(self):
        if self.headers.get("X-Requested-With") != "blick-admin":
            return False
        origin = self.headers.get("Origin")
        return not origin or parse.urlparse(origin).netloc == self.headers.get("Host")

    def _body(self, limit):
        n = int(self.headers.get("Content-Length") or 0)
        if n <= 0 or n > limit:
            raise ValueError("пустой или слишком большой запрос")
        return json.loads(self.rfile.read(n).decode("utf-8"))

    def _action(self):
        return (parse.parse_qs(parse.urlparse(self.path).query).get("action") or [""])[0]

    # --- маршруты ---
    def do_GET(self):
        act = self._action()
        if act == "ping":
            missing = self._configured()
            return self._send(200, {"ok": True, "mode": "remote", "configured": not missing, "missing": missing})
        if act == "me":
            u = self._user()
            return self._send(200, {"ok": True, "mode": "remote", "auth": bool(u), "user": u, "configured": not self._configured()})
        self._send(404, {"ok": False, "error": "неизвестный запрос"})

    def do_POST(self):
        act = self._action()
        try:
            missing = self._configured()
            if missing:
                return self._send(503, {"ok": False, "error": "Админка не настроена: в Vercel не заданы переменные " + ", ".join(missing)})
            if not self._csrf_ok():
                return self._send(403, {"ok": False, "error": "запрос отклонён"})
            if act == "login":
                d = self._body(10_000)
                ok_login = hmac.compare_digest(str(d.get("login", "")).encode(), os.environ["ADMIN_LOGIN"].encode())
                ok_pass = verify_password(str(d.get("password", "")), os.environ["ADMIN_PASSWORD_HASH"])
                if not (ok_login and ok_pass):
                    time.sleep(1.0)  # замедляем перебор пароля
                    return self._send(401, {"ok": False, "error": "неверный логин или пароль"})
                token = make_token(os.environ["ADMIN_LOGIN"], os.environ["SESSION_SECRET"])
                cookie = f"{COOKIE}={token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age={SESSION_TTL}"
                return self._send(200, {"ok": True}, cookie)
            if act == "logout":
                return self._send(200, {"ok": True}, f"{COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0")
            if not self._user():
                return self._send(401, {"ok": False, "error": "нужно войти"})
            if act == "save":
                d = self._body(MAX_JSON + 100_000)
                validate_projects(d.get("projects"))
                save_projects(d["projects"])
                return self._send(200, {"ok": True, "count": len(d["projects"])})
            if act == "upload":
                d = self._body(4_400_000)
                return self._send(200, {"ok": True, "path": upload_image(d.get("name"), d.get("dataUrl", ""))})
            self._send(404, {"ok": False, "error": "неизвестный запрос"})
        except (ValueError, KeyError, json.JSONDecodeError) as e:
            self._send(400, {"ok": False, "error": str(e)})
        except Exception as e:  # noqa: BLE001
            self._send(500, {"ok": False, "error": str(e)})
