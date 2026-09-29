<?php
/**
 * Приём заявок с формы сайта BLICK (Beget, PHP).
 *
 * POST /api/contact.php  {name, contact, message, types[], consent}
 * Письмо уходит на почту студии через SMTP Яндекса — соединение проверено
 * и работает с этого хостинга (в отличие от SpaceWeb, там исходящий SMTP заблокирован).
 *
 * Написано под PHP 5.6 (версия на бесплатном тарифе Beget на момент написания) —
 * без оператора "??" и без Throwable, они появились только в PHP 7.
 *
 * Секреты лежат в config.php ЭТАЖОМ ВЫШЕ этой папки — то есть вне public_html,
 * снаружи веб-корня, недоступны по прямой ссылке. Этот файл в репозиторий
 * и в GitHub не попадает (добавлен в .gitignore) — на сервере его создаём вручную.
 */

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function val($arr, $key, $default = null) {
    return isset($arr[$key]) ? $arr[$key] : $default;
}

$configPath = __DIR__ . '/../../config.php';
if (!is_file($configPath)) {
    http_response_code(503);
    echo json_encode(array('ok' => false, 'error' => 'Отправка заявок ещё не настроена. Напишите нам на почту.'), JSON_UNESCAPED_UNICODE);
    exit;
}
require $configPath; // задаёт SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, CONTACT_TO

define('MAX_BODY', 20000);
$LIMITS = array('name' => 120, 'contact' => 200, 'message' => 4000);
$TYPES = array('design' => 'Дизайн', 'web' => 'Сайт', 'app' => 'Приложение', 'video' => 'Видео / AI', 'other' => 'Пока не знаю');

function bad($code, $error) {
    http_response_code($code);
    echo json_encode(array('ok' => false, 'error' => $error), JSON_UNESCAPED_UNICODE);
    exit;
}

// защита от подделки запроса — тот же заголовок, что ставила Vercel-версия
if (val($_SERVER, 'HTTP_X_REQUESTED_WITH', '') !== 'blick-form') bad(403, 'запрос отклонён');
$origin = val($_SERVER, 'HTTP_ORIGIN', '');
if ($origin && parse_url($origin, PHP_URL_HOST) !== val($_SERVER, 'HTTP_HOST', '')) bad(403, 'запрос отклонён');

$raw = file_get_contents('php://input', false, null, 0, MAX_BODY + 1);
if ($raw === false || $raw === '' || strlen($raw) > MAX_BODY) bad(400, 'пустой или слишком большой запрос');
$data = json_decode($raw, true);
if (!is_array($data)) bad(400, 'некорректный запрос');

if (!empty($data['website'])) { echo json_encode(array('ok' => true)); exit; } // ловушка для ботов

function clean_line($v, $limit) {
    return mb_substr(trim(preg_replace('/[\r\n\t]+/', ' ', (string) $v)), 0, $limit);
}

$name = clean_line(val($data, 'name', ''), $LIMITS['name']);
$contact = clean_line(val($data, 'contact', ''), $LIMITS['contact']);
$message = mb_substr(trim((string) val($data, 'message', '')), 0, $LIMITS['message']);
$rawTypes = val($data, 'types', array());
$types = array();
if (is_array($rawTypes)) {
    foreach ($rawTypes as $t) {
        if (is_string($t) && isset($TYPES[$t])) $types[] = $TYPES[$t];
    }
}

if ($name === '' || $contact === '') bad(400, 'Заполните имя и контакт');
if (val($data, 'consent', false) !== true) bad(400, 'Нужно согласие на обработку персональных данных');

$isEmail = (bool) preg_match('/^[^@\s<>,;]+@[^@\s<>,;]+\.[^@\s<>,;]+$/', $contact);

$subject = 'Заявка с сайта BLICK — ' . $name;
$body = "Новая заявка с сайта blickdesign.ru\r\n\r\n"
      . "Имя: $name\r\n"
      . "Контакт: $contact\r\n"
      . "Что нужно: " . ($types ? implode(', ', $types) : 'не указано') . "\r\n\r\n"
      . "Задача:\r\n" . ($message !== '' ? $message : '—') . "\r\n\r\n"
      . "Клиент дал согласие на обработку персональных данных (галочка на сайте).\r\n";

// ---------- минимальный SMTP-клиент без сторонних библиотек ----------
function smtp_cmd($sock, $cmd) {
    if ($cmd !== null) fwrite($sock, $cmd . "\r\n");
    $data = '';
    while ($line = fgets($sock, 515)) {
        $data .= $line;
        if (isset($line[3]) && $line[3] === ' ') break;
    }
    return (int) substr($data, 0, 3);
}

function send_mail_smtp($subject, $body, $replyTo) {
    $sock = @stream_socket_client('ssl://' . SMTP_HOST . ':' . SMTP_PORT, $errno, $errstr, 12);
    if (!$sock) throw new Exception("connect $errno $errstr");
    stream_set_timeout($sock, 15);
    smtp_cmd($sock, null); // приветствие
    if (smtp_cmd($sock, 'EHLO blickdesign.ru') >= 400) throw new Exception('EHLO');
    smtp_cmd($sock, 'AUTH LOGIN');
    smtp_cmd($sock, base64_encode(SMTP_USER));
    if (smtp_cmd($sock, base64_encode(SMTP_PASS)) >= 400) throw new Exception('auth');
    smtp_cmd($sock, 'MAIL FROM:<' . SMTP_USER . '>');
    smtp_cmd($sock, 'RCPT TO:<' . CONTACT_TO . '>');
    smtp_cmd($sock, 'DATA');
    $headers = "Subject: =?UTF-8?B?" . base64_encode($subject) . "?=\r\n"
             . "From: BLICK <" . SMTP_USER . ">\r\n"
             . "To: <" . CONTACT_TO . ">\r\n";
    if ($replyTo) $headers .= "Reply-To: <$replyTo>\r\n";
    $headers .= "Content-Type: text/plain; charset=utf-8\r\n";
    // экранируем одиночные точки в начале строки — иначе SMTP примет их за конец письма
    $escaped = preg_replace('/^\./m', '..', $body);
    $code = smtp_cmd($sock, $headers . "\r\n" . $escaped . "\r\n.");
    smtp_cmd($sock, 'QUIT');
    fclose($sock);
    if ($code >= 400) throw new Exception('send ' . $code);
}

try {
    send_mail_smtp($subject, $body, $isEmail ? $contact : null);
    echo json_encode(array('ok' => true));
} catch (Exception $e) {
    error_log('contact.php: не удалось отправить — ' . $e->getMessage());
    http_response_code(502);
    echo json_encode(array('ok' => false, 'error' => 'Не удалось отправить заявку. Напишите нам на почту blickdesign@yandex.ru'), JSON_UNESCAPED_UNICODE);
}
