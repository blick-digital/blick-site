"""
Приём заявок с формы сайта BLICK — Яндекс Облако, Cloud Functions (Python 3.12).

POST  {name, contact, message, types[], consent, website}  →  письмо на почту студии через SMTP Яндекса.
Сайт на GitHub Pages — статика, своего сервера у него нет, поэтому форма стучится сюда.

Секреты НЕ в коде — только в переменных окружения функции (в консоли Яндекс Облака):
  SMTP_USER   blickdesign@yandex.ru   (с этого ящика уходит письмо)
  SMTP_PASS   пароль приложения Яндекс ID (не основной пароль от почты)
  CONTACT_TO  blickdesign@yandex.ru   (куда приходят заявки)
Необязательно:
  ALLOWED_ORIGINS  через запятую; по умолчанию — домен сайта
"""
import base64
import json
import os
import re
import smtplib
import ssl
from email.header import Header
from email.message import EmailMessage

SMTP_HOST = "smtp.yandex.ru"
SMTP_PORT = 465
MAX_BODY = 20000
LIMITS = {"name": 120, "contact": 200, "message": 4000}
TYPES = {"design": "Дизайн", "web": "Сайт", "app": "Приложение", "video": "Видео / AI", "other": "Пока не знаю"}
FALLBACK_ERROR = "Не удалось отправить заявку. Напишите нам на почту blickdesign@yandex.ru"
DEFAULT_ORIGINS = "https://blickdesign.ru,http://blickdesign.ru,https://www.blickdesign.ru,http://www.blickdesign.ru"
EMAIL_RE = re.compile(r"^[^@\s<>,;]+@[^@\s<>,;]+\.[^@\s<>,;]+$")


def _allowed_origins():
    return {o.strip() for o in os.environ.get("ALLOWED_ORIGINS", DEFAULT_ORIGINS).split(",") if o.strip()}


def _reply(code, payload, origin=None):
    headers = {"Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"}
    if origin:
        headers.update({
            "Access-Control-Allow-Origin": origin,
            "Vary": "Origin",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, X-Requested-With",
            "Access-Control-Max-Age": "86400",
        })
    return {"statusCode": code, "headers": headers, "body": json.dumps(payload, ensure_ascii=False)}


def _clean_line(v, limit):
    return re.sub(r"[\r\n\t]+", " ", str(v or "")).strip()[:limit]


def _send(subject, body, reply_to):
    user, pwd, to = os.environ["SMTP_USER"], os.environ["SMTP_PASS"], os.environ.get("CONTACT_TO") or os.environ["SMTP_USER"]
    msg = EmailMessage()
    msg["Subject"] = str(Header(subject, "utf-8"))
    msg["From"] = f"BLICK <{user}>"
    msg["To"] = to
    if reply_to:
        msg["Reply-To"] = reply_to
    msg.set_content(body)
    with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, timeout=15, context=ssl.create_default_context()) as s:
        s.login(user, pwd)
        s.send_message(msg)


def handler(event, context):
    headers = {str(k).lower(): v for k, v in (event.get("headers") or {}).items()}
    origin = headers.get("origin", "")
    origin_ok = origin in _allowed_origins()
    cors = origin if origin_ok else None
    method = (event.get("httpMethod") or "").upper()

    if method == "OPTIONS":  # предзапрос браузера (CORS)
        return _reply(204 if origin_ok else 403, {}, cors)
    if method != "POST":
        return _reply(405, {"ok": False, "error": "метод не поддерживается"}, cors)
    # защита от подделки запроса: свой заголовок + разрешённый сайт
    if headers.get("x-requested-with") != "blick-form" or not origin_ok:
        return _reply(403, {"ok": False, "error": "запрос отклонён"}, cors)

    raw = event.get("body") or ""
    if event.get("isBase64Encoded"):
        raw = base64.b64decode(raw).decode("utf-8", "replace")
    if not raw or len(raw) > MAX_BODY:
        return _reply(400, {"ok": False, "error": "пустой или слишком большой запрос"}, cors)
    try:
        data = json.loads(raw)
    except ValueError:
        data = None
    if not isinstance(data, dict):
        return _reply(400, {"ok": False, "error": "некорректный запрос"}, cors)

    if data.get("website"):  # ловушка для ботов — делаем вид, что всё хорошо
        return _reply(200, {"ok": True}, cors)

    name = _clean_line(data.get("name"), LIMITS["name"])
    contact = _clean_line(data.get("contact"), LIMITS["contact"])
    message = str(data.get("message") or "").strip()[:LIMITS["message"]]
    types = [TYPES[t] for t in (data.get("types") or []) if isinstance(t, str) and t in TYPES] if isinstance(data.get("types"), list) else []

    if not name or not contact:
        return _reply(400, {"ok": False, "error": "Заполните имя и контакт"}, cors)
    if data.get("consent") is not True:
        return _reply(400, {"ok": False, "error": "Нужно согласие на обработку персональных данных"}, cors)

    subject = f"Заявка с сайта BLICK — {name}"
    body = (
        "Новая заявка с сайта blickdesign.ru\n\n"
        f"Имя: {name}\n"
        f"Контакт: {contact}\n"
        f"Что нужно: {', '.join(types) if types else 'не указано'}\n\n"
        f"Задача:\n{message or '—'}\n\n"
        "Клиент дал согласие на обработку персональных данных (галочка на сайте).\n"
    )
    try:
        _send(subject, body, contact if EMAIL_RE.match(contact) else None)
    except Exception as e:  # noqa: BLE001 — любой сбой SMTP/окружения: логируем и отвечаем аккуратно
        print("contact: не удалось отправить —", type(e).__name__, e)
        return _reply(502, {"ok": False, "error": FALLBACK_ERROR}, cors)
    return _reply(200, {"ok": True}, cors)
