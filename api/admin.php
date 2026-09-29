<?php
/**
 * Серверная часть админки BLICK (Beget, PHP 5.6).
 *
 * Один файл — один адрес /api/admin.php, действие в ?action=…:
 *   ping   — жива ли функция (без входа)
 *   me     — вошли ли вы (по cookie)
 *   login  — вход по логину/паролю (POST)
 *   logout — выход (POST)
 *   save   — записать кейсы в js/data.js ПРЯМО НА ЭТОМ СЕРВЕРЕ (POST, нужен вход)
 *   upload — загрузить картинку в assets/works/ ПРЯМО НА ЭТОТ СЕРВЕР (POST, нужен вход)
 *
 * В отличие от версии на Vercel, здесь нет GitHub API и пересборки — админка
 * пишет файлы напрямую на диск хостинга, изменения видны сразу же.
 *
 * Секреты — в config.php ЭТАЖОМ ВЫШЕ public_html (вне веб-корня), задаёт:
 *   ADMIN_LOGIN, ADMIN_PASSWORD_HASH ("итерации:соль_hex:хеш_hex"), SESSION_SECRET
 */

define('SESSION_TTL', 12 * 3600);
define('COOKIE_NAME', 'blick_admin');
define('MAX_PROJECTS', 200);
define('MAX_JSON', 1024 * 1024);
define('MAX_UPLOAD', (int) (3.3 * 1024 * 1024));
$IMG_EXT = array('.jpg', '.jpeg', '.png', '.webp', '.gif');

$WEB_ROOT = dirname(__DIR__);              // public_html
$DATA_JS  = $WEB_ROOT . '/js/data.js';
$WORKS_DIR = $WEB_ROOT . '/assets/works';

