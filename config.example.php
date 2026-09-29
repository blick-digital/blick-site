<?php
/**
 * Шаблон файла с секретами для api/contact.php и api/admin.php.
 *
 * Что сделать:
 *   1. Скопируйте этот файл под именем config.php.
 *   2. Значения ниже для формы и для входа в админку уже готовы — это те же
 *      данные, что были в Vercel. Проверьте их по файлу
 *      "BLICK — данные для админки.txt" на рабочем столе.
 *   3. Положите config.php НА СЕРВЕРЕ на уровень выше public_html —
 *      то есть рядом с папкой public_html, а не внутри неё. Так файл
 *      не будет доступен по прямой ссылке из браузера.
 *
 * Сам config.php никогда не должен попасть в GitHub — он уже в .gitignore.
 * В репозитории остаётся только этот example-файл, без настоящих секретов.
 */

// ---------- форма обратной связи ----------
define('SMTP_HOST', 'smtp.yandex.ru');
define('SMTP_PORT', 465);
define('SMTP_USER', 'blickdesign@yandex.ru');
define('SMTP_PASS', 'ВПИШИТЕ_ПАРОЛЬ_ПРИЛОЖЕНИЯ');
define('CONTACT_TO', 'blickdesign@yandex.ru');

// ---------- админка ----------
define('ADMIN_LOGIN', 'blick-admin');
// формат: итерации:соль_hex:хеш_hex (PBKDF2-HMAC-SHA256) — тот же пароль, что и раньше
define('ADMIN_PASSWORD_HASH', '300000:58bbfdfa3f3f98f39f6e9af7d66c380f:5099aa8be182bd791d3a2479012efeedfeb6c15aa5afa419b968defddc96d50a');
// секрет для подписи cookie входа — уже сгенерирован случайно, менять не нужно
define('SESSION_SECRET', 'e6e46b512972ad825bdff8f2ff2fc248fbfe1bc479ca4912717db10152bb56e7');
