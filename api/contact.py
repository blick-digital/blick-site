"""
Приём заявок с формы сайта BLICK (Vercel, Python).

POST /api/contact  {name, contact, message, types[], consent}
Письмо уходит на почту студии через SMTP (по умолчанию Яндекс Почта).

Секреты хранятся ТОЛЬКО в переменных окружения проекта Vercel, в репозиторий они не попадают:
  SMTP_USER      — почта, с которой отправляем (blickdesign@yandex.ru)
  SMTP_PASSWORD  — «пароль приложения» почтового сервиса (не обычный пароль от ящика)
  SMTP_HOST      — сервер исходящей почты, по умолчанию smtp.yandex.ru (для Mail.ru — smtp.mail.ru)
  CONTACT_TO     — необязательно: куда слать заявки (по умолчанию на SMTP_USER)
"""
import json
import os
import re
import smtplib
import ssl
from email.message import EmailMessage
from http.server import BaseHTTPRequestHandler
from urllib import parse

MAX_BODY = 20_000
LIMITS = {"name": 120, "contact": 200, "message": 4000}
TYPES = {"design": "Дизайн", "web": "Сайт", "app": "Приложение", "video": "Видео / AI", "other": "Пока не знаю"}
EMAIL_RE = re.compile(r"^[^@\s<>,;]+@[^@\s<>,;]+\.[^@\s<>,;]+$")


def clean_line(value, limit):
    """Одна строка без переводов строк (защита от подмены заголовков письма)."""
    return re.sub(r"[\r\n\t]+", " ", str(value or "")).strip()[:limit]


def build_message(data, sender, to):
    name = clean_line(data.get("name"), LIMITS["name"])
    contact = clean_line(data.get("contact"), LIMITS["contact"])
    message = str(data.get("message") or "").strip()[:LIMITS["message"]]
    types = [TYPES[t] for t in (data.get("types") or []) if isinstance(t, str) and t in TYPES]
    if not name or not contact:
        raise ValueError("Заполните имя и контакт")
    if data.get("consent") is not True:
        raise ValueError("Нужно согласие на обработку персональных данных")

    msg = EmailMessage()
    msg["Subject"] = f"Заявка с сайта BLICK — {name}"
    msg["From"] = sender
    msg["To"] = to
    if EMAIL_RE.match(contact):
        msg["Reply-To"] = contact  # можно ответить на письмо прямо из почты
    msg.set_content(
        "Новая заявка с сайта blickdesign.ru\n\n"
        f"Имя: {name}\n"
        f"Контакт: {contact}\n"
        f"Что нужно: {', '.join(types) if types else 'не указано'}\n\n"
        f"Задача:\n{message or '—'}\n\n"
        "Клиент дал согласие на обработку персональных данных (галочка на сайте)."
    )
    return msg


def send_mail(msg):
    user, password = os.environ["SMTP_USER"].strip(), os.environ["SMTP_PASSWORD"].strip()
    with smtplib.SMTP_SSL((os.environ.get("SMTP_HOST") or "smtp.yandex.ru").strip(), 465, timeout=20, context=ssl.create_default_context()) as s:
        s.login(user, password)
        s.send_message(msg)


class handler(BaseHTTPRequestHandler):
    def log_message(self, *a):  # в логи ничего личного не пишем
        pass

    def _send(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        missing = [k for k in ("SMTP_USER", "SMTP_PASSWORD") if not os.environ.get(k)]
        self._send(200, {"ok": True, "configured": not missing, "missing": missing})

    def do_POST(self):
        try:
            if self.headers.get("X-Requested-With") != "blick-form":
                return self._send(403, {"ok": False, "error": "запрос отклонён"})
            origin = self.headers.get("Origin")
            if origin and parse.urlparse(origin).netloc != self.headers.get("Host"):
                return self._send(403, {"ok": False, "error": "запрос отклонён"})
            if not (os.environ.get("SMTP_USER") and os.environ.get("SMTP_PASSWORD")):
                return self._send(503, {"ok": False, "error": "Отправка заявок ещё не настроена. Напишите нам на почту."})
            n = int(self.headers.get("Content-Length") or 0)
            if n <= 0 or n > MAX_BODY:
                raise ValueError("пустой или слишком большой запрос")
            data = json.loads(self.rfile.read(n).decode("utf-8"))
            if not isinstance(data, dict):
                raise ValueError("некорректный запрос")
            if data.get("website"):  # ловушка для ботов: людям это поле не видно
                return self._send(200, {"ok": True})
            sender = os.environ["SMTP_USER"].strip()
            send_mail(build_message(data, sender, os.environ.get("CONTACT_TO") or sender))
            self._send(200, {"ok": True})
        except (ValueError, json.JSONDecodeError) as e:
            self._send(400, {"ok": False, "error": str(e)})
        except Exception as e:  # noqa: BLE001
            # код ошибки без текста сервера и без личных данных — чтобы понять причину сбоя
            code = getattr(e, "smtp_code", None)
            tag = type(e).__name__ + (f" {code}" if code else "")
            print("contact: отправка не удалась:", tag, flush=True)
            self._send(502, {"ok": False, "error": f"Не удалось отправить заявку ({tag}). Напишите нам на почту."})