function val($arr, $key, $default = null) {
    return isset($arr[$key]) ? $arr[$key] : $default;
}

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function send($code, $obj, $cookie = null) {
    http_response_code($code);
    if ($cookie) header('Set-Cookie: ' . $cookie, false);
    echo json_encode($obj, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

$configPath = dirname($WEB_ROOT) . '/config.php';
$configured = is_file($configPath);
if ($configured) require $configPath;

function need_config() {
    $need = array('ADMIN_LOGIN', 'ADMIN_PASSWORD_HASH', 'SESSION_SECRET');
    $missing = array();
    foreach ($need as $k) if (!defined($k)) $missing[] = $k;
    return $missing;
}

// ---------- пароль и подпись сессии ----------
function verify_password($password, $stored) {
    $parts = explode(':', $stored);
    if (count($parts) !== 3) return false;
    list($iterations, $saltHex, $hashHex) = $parts;
    $salt = @hex2bin($saltHex);
    if ($salt === false) return false;
    $dk = hash_pbkdf2('sha256', $password, $salt, (int) $iterations, strlen($hashHex) / 2, false);
    return hash_equals($hashHex, $dk);
}

function sign($payload, $secret) {
    return hash_hmac('sha256', $payload, $secret);
}

function make_token($user, $secret) {
    $exp = time() + SESSION_TTL;
    $payload = rtrim(strtr(base64_encode(json_encode(array('u' => $user, 'exp' => $exp))), '+/', '-_'), '=');
    return $payload . '.' . sign($payload, $secret);
}

function read_token($token, $secret) {
    $pos = strpos($token, '.');
    if ($pos === false) return null;
    $payloadB64 = substr($token, 0, $pos);
    $sig = substr($token, $pos + 1);
    if (!hash_equals(sign($payloadB64, $secret), $sig)) return null;
    $json = base64_decode(strtr($payloadB64, '-_', '+/'));
    $data = json_decode($json, true);
    if (!is_array($data) || !isset($data['exp']) || $data['exp'] < time()) return null;
    return val($data, 'u');
}

function current_user() {
    if (!defined('SESSION_SECRET')) return null;
    $raw = val($_COOKIE, COOKIE_NAME, '');
    if ($raw === '') return null;
    return read_token($raw, SESSION_SECRET);
}

function csrf_ok() {
    if (val($_SERVER, 'HTTP_X_REQUESTED_WITH', '') !== 'blick-admin') return false;
    $origin = val($_SERVER, 'HTTP_ORIGIN', '');
    return !$origin || parse_url($origin, PHP_URL_HOST) === val($_SERVER, 'HTTP_HOST', '');
}

function read_body($limit) {
    $raw = file_get_contents('php://input', false, null, 0, $limit + 1);
    if ($raw === false || $raw === '' || strlen($raw) > $limit) throw new Exception('пустой или слишком большой запрос');
    $data = json_decode($raw, true);
    if (!is_array($data)) throw new Exception('некорректный запрос');
    return $data;
}

// ---------- запись кейсов на диск ----------
function rewrite_projects_src($src, $projects) {
    $start = strpos($src, 'window.PROJECTS');
    if ($start === false) throw new Exception('в data.js не найден window.PROJECTS');
    $end = strpos($src, "\n];", $start);
    if ($end === false) throw new Exception('в data.js не найден конец массива PROJECTS');
    $json = json_encode($projects, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
    return substr($src, 0, $start) . 'window.PROJECTS = ' . $json . ';' . substr($src, $end + 3);
}

function save_projects($projects, $dataJsPath) {
    $src = @file_get_contents($dataJsPath);
    if ($src === false) throw new Exception('не удалось прочитать js/data.js на сервере');
    $out = rewrite_projects_src($src, $projects);
    @file_put_contents($dataJsPath . '.bak', $src); // предыдущая версия на всякий случай
    $tmp = $dataJsPath . '.tmp';
    if (@file_put_contents($tmp, $out) === false) throw new Exception('не удалось записать data.js (проверьте права на запись)');
    if (!@rename($tmp, $dataJsPath)) throw new Exception('не удалось заменить data.js');
}

function validate_projects($projects) {
    if (!is_array($projects) || count($projects) < 1 || count($projects) > MAX_PROJECTS) {
        throw new Exception('некорректный список кейсов');
    }
    $seen = array();
    foreach ($projects as $p) {
        if (!is_array($p) || !isset($p['slug']) || !preg_match('/^[a-z0-9][a-z0-9-]{0,80}$/', $p['slug'])) {
            throw new Exception('у каждого кейса нужен адрес (slug): латиница, цифры и дефис');
        }
        if (isset($seen[$p['slug']])) throw new Exception('адреса кейсов (slug) не должны повторяться: ' . $p['slug']);
        $seen[$p['slug']] = true;
        if (empty($p['title']) || !is_string($p['title'])) throw new Exception('у кейса нет названия: ' . $p['slug']);
    }
    if (strlen(json_encode($projects, JSON_UNESCAPED_UNICODE)) > MAX_JSON) throw new Exception('данные слишком большие');
}

// ---------- загрузка картинок ----------
function safe_name($name) {
    global $IMG_EXT;
    $name = basename((string) $name ?: 'file');
    $dot = strrpos($name, '.');
    $stem = $dot !== false ? substr($name, 0, $dot) : $name;
    $ext = $dot !== false ? strtolower(substr($name, $dot)) : '';
    $stem = preg_replace('/[^\w\-]+/u', '-', $stem);
    $stem = trim($stem, '-_');
    if ($stem === '') $stem = 'file';
    return array(mb_substr($stem, 0, 60), $ext);
}

function upload_image($name, $dataUrl, $worksDir) {
    global $IMG_EXT;
    list($stem, $ext) = safe_name($name);
    if (!in_array($ext, $IMG_EXT, true)) throw new Exception('можно загружать только картинки (jpg, png, webp, gif)');
    $comma = strpos($dataUrl, ',');
    $b64 = $comma !== false ? substr($dataUrl, $comma + 1) : $dataUrl;
    $raw = base64_decode($b64, true);
    if ($raw === false) throw new Exception('повреждённые данные картинки');
    if (strlen($raw) > MAX_UPLOAD) throw new Exception('файл слишком большой (лимит ~3,3 МБ); админка сама уменьшает картинки перед загрузкой');
    if (!is_dir($worksDir)) @mkdir($worksDir, 0755, true);
    $n = 2;
    $filename = $stem . $ext;
    while (file_exists($worksDir . '/' . $filename)) {
        $filename = $stem . '-' . $n . $ext;
        $n++;
    }
    if (@file_put_contents($worksDir . '/' . $filename, $raw) === false) {
        throw new Exception('не удалось сохранить файл (проверьте права на запись)');
    }
    return 'assets/works/' . $filename;
}

// ---------- маршруты ----------
$action = val($_GET, 'action', '');
$method = val($_SERVER, 'REQUEST_METHOD', 'GET');

if ($method === 'GET') {
    if ($action === 'ping') {
        send(200, array('ok' => true, 'mode' => 'remote', 'configured' => $configured && !need_config(), 'missing' => $configured ? need_config() : array('config.php')));
    }
    if ($action === 'me') {
        $u = current_user();
        send(200, array('ok' => true, 'mode' => 'remote', 'auth' => (bool) $u, 'user' => $u, 'configured' => $configured && !need_config()));
    }
    send(404, array('ok' => false, 'error' => 'неизвестный запрос'));
}

if ($method === 'POST') {
    try {
        if (!$configured) send(503, array('ok' => false, 'error' => 'Админка не настроена: нет config.php на сервере'));
        $missing = need_config();
        if ($missing) send(503, array('ok' => false, 'error' => 'Админка не настроена: не заданы ' . implode(', ', $missing)));
        if (!csrf_ok()) send(403, array('ok' => false, 'error' => 'запрос отклонён'));

        if ($action === 'login') {
            $d = read_body(10000);
            $okLogin = hash_equals(ADMIN_LOGIN, (string) val($d, 'login', ''));
            $okPass = verify_password((string) val($d, 'password', ''), ADMIN_PASSWORD_HASH);
            if (!($okLogin && $okPass)) {
                usleep(1000000); // замедляем перебор пароля
                send(401, array('ok' => false, 'error' => 'неверный логин или пароль'));
            }
            $token = make_token(ADMIN_LOGIN, SESSION_SECRET);
            $cookie = COOKIE_NAME . '=' . $token . '; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=' . SESSION_TTL;
            send(200, array('ok' => true), $cookie);
        }
        if ($action === 'logout') {
            send(200, array('ok' => true), COOKIE_NAME . '=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0');
        }
        if (!current_user()) send(401, array('ok' => false, 'error' => 'нужно войти'));

        if ($action === 'save') {
            $d = read_body(MAX_JSON + 100000);
            $projects = val($d, 'projects');
            validate_projects($projects);
            save_projects($projects, $GLOBALS['DATA_JS']);
            send(200, array('ok' => true, 'count' => count($projects)));
        }
        if ($action === 'upload') {
            $d = read_body(4400000);
            $path = upload_image(val($d, 'name'), val($d, 'dataUrl', ''), $GLOBALS['WORKS_DIR']);
            send(200, array('ok' => true, 'path' => $path));
        }
        send(404, array('ok' => false, 'error' => 'неизвестный запрос'));
    } catch (Exception $e) {
        send(400, array('ok' => false, 'error' => $e->getMessage()));
    }
}

send(405, array('ok' => false, 'error' => 'метод не поддерживается'));
