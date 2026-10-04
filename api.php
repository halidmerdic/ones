<?php
declare(strict_types=1);
require_once __DIR__ . '/backup-validation.php';

function request_host(): string
{
    $host = strtolower(trim((string)($_SERVER['HTTP_HOST'] ?? '')));
    if ($host === '') {
        return '';
    }
    if ($host[0] === '[') {
        $closingBracket = strpos($host, ']');
        return $closingBracket === false ? $host : substr($host, 1, $closingBracket - 1);
    }

    return preg_replace('/:\d+$/', '', $host) ?? $host;
}

function is_local_host(string $host): bool
{
    return $host === '' || $host === '127.0.0.1' || $host === 'localhost' || $host === '::1';
}

function is_local_request(string $host): bool
{
    if (!is_local_host($host)) {
        return false;
    }
    if (PHP_SAPI === 'cli') {
        return true;
    }

    $remoteAddress = trim((string)($_SERVER['REMOTE_ADDR'] ?? ''));
    return $remoteAddress === '127.0.0.1' || $remoteAddress === '::1';
}

function network_config_list(array $config, string $key, string $environmentName): array
{
    $environmentValue = getenv($environmentName);
    $networkConfig = is_array($config['network'] ?? null) ? $config['network'] : [];
    $value = is_string($environmentValue) && trim($environmentValue) !== ''
        ? preg_split('/\s*,\s*/', trim($environmentValue))
        : ($networkConfig[$key] ?? []);

    if (is_string($value)) {
        $value = preg_split('/\s*,\s*/', trim($value));
    }
    if (!is_array($value)) {
        return [];
    }

    return array_values(array_filter(array_map(
        static fn($item): string => trim((string)$item),
        $value
    ), static fn(string $item): bool => $item !== ''));
}

function ip_in_cidr(string $ip, string $cidr): bool
{
    if (!filter_var($ip, FILTER_VALIDATE_IP)) {
        return false;
    }

    $parts = explode('/', trim($cidr), 2);
    $network = $parts[0] ?? '';
    if (!filter_var($network, FILTER_VALIDATE_IP)) {
        return false;
    }

    $ipBinary = inet_pton($ip);
    $networkBinary = inet_pton($network);
    if ($ipBinary === false || $networkBinary === false || strlen($ipBinary) !== strlen($networkBinary)) {
        return false;
    }

    $bitLength = strlen($ipBinary) * 8;
    $prefixLength = count($parts) === 2 && preg_match('/^\d+$/', $parts[1])
        ? (int)$parts[1]
        : $bitLength;
    if ($prefixLength < 0 || $prefixLength > $bitLength) {
        return false;
    }

    $wholeBytes = intdiv($prefixLength, 8);
    if ($wholeBytes > 0 && substr($ipBinary, 0, $wholeBytes) !== substr($networkBinary, 0, $wholeBytes)) {
        return false;
    }

    $remainingBits = $prefixLength % 8;
    if ($remainingBits === 0) {
        return true;
    }

    $mask = (0xff << (8 - $remainingBits)) & 0xff;
    return (ord($ipBinary[$wholeBytes]) & $mask) === (ord($networkBinary[$wholeBytes]) & $mask);
}

function is_trusted_proxy(array $config, string $ip): bool
{
    foreach (network_config_list($config, 'trusted_proxies', 'ONES_TRUSTED_PROXIES') as $trustedProxy) {
        if (ip_in_cidr($ip, $trustedProxy)) {
            return true;
        }
    }

    return false;
}

function request_is_https(array $config): bool
{
    $https = strtolower(trim((string)($_SERVER['HTTPS'] ?? '')));
    if (($https !== '' && $https !== 'off' && $https !== '0') || (string)($_SERVER['SERVER_PORT'] ?? '') === '443') {
        return true;
    }

    $remoteAddress = trim((string)($_SERVER['REMOTE_ADDR'] ?? ''));
    if (!is_trusted_proxy($config, $remoteAddress)) {
        return false;
    }

    $forwardedProto = strtolower(trim(explode(',', (string)($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? ''))[0]));
    if ($forwardedProto === 'https') {
        return true;
    }

    $cfVisitor = json_decode((string)($_SERVER['HTTP_CF_VISITOR'] ?? ''), true);
    return is_array($cfVisitor) && strtolower((string)($cfVisitor['scheme'] ?? '')) === 'https';
}

function client_ip(?array $runtimeConfig = null): string
{
    if ($runtimeConfig === null) {
        global $config;
        $runtimeConfig = is_array($config ?? null) ? $config : [];
    }

    $remoteAddress = trim((string)($_SERVER['REMOTE_ADDR'] ?? ''));
    if (!filter_var($remoteAddress, FILTER_VALIDATE_IP)) {
        return 'unknown';
    }

    if (is_trusted_proxy($runtimeConfig, $remoteAddress)) {
        $cloudflareAddress = trim((string)($_SERVER['HTTP_CF_CONNECTING_IP'] ?? ''));
        if (filter_var($cloudflareAddress, FILTER_VALIDATE_IP)) {
            return $cloudflareAddress;
        }
    }

    return $remoteAddress;
}

$host = request_host();
$isLocalHost = is_local_request($host);
$configPath = file_exists(__DIR__ . '/config.local.php')
    ? __DIR__ . '/config.local.php'
    : (file_exists(__DIR__ . '/config.php') ? __DIR__ . '/config.php' : '');

if ($configPath === '' && !$isLocalHost) {
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store, no-cache, must-revalidate, private');
    http_response_code(500);
    echo json_encode([
        'ok' => false,
        'message' => 'Nedostaje config.local.php na hostingu. Aplikacija nije spojena na MySQL bazu.',
    ], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    exit;
}

$config = $configPath !== '' ? require $configPath : require __DIR__ . '/config.example.php';

$allowedHosts = array_map('strtolower', network_config_list(
    is_array($config) ? $config : [],
    'allowed_hosts',
    'ONES_ALLOWED_HOSTS'
));
if (!$isLocalHost && $allowedHosts === []) {
    $allowedHosts = ['ones.ba', 'www.ones.ba'];
}
if (!$isLocalHost && !in_array($host, $allowedHosts, true)) {
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store, no-cache, must-revalidate, private');
    http_response_code(400);
    echo json_encode(['ok' => false, 'message' => 'Neispravan host zahtjeva.'], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    exit;
}

if (!$isLocalHost && strtolower((string)($config['database']['driver'] ?? '')) !== 'mysql') {
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store, no-cache, must-revalidate, private');
    http_response_code(500);
    echo json_encode([
        'ok' => false,
        'message' => 'Hosting config nije podešen na MySQL. Provjerite config.local.php i driver postavite na mysql.',
    ], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    exit;
}

ini_set('session.gc_maxlifetime', (string)(60 * 60 * 24 * 7));
ini_set('session.use_strict_mode', '1');
ini_set('session.use_only_cookies', '1');
if ($isLocalHost) {
    ini_set('session.save_path', sys_get_temp_dir());
}
session_name('ones_session');
session_set_cookie_params([
    'lifetime' => 60 * 60 * 24 * 7,
    'path' => '/',
    'secure' => request_is_https(is_array($config) ? $config : []),
    'httponly' => true,
    'samesite' => 'Lax',
]);
session_start();

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, private');
header('Pragma: no-cache');
header('Expires: 0');

$action = $_GET['action'] ?? '';

function respond($data, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    exit;
}

function body_json(): array
{
    $maxBytes = 2 * 1024 * 1024;
    $contentLength = (int)($_SERVER['CONTENT_LENGTH'] ?? 0);
    if ($contentLength > $maxBytes) {
        respond(['ok' => false, 'message' => 'Zahtjev je prevelik. Maksimalna veličina je 2 MB.'], 413);
    }

    $raw = file_get_contents('php://input');
    if ($raw === false || trim($raw) === '') {
        return [];
    }
    if (strlen($raw) > $maxBytes) {
        respond(['ok' => false, 'message' => 'Zahtjev je prevelik. Maksimalna veličina je 2 MB.'], 413);
    }

    $data = json_decode($raw, true);
    if (!is_array($data) || json_last_error() !== JSON_ERROR_NONE) {
        respond(['ok' => false, 'message' => 'Neispravan JSON.'], 400);
    }

    return $data;
}

function csrf_token(): string
{
    if (empty($_SESSION['csrf_token']) || !is_string($_SESSION['csrf_token'])) {
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
    }

    return $_SESSION['csrf_token'];
}

function require_post_with_csrf(): void
{
    if (strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET')) !== 'POST') {
        header('Allow: POST');
        respond(['ok' => false, 'message' => 'Ova akcija zahtijeva POST zahtjev.'], 405);
    }

    $provided = (string)($_SERVER['HTTP_X_CSRF_TOKEN'] ?? '');
    if ($provided === '' || !hash_equals(csrf_token(), $provided)) {
        respond(['ok' => false, 'message' => 'Sigurnosni token nije ispravan. Osvježite stranicu i pokušajte ponovo.'], 403);
    }
}

function cleanup_request_limits(PDO $pdo): void
{
    $cleanup = $pdo->prepare('DELETE FROM request_limits WHERE created_at < :cutoff');
    $cleanup->execute([':cutoff' => date('c', time() - 60 * 60 * 24 * 2)]);
}

function request_limit_count(PDO $pdo, string $action, string $identifier, int $windowSeconds): int
{
    $stmt = $pdo->prepare('SELECT COUNT(*) FROM request_limits WHERE action = :action AND identifier = :identifier AND created_at >= :cutoff');
    $stmt->execute([
        ':action' => $action,
        ':identifier' => $identifier,
        ':cutoff' => date('c', time() - $windowSeconds),
    ]);
    return (int)$stmt->fetchColumn();
}

function record_request_limit(PDO $pdo, string $action, string $identifier): void
{
    $stmt = $pdo->prepare('INSERT INTO request_limits (action, identifier, created_at) VALUES (:action, :identifier, :created_at)');
    $stmt->execute([':action' => $action, ':identifier' => $identifier, ':created_at' => date('c')]);
}

function clear_request_limit(PDO $pdo, string $action, string $identifier): void
{
    $stmt = $pdo->prepare('DELETE FROM request_limits WHERE action = :action AND identifier = :identifier');
    $stmt->execute([':action' => $action, ':identifier' => $identifier]);
}

function require_request_limit_available(PDO $pdo, string $action, string $identifier, int $maxAttempts, int $windowSeconds, string $message): void
{
    cleanup_request_limits($pdo);
    if (request_limit_count($pdo, $action, $identifier, $windowSeconds) >= $maxAttempts) {
        header('Retry-After: ' . $windowSeconds);
        respond(['ok' => false, 'message' => $message], 429);
    }
}

function reject_honeypot(array $body): void
{
    foreach (['website', 'company', 'homepage'] as $field) {
        if (trim((string)($body[$field] ?? '')) !== '') {
            respond(['ok' => false, 'message' => 'Zahtjev nije prihvaćen. Pokušajte ponovo.'], 400);
        }
    }
}

function require_action_rate_limit(PDO $pdo, string $action, string $identifier, int $maxAttempts, int $windowSeconds, string $message): void
{
    require_request_limit_available($pdo, $action, $identifier, $maxAttempts, $windowSeconds, $message);
    record_request_limit($pdo, $action, $identifier);
}

function login_identifier(string $ip, string $account = ''): string
{
    $normalizedAccount = strtolower(trim($account));
    return hash('sha256', $ip . '|' . $normalizedAccount);
}

function password_max_length(): int
{
    return 72;
}

function password_validation_error(string $password, bool $admin = false): ?string
{
    $minimumLength = 15;
    $maximumLength = password_max_length();
    if (strlen($password) < $minimumLength) {
        return ($admin ? 'Nova admin lozinka' : 'Lozinka') . ' mora imati najmanje ' . $minimumLength . ' znakova.';
    }
    if (strlen($password) > $maximumLength) {
        return ($admin ? 'Nova admin lozinka' : 'Lozinka') . ' smije imati najviše ' . $maximumLength . ' znakova.';
    }

    $normalized = strtolower(trim($password));
    $blocked = [
        '123456789012345',
        'administrator123',
        'lozinkalozinka',
        'passwordpassword',
        'qwertyuiop12345',
        'onesadmin',
        'onesadmin123456',
    ];
    if (in_array($normalized, $blocked, true) || preg_match('/^(.)\1{14,}$/su', $password)) {
        return 'Odaberite sigurniju lozinku koja nije česta niti lako pogodiva.';
    }

    return null;
}

function hash_password(string $password): string
{
    $hash = password_hash($password, PASSWORD_DEFAULT);
    if (!is_string($hash) || $hash === '') {
        throw new RuntimeException('Lozinka nije mogla biti sigurno sačuvana.');
    }
    return $hash;
}

function verify_user_password(string $password, ?array $user): bool
{
    static $dummyHash = null;
    if ($dummyHash === null) {
        $dummyHash = hash_password(bin2hex(random_bytes(16)));
    }

    $hash = is_array($user) ? (string)($user['password_hash'] ?? '') : '';
    return password_verify($password, $hash !== '' ? $hash : $dummyHash);
}

function rehash_password_if_needed(PDO $pdo, array $user, string $password): void
{
    $hash = (string)($user['password_hash'] ?? '');
    if ($hash === '' || !password_needs_rehash($hash, PASSWORD_DEFAULT)) {
        return;
    }

    $stmt = $pdo->prepare('UPDATE users SET password_hash = :password_hash WHERE id = :id');
    $stmt->execute([':password_hash' => hash_password($password), ':id' => (int)$user['id']]);
}

function is_unique_constraint_violation(PDOException $error): bool
{
    $sqlState = (string)$error->getCode();
    if (in_array($sqlState, ['23000', '23505'], true)) {
        return true;
    }

    $message = strtolower($error->getMessage());
    return strpos($message, 'unique constraint') !== false || strpos($message, 'duplicate entry') !== false;
}

function default_cms(): array
{
    return [
        'contact' => [
            'whatsapp' => '062455779',
            'viber' => '062455779',
            'email' => 'info@fontele.ba',
            'defaultMessage' => 'Pozdrav, zanima me oneS proizvod.',
            'orderMessageTemplate' => "Pozdrav {ime}, javljamo se povodom oneS upita #{broj_upita}.\n\nStatus: {status}\nArtikli:\n{artikli}",
            'viberMessageTemplate' => 'Pozdrav {ime}, javljamo se povodom oneS upita #{broj_upita}. Status: {status}.',
            'emailSubjectTemplate' => 'oneS upit #{broj_upita}',
            'emailBodyTemplate' => "Pozdrav {ime},\n\nJavljamo se povodom oneS upita #{broj_upita}.\n\nStatus: {status}\n\nArtikli:\n{artikli}\n\nSrdačan pozdrav,\noneS",
            'customerMessageTemplate' => 'Pozdrav {ime}, javljamo se iz oneS podrške.',
            'customerEmailSubjectTemplate' => 'oneS podrška',
            'customerEmailBodyTemplate' => "Pozdrav {ime},\n\nJavljamo se iz oneS podrške.\n\nSrdačan pozdrav,\noneS",
        ],
        'sections' => [
            'hero' => true,
            'trust' => true,
            'categories' => true,
            'categoryShowcase' => false,
            'products' => true,
            'comingSoon' => true,
            'comingSoonShowcase' => false,
            'comparison' => true,
            'service' => true,
            'parts' => true,
            'manuals' => true,
            'delivery' => true,
            'locations' => true,
            'blog' => true,
            'faq' => true,
            'contact' => true,
            'footer' => true,
        ],
        'settings' => [
            'productGridColumns' => 4,
        ],
        'launchChecklist' => [
            ['id' => 'products', 'label' => 'Proizvodi provjereni', 'done' => false],
            ['id' => 'prices', 'label' => 'Cijene, MPC, akcije i rokovi provjereni', 'done' => false],
            ['id' => 'images', 'label' => 'Slike proizvoda i bloga dodane', 'done' => false],
            ['id' => 'manuals', 'label' => 'Manuali/uputstva dodani i povezani', 'done' => false],
            ['id' => 'locations', 'label' => 'Poslovnice i kontakt podaci provjereni', 'done' => false],
            ['id' => 'faq', 'label' => 'FAQ i podrška provjereni', 'done' => false],
            ['id' => 'seo', 'label' => 'SEO naslovi, opisi, sitemap i robots provjereni', 'done' => false],
            ['id' => 'customer', 'label' => 'Test registracije i prijave kupca prošao', 'done' => false],
            ['id' => 'cart', 'label' => 'Test korpe i količina prošao', 'done' => false],
            ['id' => 'orders', 'label' => 'Test slanja upita i CMS narudžbi prošao', 'done' => false],
            ['id' => 'mobile', 'label' => 'Mobile pregled prošao', 'done' => false],
            ['id' => 'backup', 'label' => 'Finalni backup preuzet', 'done' => false],
        ],
        'categories' => [
            ['name' => 'Električni romobili', 'text' => 'oneS F3 modeli za gradsku vožnju, svakodnevne relacije i praktično kretanje.'],
            ['name' => 'Rezervni dijelovi', 'text' => 'Dijelovi i dodaci za servisnu podršku. Ponuda stiže uskoro.'],
            ['name' => 'Proizvodi uskoro', 'text' => 'Najave novih kategorija i artikala koji dolaze u oneS katalog.'],
        ],
        'badges' => [
            ['name' => '-', 'enabled' => true],
            ['name' => 'Novo', 'enabled' => true],
            ['name' => 'Popularno', 'enabled' => true],
            ['name' => 'Uskoro', 'enabled' => true],
            ['name' => 'Akcija', 'enabled' => true],
        ],
        'products' => [
            [
                'id' => 'scooter-f3',
                'name' => 'oneS F3 električni romobil',
                'category' => 'Električni romobili',
                'status' => 'Dostupno',
                'badge' => 'Popularno',
                'tone' => 'red',
                'specs' => ['Domet' => 'do 30 km', 'Brzina' => 'do 25 km/h', 'Baterija' => '36 V', 'Garancija' => 'preko prodavnice'],
                'summary' => 'Praktičan gradski romobil za svakodnevne relacije, posao i kratke vožnje.',
            ],
        ],
        'comingSoon' => [
            ['name' => 'Rezervni dijelovi za romobile', 'text' => 'Gume, punjači, kočioni dijelovi i drugi servisni dodaci biće prikazani kao posebna ponuda.'],
        ],
        'parts' => [
            ['name' => 'Punjači za romobile', 'text' => 'U pripremi za servisnu i dodatnu prodaju.'],
            ['name' => 'Gume i potrošni dijelovi', 'text' => 'Planirano za oneS električne romobile.'],
        ],
        'manuals' => [
            ['title' => 'oneS F3 električni romobil', 'type' => 'PDF manual', 'status' => 'Dodati dokument'],
        ],
        'locations' => [
            ['name' => 'oneS partner Sarajevo', 'address' => 'Adresa prodavnice se dodaje u CMS', 'hours' => 'Pon - Sub, radno vrijeme dodati'],
            ['name' => 'oneS partner Mostar', 'address' => 'Adresa prodavnice se dodaje u CMS', 'hours' => 'Pon - Sub, radno vrijeme dodati'],
            ['name' => 'Online upit', 'address' => 'WhatsApp i Viber podrška za dostupnost', 'hours' => 'Odgovor u radnom vremenu'],
        ],
        'blogs' => [
            ['id' => 'kako-odabrati-elektricni-romobil', 'title' => 'Kako odabrati električni romobil za gradsku vožnju', 'text' => 'Savjeti o dometu, brzini, bateriji, težini i održavanju.', 'tag' => 'Romobili', 'enabled' => true],
        ],
        'faq' => [
            ['q' => 'Da li mogu kupiti direktno na stranici?', 'a' => 'Trenutno ne. Stranica radi kao katalog, a narudžbe i dostupnost se potvrđuju putem WhatsAppa, Vibera ili prodavnice.'],
            ['q' => 'Kako se potvrđuje cijena proizvoda?', 'a' => 'Cijena se potvrđuje prilikom upita, jer zavisi od dostupnosti, prodavnice i eventualnih promocija.'],
            ['q' => 'Gdje se dobija garancija?', 'a' => 'Garancija se dobija u prodavnici uz račun i prateću dokumentaciju proizvoda.'],
            ['q' => 'Da li će stranica imati engleski jezik?', 'a' => 'Prva verzija je na bosanskom jeziku, a engleska verzija je planirana kasnije.'],
            ['q' => 'Da li rezervni dijelovi postoje u ponudi?', 'a' => 'Stranica za rezervne dijelove je pripremljena, a artikli će biti označeni kao uskoro dok ponuda ne bude spremna.'],
        ],
    ];
}

function database_driver(PDO $pdo): string
{
    return (string)$pdo->getAttribute(PDO::ATTR_DRIVER_NAME);
}

function quote_identifier(PDO $pdo, string $identifier): string
{
    $safe = str_replace(['`', '"'], '', $identifier);
    return database_driver($pdo) === 'mysql' ? '`' . $safe . '`' : '"' . $safe . '"';
}

function has_column(PDO $pdo, string $table, string $column): bool
{
    if (database_driver($pdo) === 'mysql') {
        $stmt = $pdo->prepare('SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :table_name AND COLUMN_NAME = :column_name');
        $stmt->execute([
            ':table_name' => $table,
            ':column_name' => $column,
        ]);
        return (int)$stmt->fetchColumn() > 0;
    }

    $columns = $pdo->query('PRAGMA table_info(' . quote_identifier($pdo, $table) . ')')->fetchAll(PDO::FETCH_ASSOC);
    foreach ($columns as $existingColumn) {
        if (($existingColumn['name'] ?? '') === $column) {
            return true;
        }
    }

    return false;
}

function has_index(PDO $pdo, string $table, string $index): bool
{
    if (database_driver($pdo) === 'mysql') {
        $stmt = $pdo->prepare('SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :table_name AND INDEX_NAME = :index_name');
        $stmt->execute([':table_name' => $table, ':index_name' => $index]);
        return (int)$stmt->fetchColumn() > 0;
    }

    $indexes = $pdo->query('PRAGMA index_list(' . quote_identifier($pdo, $table) . ')')->fetchAll(PDO::FETCH_ASSOC);
    foreach ($indexes as $existingIndex) {
        if (($existingIndex['name'] ?? '') === $index) {
            return true;
        }
    }
    return false;
}

function ensure_cart_item_uniqueness(PDO $pdo): void
{
    if (has_index($pdo, 'cart_items', 'cart_product')) {
        return;
    }

    $duplicates = $pdo->query('SELECT cart_id, product_id, MIN(id) AS keep_id, SUM(quantity) AS total_quantity, COUNT(*) AS row_count FROM cart_items GROUP BY cart_id, product_id HAVING COUNT(*) > 1')->fetchAll(PDO::FETCH_ASSOC);
    $update = $pdo->prepare('UPDATE cart_items SET quantity = :quantity WHERE id = :id');
    $delete = $pdo->prepare('DELETE FROM cart_items WHERE cart_id = :cart_id AND product_id = :product_id AND id <> :keep_id');
    foreach ($duplicates as $duplicate) {
        $quantity = max(1, min(99, (int)$duplicate['total_quantity']));
        $update->execute([':quantity' => $quantity, ':id' => (int)$duplicate['keep_id']]);
        $delete->execute([
            ':cart_id' => (int)$duplicate['cart_id'],
            ':product_id' => (string)$duplicate['product_id'],
            ':keep_id' => (int)$duplicate['keep_id'],
        ]);
    }

    $pdo->exec('CREATE UNIQUE INDEX ' . quote_identifier($pdo, 'cart_product') . ' ON cart_items (cart_id, product_id)');
}

function consolidate_cart_item_rows(array $rows): array
{
    $result = [];
    $positions = [];
    foreach ($rows as $row) {
        if (!is_array($row)) {
            continue;
        }
        $cartId = (int)($row['cart_id'] ?? 0);
        $productId = trim((string)($row['product_id'] ?? ''));
        if ($cartId < 1 || $productId === '') {
            $result[] = $row;
            continue;
        }

        $key = $cartId . ':' . $productId;
        if (!array_key_exists($key, $positions)) {
            $positions[$key] = count($result);
            $row['quantity'] = max(1, min(99, (int)($row['quantity'] ?? 1)));
            $result[] = $row;
            continue;
        }

        $position = $positions[$key];
        $result[$position]['quantity'] = min(99, (int)$result[$position]['quantity'] + max(1, (int)($row['quantity'] ?? 1)));
    }
    return $result;
}

final class CmsRevisionConflict extends RuntimeException
{
}

final class OrderSubmissionConflict extends RuntimeException
{
}

function database(array $config): PDO
{
    $databaseConfig = is_array($config['database'] ?? null) ? $config['database'] : [];
    $driver = strtolower((string)($databaseConfig['driver'] ?? 'sqlite'));

    if ($driver === 'mysql') {
        $host = (string)($databaseConfig['host'] ?? '');
        $port = (string)($databaseConfig['port'] ?? '3306');
        $name = (string)($databaseConfig['name'] ?? '');
        $user = (string)($databaseConfig['user'] ?? '');
        $password = (string)($databaseConfig['password'] ?? '');

        if ($host === '' || $name === '' || $user === '') {
            respond(['ok' => false, 'message' => 'MySQL config nije popunjen. Provjerite config.local.php.'], 500);
        }

        $dsn = 'mysql:host=' . $host . ';port=' . $port . ';dbname=' . $name . ';charset=utf8mb4';
        $pdo = new PDO($dsn, $user, $password, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
            PDO::ATTR_TIMEOUT => 5,
        ]);
        $pdo->exec('CREATE TABLE IF NOT EXISTS cms_store (`key` VARCHAR(64) PRIMARY KEY, `value` LONGTEXT NOT NULL, updated_at VARCHAR(64) NOT NULL, revision INT UNSIGNED NOT NULL DEFAULT 1) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
        $pdo->exec('CREATE TABLE IF NOT EXISTS cms_revisions (id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT, revision INT UNSIGNED NOT NULL, value LONGTEXT NOT NULL, created_at VARCHAR(64) NOT NULL, INDEX(revision)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
        $pdo->exec('CREATE TABLE IF NOT EXISTS users (id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT, name VARCHAR(190) NOT NULL, email VARCHAR(190) NOT NULL UNIQUE, password_hash VARCHAR(255) NOT NULL, role VARCHAR(40) NOT NULL DEFAULT "customer", created_at VARCHAR(64) NOT NULL, phone VARCHAR(80) NOT NULL DEFAULT "", privacy_accepted_at VARCHAR(64) NOT NULL DEFAULT "", auth_version INT UNSIGNED NOT NULL DEFAULT 0) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
        $pdo->exec('CREATE TABLE IF NOT EXISTS carts (id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT, user_id INT UNSIGNED NOT NULL, status VARCHAR(40) NOT NULL DEFAULT "active", created_at VARCHAR(64) NOT NULL, updated_at VARCHAR(64) NOT NULL, INDEX(user_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
        $pdo->exec('CREATE TABLE IF NOT EXISTS cart_items (id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT, cart_id INT UNSIGNED NOT NULL, product_id VARCHAR(190) NOT NULL, quantity INT UNSIGNED NOT NULL DEFAULT 1, created_at VARCHAR(64) NOT NULL, UNIQUE KEY cart_product (cart_id, product_id), INDEX(cart_id), INDEX(product_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
        $pdo->exec('CREATE TABLE IF NOT EXISTS product_favorites (id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT, user_id INT UNSIGNED NOT NULL, product_id VARCHAR(190) NOT NULL, created_at VARCHAR(64) NOT NULL, UNIQUE KEY user_product (user_id, product_id), INDEX(user_id), INDEX(product_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
        $pdo->exec('CREATE TABLE IF NOT EXISTS orders (id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT, user_id INT UNSIGNED NOT NULL, customer_name VARCHAR(190) NOT NULL, customer_email VARCHAR(190) NOT NULL, phone VARCHAR(80) NOT NULL DEFAULT "", note TEXT NOT NULL, status VARCHAR(40) NOT NULL DEFAULT "Novo", items_json LONGTEXT NOT NULL, created_at VARCHAR(64) NOT NULL, updated_at VARCHAR(64) NOT NULL, admin_note VARCHAR(1000) NOT NULL DEFAULT "", INDEX(user_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
        $pdo->exec('CREATE TABLE IF NOT EXISTS request_limits (id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT, action VARCHAR(80) NOT NULL, identifier VARCHAR(190) NOT NULL, created_at VARCHAR(64) NOT NULL, INDEX action_identifier_created (action, identifier, created_at)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
    } else {
        $dbPath = (string)($databaseConfig['sqlite_path'] ?? (__DIR__ . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'ones.sqlite'));
        $dir = dirname($dbPath);
        if (!is_dir($dir)) {
            mkdir($dir, 0775, true);
        }

        $pdo = new PDO('sqlite:' . $dbPath);
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
        $pdo->exec('PRAGMA busy_timeout = 5000');
        $pdo->exec('PRAGMA foreign_keys = ON');
        $pdo->exec('CREATE TABLE IF NOT EXISTS cms_store (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1)');
        $pdo->exec('CREATE TABLE IF NOT EXISTS cms_revisions (id INTEGER PRIMARY KEY AUTOINCREMENT, revision INTEGER NOT NULL, value TEXT NOT NULL, created_at TEXT NOT NULL)');
        $pdo->exec('CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT "customer", created_at TEXT NOT NULL, privacy_accepted_at TEXT NOT NULL DEFAULT "", auth_version INTEGER NOT NULL DEFAULT 0)');
        $pdo->exec('CREATE TABLE IF NOT EXISTS carts (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, status TEXT NOT NULL DEFAULT "active", created_at TEXT NOT NULL, updated_at TEXT NOT NULL, FOREIGN KEY(user_id) REFERENCES users(id))');
        $pdo->exec('CREATE TABLE IF NOT EXISTS cart_items (id INTEGER PRIMARY KEY AUTOINCREMENT, cart_id INTEGER NOT NULL, product_id TEXT NOT NULL, quantity INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, FOREIGN KEY(cart_id) REFERENCES carts(id))');
        $pdo->exec('CREATE TABLE IF NOT EXISTS product_favorites (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, product_id TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(user_id, product_id), FOREIGN KEY(user_id) REFERENCES users(id))');
        $pdo->exec('CREATE TABLE IF NOT EXISTS orders (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, customer_name TEXT NOT NULL, customer_email TEXT NOT NULL, phone TEXT NOT NULL DEFAULT "", note TEXT NOT NULL DEFAULT "", status TEXT NOT NULL DEFAULT "Novo", items_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, FOREIGN KEY(user_id) REFERENCES users(id))');
        $pdo->exec('CREATE TABLE IF NOT EXISTS request_limits (id INTEGER PRIMARY KEY AUTOINCREMENT, action TEXT NOT NULL, identifier TEXT NOT NULL, created_at TEXT NOT NULL)');
    }

    if (!has_column($pdo, 'users', 'phone')) {
        $pdo->exec(database_driver($pdo) === 'mysql'
            ? 'ALTER TABLE users ADD COLUMN phone VARCHAR(80) NOT NULL DEFAULT ""'
            : 'ALTER TABLE users ADD COLUMN phone TEXT NOT NULL DEFAULT ""');
    }
    if (!has_column($pdo, 'users', 'privacy_accepted_at')) {
        $pdo->exec(database_driver($pdo) === 'mysql'
            ? 'ALTER TABLE users ADD COLUMN privacy_accepted_at VARCHAR(64) NOT NULL DEFAULT ""'
            : 'ALTER TABLE users ADD COLUMN privacy_accepted_at TEXT NOT NULL DEFAULT ""');
    }
    if (!has_column($pdo, 'users', 'auth_version')) {
        $pdo->exec(database_driver($pdo) === 'mysql'
            ? 'ALTER TABLE users ADD COLUMN auth_version INT UNSIGNED NOT NULL DEFAULT 0'
            : 'ALTER TABLE users ADD COLUMN auth_version INTEGER NOT NULL DEFAULT 0');
    }
    if (!has_column($pdo, 'cms_store', 'revision')) {
        $pdo->exec(database_driver($pdo) === 'mysql'
            ? 'ALTER TABLE cms_store ADD COLUMN revision INT UNSIGNED NOT NULL DEFAULT 1'
            : 'ALTER TABLE cms_store ADD COLUMN revision INTEGER NOT NULL DEFAULT 1');
    }
    if (!has_column($pdo, 'orders', 'admin_note')) {
        $pdo->exec(database_driver($pdo) === 'mysql'
            ? 'ALTER TABLE orders ADD COLUMN admin_note VARCHAR(1000) NOT NULL DEFAULT ""'
            : 'ALTER TABLE orders ADD COLUMN admin_note TEXT NOT NULL DEFAULT ""');
    }
    ensure_cart_item_uniqueness($pdo);
    initialize_auth_state($pdo);
    seed_database($pdo);
    return $pdo;
}

function seed_database(PDO $pdo): void
{
    global $config, $isLocalHost;

    $keyColumn = quote_identifier($pdo, 'key');
    $count = (int)$pdo->query('SELECT COUNT(*) FROM cms_store WHERE ' . $keyColumn . ' = "cms"')->fetchColumn();
    if ($count === 0) {
        $stmt = $pdo->prepare('INSERT INTO cms_store (' . $keyColumn . ', value, updated_at) VALUES ("cms", :value, :updated_at)');
        $stmt->execute([
            ':value' => json_encode(default_cms(), JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT),
            ':updated_at' => date('c'),
        ]);
    }

    $admin = $pdo->prepare('SELECT id, password_hash FROM users WHERE email = :email AND role = "admin" LIMIT 1');
    $admin->execute([':email' => 'admin@ones.local']);
    $adminUser = $admin->fetch(PDO::FETCH_ASSOC);
    if (!$adminUser) {
        $initialPassword = trim((string)($config['security']['initial_admin_password'] ?? ''));
        if ($isLocalHost && ($initialPassword === '' || $initialPassword === 'PROMIJENI-U-JAKU-LOZINKU')) {
            $initialPassword = 'onesadmin';
        }
        $passwordError = password_validation_error($initialPassword, true);
        if (!$isLocalHost && ($initialPassword === 'PROMIJENI-U-JAKU-LOZINKU' || $passwordError !== null)) {
            throw new RuntimeException('Prije prvog pokretanja postavite sigurnu security.initial_admin_password lozinku sa najmanje 15 znakova u config.local.php.');
        }

        $stmt = $pdo->prepare('INSERT INTO users (name, email, password_hash, role, created_at) VALUES (:name, :email, :password_hash, "admin", :created_at)');
        $stmt->execute([
            ':name' => 'oneS Admin',
            ':email' => 'admin@ones.local',
            ':password_hash' => hash_password($initialPassword),
            ':created_at' => date('c'),
        ]);
    }
}

function get_cms(PDO $pdo): array
{
    $stmt = $pdo->prepare('SELECT value FROM cms_store WHERE ' . quote_identifier($pdo, 'key') . ' = "cms"');
    $stmt->execute();
    $data = json_decode((string)$stmt->fetchColumn(), true);

    $defaults = default_cms();
    $cms = is_array($data) ? array_replace($defaults, $data) : $defaults;
    $cms['contact'] = array_replace($defaults['contact'], is_array($data['contact'] ?? null) ? $data['contact'] : []);
    $cms['sections'] = array_replace($defaults['sections'], is_array($data['sections'] ?? null) ? $data['sections'] : []);
    $cms['settings'] = array_replace($defaults['settings'], is_array($data['settings'] ?? null) ? $data['settings'] : []);
    foreach (['whatsapp', 'viber'] as $channel) {
        if (($cms['contact'][$channel] ?? '') === '38761000000') {
            $cms['contact'][$channel] = default_cms()['contact'][$channel];
        }
    }

    return cms_sanitize_content($cms);
}

function get_cms_revision(PDO $pdo): int
{
    $stmt = $pdo->prepare('SELECT revision FROM cms_store WHERE ' . quote_identifier($pdo, 'key') . ' = "cms"');
    $stmt->execute();
    return max(1, (int)$stmt->fetchColumn());
}

function cms_pick(array $item, array $keys): array
{
    $result = [];
    foreach ($keys as $key) {
        if (array_key_exists($key, $item)) {
            $result[$key] = $item[$key];
        }
    }
    return $result;
}

function public_cms(array $cms): array
{
    $publicSectionKeys = [
        'hero', 'trust', 'categories', 'categoryShowcase', 'products', 'comingSoon',
        'comingSoonShowcase', 'comparison', 'service', 'parts', 'manuals', 'delivery',
        'locations', 'blog', 'faq', 'contact', 'footer',
    ];
    $sections = [];
    foreach ($publicSectionKeys as $key) {
        $sections[$key] = ($cms['sections'][$key] ?? true) !== false;
    }

    $categories = [];
    $publicCategoryNames = [];
    foreach (($cms['categories'] ?? []) as $category) {
        if (!is_array($category) || ($category['enabled'] ?? true) === false || trim((string)($category['name'] ?? '')) === '') {
            continue;
        }
        $categories[] = cms_pick($category, ['name', 'text', 'badge', 'badgeUntil', 'attributes']);
        $publicCategoryNames[(string)$category['name']] = true;
    }

    $products = [];
    $publicProductIds = [];
    foreach (($cms['products'] ?? []) as $product) {
        if (!is_array($product) || ($product['enabled'] ?? true) === false || !isset($publicCategoryNames[(string)($product['category'] ?? '')])) {
            continue;
        }
        $products[] = cms_pick($product, [
            'id', 'name', 'category', 'status', 'badge', 'tone', 'price', 'mpcPrice',
            'discountPrice', 'salePrice', 'saleUntil', 'badgeUntil', 'deliveryTime',
            'image', 'gallery', 'specs', 'attributes', 'summary', 'detailedDescription',
            'seoTitle', 'seoDescription',
        ]);
        $publicProductIds[(string)($product['id'] ?? '')] = true;
    }

    $badges = [];
    foreach (($cms['badges'] ?? []) as $badge) {
        if (!is_array($badge) || ($badge['enabled'] ?? true) === false) {
            continue;
        }
        $applyCategory = trim((string)($badge['applyCategory'] ?? ''));
        if ($applyCategory !== '' && !isset($publicCategoryNames[$applyCategory])) {
            continue;
        }
        $badges[] = cms_pick($badge, ['name', 'applyCategory']);
    }

    $filterEnabled = static function ($item): bool {
        return is_array($item) && ($item['enabled'] ?? true) !== false;
    };
    $filterList = static function (array $items, array $keys) use ($filterEnabled): array {
        $result = [];
        foreach ($items as $item) {
            if ($filterEnabled($item)) {
                $result[] = cms_pick($item, $keys);
            }
        }
        return $result;
    };

    $manuals = [];
    foreach (($cms['manuals'] ?? []) as $manual) {
        if (!$filterEnabled($manual) || (string)($manual['visibility'] ?? 'Javno') !== 'Javno') {
            continue;
        }
        $relatedProductId = trim((string)($manual['relatedProductId'] ?? ''));
        $category = trim((string)($manual['category'] ?? ''));
        if ($relatedProductId !== '' && !isset($publicProductIds[$relatedProductId])) {
            continue;
        }
        if ($category !== '' && !isset($publicCategoryNames[$category])) {
            continue;
        }
        $manuals[] = cms_pick($manual, ['title', 'type', 'status', 'file', 'relatedProductId', 'category', 'visibility']);
    }

    return [
        'contact' => cms_pick(is_array($cms['contact'] ?? null) ? $cms['contact'] : [], ['whatsapp', 'viber', 'email', 'defaultMessage']),
        'sections' => $sections,
        'settings' => ['productGridColumns' => (int)($cms['settings']['productGridColumns'] ?? 4)],
        'categories' => $categories,
        'badges' => $badges,
        'products' => $products,
        'comingSoon' => $filterList(is_array($cms['comingSoon'] ?? null) ? $cms['comingSoon'] : [], ['name', 'text']),
        'parts' => $filterList(is_array($cms['parts'] ?? null) ? $cms['parts'] : [], ['name', 'text']),
        'manuals' => $manuals,
        'locations' => $filterList(is_array($cms['locations'] ?? null) ? $cms['locations'] : [], ['name', 'address', 'hours']),
        'blogs' => $filterList(is_array($cms['blogs'] ?? null) ? $cms['blogs'] : [], ['id', 'title', 'text', 'tag', 'image', 'seoTitle', 'seoDescription']),
        'faq' => $filterList(is_array($cms['faq'] ?? null) ? $cms['faq'] : [], ['q', 'a']),
    ];
}

function cms_text_length(string $value): int
{
    return function_exists('mb_strlen') ? mb_strlen($value, 'UTF-8') : strlen($value);
}

function cms_normalized_key(string $value): string
{
    $value = trim($value);
    return function_exists('mb_strtolower') ? mb_strtolower($value, 'UTF-8') : strtolower($value);
}

function cms_add_error(array &$errors, string $path, string $message): void
{
    if (count($errors) < 30) {
        $errors[] = $path . ': ' . $message;
    }
}

function cms_sanitize_rich_html(string $html): string
{
    static $purifier = null;
    if ($purifier === null) {
        require_once __DIR__ . '/vendor/htmlpurifier/library/HTMLPurifier.auto.php';
        $policy = HTMLPurifier_Config::createDefault();
        $policy->set('Core.Encoding', 'UTF-8');
        $policy->set('HTML.Doctype', 'HTML 4.01 Transitional');
        $policy->set('HTML.Allowed', 'p,div,br,strong,b,em,i,u,ul,ol,li,h2,h3,h4,a[href],blockquote,span,font[size]');
        $policy->set('URI.AllowedSchemes', ['http' => true, 'https' => true]);
        $policy->set('Cache.DefinitionImpl', null);
        $purifier = new HTMLPurifier($policy);
    }
    return $purifier->purify($html);
}

function cms_sanitize_content(array $cms): array
{
    foreach (['products' => 'detailedDescription', 'blogs' => 'text'] as $collection => $field) {
        foreach (is_array($cms[$collection] ?? null) ? $cms[$collection] : [] as $index => $item) {
            if (is_array($item) && isset($item[$field]) && is_string($item[$field])) {
                $cms[$collection][$index][$field] = cms_sanitize_rich_html($item[$field]);
            }
        }
    }
    return $cms;
}

function cms_safe_asset_reference(string $value): bool
{
    if ($value === '') {
        return true;
    }
    // Reject ambiguous browser URL parsing and HTML attribute delimiters.
    if (preg_match('/[\x00-\x20\x7f<>"\x27\x60\\\\]/', $value)
        || preg_match('~(^|/)\.\.(/|$)~', rawurldecode($value))
        || strpos($value, '//') === 0) {
        return false;
    }
    $parts = parse_url($value);
    if ($parts === false) {
        return false;
    }
    if (isset($parts['scheme'])) {
        return in_array(strtolower($parts['scheme']), ['http', 'https'], true)
            && !empty($parts['host']) && !isset($parts['user']) && !isset($parts['pass']);
    }
    return !preg_match('~^[^/?#]*:~', $value);
}

function cms_validate_string(array &$errors, $value, string $path, int $maxLength, bool $required = false, bool $richText = false): void
{
    if (!is_string($value)) {
        cms_add_error($errors, $path, 'mora biti tekst.');
        return;
    }
    if ($required && trim($value) === '') {
        cms_add_error($errors, $path, 'je obavezno polje.');
    }
    if (cms_text_length($value) > $maxLength) {
        cms_add_error($errors, $path, 'može imati najviše ' . $maxLength . ' znakova.');
    }
    if (preg_match('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/', $value)) {
        cms_add_error($errors, $path, 'sadrži nedozvoljene kontrolne znakove.');
    }
    if ($richText && preg_match('/<(script|style|iframe|object|embed|form|template)\b|\son[a-z]+\s*=|javascript\s*:/iu', $value)) {
        cms_add_error($errors, $path, 'sadrži nedozvoljen HTML sadržaj.');
    }
}

function cms_validate_optional_string(array &$errors, array $item, string $key, string $path, int $maxLength, bool $richText = false): void
{
    if (array_key_exists($key, $item)) {
        cms_validate_string($errors, $item[$key], $path . '.' . $key, $maxLength, false, $richText);
    }
}

function cms_validate_boolean(array &$errors, array $item, string $key, string $path): void
{
    if (array_key_exists($key, $item) && !is_bool($item[$key])) {
        cms_add_error($errors, $path . '.' . $key, 'mora biti uključeno ili isključeno.');
    }
}

function cms_validate_date(array &$errors, array $item, string $key, string $path): void
{
    if (!array_key_exists($key, $item) || $item[$key] === '') {
        return;
    }
    if (!is_string($item[$key]) || !preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $item[$key], $matches) || !checkdate((int)$matches[2], (int)$matches[3], (int)$matches[1])) {
        cms_add_error($errors, $path . '.' . $key, 'mora biti ispravan datum u formatu GGGG-MM-DD.');
    }
}

function cms_validate_asset_reference(array &$errors, array $item, string $key, string $path): void
{
    if (!array_key_exists($key, $item)) {
        return;
    }
    cms_validate_string($errors, $item[$key], $path . '.' . $key, 2048);
    if (!is_string($item[$key]) || trim($item[$key]) === '') {
        return;
    }
    $value = trim($item[$key]);
    if (!cms_safe_asset_reference($value)) {
        cms_add_error($errors, $path . '.' . $key, 'mora biti sigurna relativna putanja ili HTTP(S) adresa.');
    }
}

function cms_validate_price(array &$errors, array $item, string $key, string $path): void
{
    if (!array_key_exists($key, $item)) {
        return;
    }
    $value = $item[$key];
    $normalized = is_string($value) ? str_replace(',', '.', trim($value)) : $value;
    if ((!is_int($normalized) && !is_float($normalized) && !is_string($normalized)) || $normalized === '' || !is_numeric($normalized)) {
        cms_add_error($errors, $path . '.' . $key, 'mora biti broj.');
        return;
    }
    $number = (float)$normalized;
    if ($number < 0 || $number > 1000000000) {
        cms_add_error($errors, $path . '.' . $key, 'mora biti između 0 i 1.000.000.000.');
    }
}

function cms_validate_value_map(array &$errors, array $item, string $key, string $path): void
{
    if (!array_key_exists($key, $item)) {
        return;
    }
    if (!is_array($item[$key])) {
        cms_add_error($errors, $path . '.' . $key, 'mora biti lista vrijednosti.');
        return;
    }
    if (count($item[$key]) > 100) {
        cms_add_error($errors, $path . '.' . $key, 'može imati najviše 100 stavki.');
    }
    foreach ($item[$key] as $mapKey => $mapValue) {
        if (!is_string($mapKey) || trim($mapKey) === '' || cms_text_length($mapKey) > 120) {
            cms_add_error($errors, $path . '.' . $key, 'sadrži neispravan naziv stavke.');
            continue;
        }
        if (!is_string($mapValue) && !is_numeric($mapValue)) {
            cms_add_error($errors, $path . '.' . $key . '.' . $mapKey, 'mora biti tekst ili broj.');
            continue;
        }
        cms_validate_string($errors, (string)$mapValue, $path . '.' . $key . '.' . $mapKey, 2000);
    }
}

function cms_collection(array $cms, string $key, int $maxItems, array &$errors): array
{
    if (!array_key_exists($key, $cms) || !is_array($cms[$key])) {
        cms_add_error($errors, $key, 'mora biti lista.');
        return [];
    }
    if (count($cms[$key]) > $maxItems) {
        cms_add_error($errors, $key, 'može imati najviše ' . $maxItems . ' stavki.');
    }
    return $cms[$key];
}

function cms_validate_payload(array $cms): array
{
    $errors = [];
    $topLevelKeys = ['contact', 'sections', 'settings', 'launchChecklist', 'categories', 'badges', 'products', 'comingSoon', 'parts', 'manuals', 'locations', 'blogs', 'faq'];
    foreach (array_keys($cms) as $key) {
        if (!in_array($key, $topLevelKeys, true)) {
            cms_add_error($errors, (string)$key, 'nije dozvoljeno CMS polje.');
        }
    }

    $contact = is_array($cms['contact'] ?? null) ? $cms['contact'] : [];
    if (!$contact) {
        cms_add_error($errors, 'contact', 'mora biti objekat s kontakt podacima.');
    } else {
        $contactFields = [
            'whatsapp' => 40, 'viber' => 40, 'email' => 190, 'defaultMessage' => 2000,
            'orderMessageTemplate' => 10000, 'viberMessageTemplate' => 10000,
            'emailSubjectTemplate' => 500, 'emailBodyTemplate' => 20000,
            'customerMessageTemplate' => 10000, 'customerEmailSubjectTemplate' => 500,
            'customerEmailBodyTemplate' => 20000,
        ];
        foreach ($contactFields as $key => $maxLength) {
            if (array_key_exists($key, $contact)) {
                cms_validate_string($errors, $contact[$key], 'contact.' . $key, $maxLength, in_array($key, ['whatsapp', 'viber', 'email', 'defaultMessage'], true));
            } elseif (in_array($key, ['whatsapp', 'viber', 'email', 'defaultMessage'], true)) {
                cms_add_error($errors, 'contact.' . $key, 'je obavezno polje.');
            }
        }
        foreach (array_keys($contact) as $key) {
            if (!array_key_exists($key, $contactFields)) {
                cms_add_error($errors, 'contact.' . $key, 'nije dozvoljeno polje.');
            }
        }
        if (is_string($contact['email'] ?? null) && !filter_var($contact['email'], FILTER_VALIDATE_EMAIL)) {
            cms_add_error($errors, 'contact.email', 'nije ispravna email adresa.');
        }
        foreach (['whatsapp', 'viber'] as $key) {
            if (is_string($contact[$key] ?? null) && !preg_match('/^[0-9+().\s-]+$/', $contact[$key])) {
                cms_add_error($errors, 'contact.' . $key, 'sadrži nedozvoljene znakove.');
            }
        }
    }

    $sectionKeys = ['hero', 'trust', 'categories', 'categoryShowcase', 'products', 'comingSoon', 'comingSoonShowcase', 'comparison', 'service', 'parts', 'manuals', 'delivery', 'locations', 'blog', 'faq', 'contact', 'footer'];
    $sections = is_array($cms['sections'] ?? null) ? $cms['sections'] : [];
    if (!$sections) {
        cms_add_error($errors, 'sections', 'mora biti objekat s postavkama sekcija.');
    }
    foreach ($sectionKeys as $key) {
        if (!array_key_exists($key, $sections) || !is_bool($sections[$key])) {
            cms_add_error($errors, 'sections.' . $key, 'mora biti uključeno ili isključeno.');
        }
    }
    foreach (array_keys($sections) as $key) {
        if (!in_array($key, $sectionKeys, true)) {
            cms_add_error($errors, 'sections.' . $key, 'nije dozvoljena sekcija.');
        }
    }

    $settings = is_array($cms['settings'] ?? null) ? $cms['settings'] : [];
    $gridColumns = $settings['productGridColumns'] ?? null;
    if (!in_array((string)$gridColumns, ['3', '4'], true)) {
        cms_add_error($errors, 'settings.productGridColumns', 'mora biti 3 ili 4.');
    }
    foreach (array_keys($settings) as $key) {
        if ($key !== 'productGridColumns') {
            cms_add_error($errors, 'settings.' . $key, 'nije dozvoljeno polje.');
        }
    }

    $categories = cms_collection($cms, 'categories', 100, $errors);
    $categoryNames = [];
    foreach ($categories as $index => $category) {
        $path = 'categories.' . $index;
        if (!is_array($category)) {
            cms_add_error($errors, $path, 'mora biti objekat.');
            continue;
        }
        cms_validate_string($errors, $category['name'] ?? null, $path . '.name', 120, true);
        cms_validate_optional_string($errors, $category, 'text', $path, 5000);
        cms_validate_optional_string($errors, $category, 'badge', $path, 120);
        cms_validate_date($errors, $category, 'badgeUntil', $path);
        cms_validate_boolean($errors, $category, 'enabled', $path);
        $nameKey = is_string($category['name'] ?? null) ? cms_normalized_key($category['name']) : '';
        if ($nameKey !== '') {
            if (isset($categoryNames[$nameKey])) {
                cms_add_error($errors, $path . '.name', 'mora biti jedinstven naziv kategorije.');
            }
            $categoryNames[$nameKey] = (string)$category['name'];
        }
        if (array_key_exists('attributes', $category)) {
            if (!is_array($category['attributes'])) {
                cms_add_error($errors, $path . '.attributes', 'mora biti lista atributa.');
            } elseif (count($category['attributes']) > 100) {
                cms_add_error($errors, $path . '.attributes', 'može imati najviše 100 atributa.');
            } else {
                $attributeNames = [];
                foreach ($category['attributes'] as $attributeIndex => $attribute) {
                    $attributePath = $path . '.attributes.' . $attributeIndex;
                    if (!is_array($attribute)) {
                        cms_add_error($errors, $attributePath, 'mora biti objekat.');
                        continue;
                    }
                    cms_validate_string($errors, $attribute['name'] ?? null, $attributePath . '.name', 120, true);
                    $attributeNameKey = is_string($attribute['name'] ?? null) ? cms_normalized_key($attribute['name']) : '';
                    if ($attributeNameKey !== '' && isset($attributeNames[$attributeNameKey])) {
                        cms_add_error($errors, $attributePath . '.name', 'mora biti jedinstven naziv atributa.');
                    }
                    $attributeNames[$attributeNameKey] = true;
                    if (!isset($attribute['values']) || !is_array($attribute['values'])) {
                        cms_add_error($errors, $attributePath . '.values', 'mora biti lista.');
                    } elseif (count($attribute['values']) > 500) {
                        cms_add_error($errors, $attributePath . '.values', 'može imati najviše 500 vrijednosti.');
                    } else {
                        foreach ($attribute['values'] as $valueIndex => $value) {
                            cms_validate_string($errors, $value, $attributePath . '.values.' . $valueIndex, 250, true);
                        }
                    }
                }
            }
        }
    }

    $badges = cms_collection($cms, 'badges', 100, $errors);
    $badgeNames = [];
    foreach ($badges as $index => $badge) {
        $path = 'badges.' . $index;
        if (!is_array($badge)) {
            cms_add_error($errors, $path, 'mora biti objekat.');
            continue;
        }
        cms_validate_string($errors, $badge['name'] ?? null, $path . '.name', 120, true);
        cms_validate_optional_string($errors, $badge, 'applyCategory', $path, 120);
        cms_validate_boolean($errors, $badge, 'enabled', $path);
        $nameKey = is_string($badge['name'] ?? null) ? cms_normalized_key($badge['name']) : '';
        if ($nameKey !== '') {
            if (isset($badgeNames[$nameKey])) {
                cms_add_error($errors, $path . '.name', 'mora biti jedinstven naziv badgea.');
            }
            $badgeNames[$nameKey] = (string)$badge['name'];
        }
        $applyCategory = trim((string)($badge['applyCategory'] ?? ''));
        if ($applyCategory !== '' && !isset($categoryNames[cms_normalized_key($applyCategory)])) {
            cms_add_error($errors, $path . '.applyCategory', 'mora pokazivati na postojeću kategoriju.');
        }
    }

    $products = cms_collection($cms, 'products', 1000, $errors);
    $productIds = [];
    foreach ($products as $index => $product) {
        $path = 'products.' . $index;
        if (!is_array($product)) {
            cms_add_error($errors, $path, 'mora biti objekat.');
            continue;
        }
        cms_validate_string($errors, $product['id'] ?? null, $path . '.id', 120, true);
        cms_validate_string($errors, $product['name'] ?? null, $path . '.name', 250, true);
        cms_validate_string($errors, $product['category'] ?? null, $path . '.category', 120, true);
        foreach (['status' => 80, 'badge' => 120, 'tone' => 30, 'deliveryTime' => 250, 'summary' => 5000, 'seoTitle' => 250, 'seoDescription' => 1000] as $key => $maxLength) {
            cms_validate_optional_string($errors, $product, $key, $path, $maxLength);
        }
        cms_validate_optional_string($errors, $product, 'detailedDescription', $path, 100000, true);
        cms_validate_boolean($errors, $product, 'enabled', $path);
        cms_validate_date($errors, $product, 'saleUntil', $path);
        cms_validate_date($errors, $product, 'badgeUntil', $path);
        cms_validate_asset_reference($errors, $product, 'image', $path);
        foreach (['price', 'mpcPrice', 'discountPrice', 'salePrice'] as $priceKey) {
            cms_validate_price($errors, $product, $priceKey, $path);
        }
        cms_validate_value_map($errors, $product, 'specs', $path);
        cms_validate_value_map($errors, $product, 'attributes', $path);

        $id = trim((string)($product['id'] ?? ''));
        if ($id !== '' && !preg_match('/^[A-Za-z0-9][A-Za-z0-9_-]*$/', $id)) {
            cms_add_error($errors, $path . '.id', 'smije sadržavati samo slova, brojeve, crtice i donje crtice.');
        }
        $idKey = cms_normalized_key($id);
        if ($idKey !== '') {
            if (isset($productIds[$idKey])) {
                cms_add_error($errors, $path . '.id', 'mora biti jedinstven ID proizvoda.');
            }
            $productIds[$idKey] = $id;
        }
        $categoryKey = cms_normalized_key((string)($product['category'] ?? ''));
        if ($categoryKey !== '' && !isset($categoryNames[$categoryKey])) {
            cms_add_error($errors, $path . '.category', 'mora pokazivati na postojeću kategoriju.');
        }
        $badgeKey = cms_normalized_key((string)($product['badge'] ?? ''));
        if ($badgeKey !== '' && $badgeKey !== '-' && !isset($badgeNames[$badgeKey])) {
            cms_add_error($errors, $path . '.badge', 'mora pokazivati na postojeći badge.');
        }
        if (isset($product['tone']) && !in_array($product['tone'], ['red', 'light', 'dark'], true)) {
            cms_add_error($errors, $path . '.tone', 'nije dozvoljena boja kartice.');
        }
        if (isset($product['salePrice']) && is_numeric(str_replace(',', '.', (string)$product['salePrice'])) && (float)str_replace(',', '.', (string)$product['salePrice']) > 0 && trim((string)($product['saleUntil'] ?? '')) === '') {
            cms_add_error($errors, $path . '.saleUntil', 'je obavezan kada postoji akcijska cijena.');
        }
        if (array_key_exists('gallery', $product)) {
            if (!is_array($product['gallery'])) {
                cms_add_error($errors, $path . '.gallery', 'mora biti lista slika.');
            } elseif (count($product['gallery']) > 100) {
                cms_add_error($errors, $path . '.gallery', 'može imati najviše 100 slika.');
            } else {
                foreach ($product['gallery'] as $galleryIndex => $galleryItem) {
                    cms_validate_asset_reference($errors, ['value' => $galleryItem], 'value', $path . '.gallery.' . $galleryIndex);
                }
            }
        }
    }

    $checkNamedTextItems = static function (string $key, int $maxItems) use (&$cms, &$errors): void {
        foreach (cms_collection($cms, $key, $maxItems, $errors) as $index => $item) {
            $path = $key . '.' . $index;
            if (!is_array($item)) {
                cms_add_error($errors, $path, 'mora biti objekat.');
                continue;
            }
            cms_validate_string($errors, $item['name'] ?? null, $path . '.name', 250, true);
            cms_validate_optional_string($errors, $item, 'text', $path, 10000);
            cms_validate_boolean($errors, $item, 'enabled', $path);
        }
    };
    $checkNamedTextItems('comingSoon', 500);
    $checkNamedTextItems('parts', 500);

    foreach (cms_collection($cms, 'manuals', 1000, $errors) as $index => $manual) {
        $path = 'manuals.' . $index;
        if (!is_array($manual)) {
            cms_add_error($errors, $path, 'mora biti objekat.');
            continue;
        }
        cms_validate_string($errors, $manual['title'] ?? null, $path . '.title', 250, true);
        foreach (['type' => 120, 'status' => 250, 'relatedProductId' => 120, 'category' => 120, 'visibility' => 40] as $key => $maxLength) {
            cms_validate_optional_string($errors, $manual, $key, $path, $maxLength);
        }
        cms_validate_asset_reference($errors, $manual, 'file', $path);
        cms_validate_boolean($errors, $manual, 'enabled', $path);
        $relatedProductId = trim((string)($manual['relatedProductId'] ?? ''));
        if ($relatedProductId !== '' && !isset($productIds[cms_normalized_key($relatedProductId)])) {
            cms_add_error($errors, $path . '.relatedProductId', 'mora pokazivati na postojeći proizvod.');
        }
        $category = trim((string)($manual['category'] ?? ''));
        if ($category !== '' && !isset($categoryNames[cms_normalized_key($category)])) {
            cms_add_error($errors, $path . '.category', 'mora pokazivati na postojeću kategoriju.');
        }
        if (isset($manual['visibility']) && !in_array($manual['visibility'], ['Javno', 'Sakriveno'], true)) {
            cms_add_error($errors, $path . '.visibility', 'mora biti Javno ili Sakriveno.');
        }
    }

    foreach (cms_collection($cms, 'locations', 500, $errors) as $index => $location) {
        $path = 'locations.' . $index;
        if (!is_array($location)) {
            cms_add_error($errors, $path, 'mora biti objekat.');
            continue;
        }
        cms_validate_string($errors, $location['name'] ?? null, $path . '.name', 250, true);
        cms_validate_optional_string($errors, $location, 'address', $path, 5000);
        cms_validate_optional_string($errors, $location, 'hours', $path, 1000);
        cms_validate_boolean($errors, $location, 'enabled', $path);
    }

    $blogIds = [];
    foreach (cms_collection($cms, 'blogs', 1000, $errors) as $index => $blog) {
        $path = 'blogs.' . $index;
        if (!is_array($blog)) {
            cms_add_error($errors, $path, 'mora biti objekat.');
            continue;
        }
        cms_validate_string($errors, $blog['id'] ?? null, $path . '.id', 120, true);
        cms_validate_string($errors, $blog['title'] ?? null, $path . '.title', 250, true);
        cms_validate_optional_string($errors, $blog, 'text', $path, 100000, true);
        foreach (['tag' => 120, 'seoTitle' => 250, 'seoDescription' => 1000] as $key => $maxLength) {
            cms_validate_optional_string($errors, $blog, $key, $path, $maxLength);
        }
        cms_validate_asset_reference($errors, $blog, 'image', $path);
        cms_validate_boolean($errors, $blog, 'enabled', $path);
        $id = trim((string)($blog['id'] ?? ''));
        if ($id !== '' && !preg_match('/^[A-Za-z0-9][A-Za-z0-9_-]*$/', $id)) {
            cms_add_error($errors, $path . '.id', 'smije sadržavati samo slova, brojeve, crtice i donje crtice.');
        }
        $idKey = cms_normalized_key($id);
        if ($idKey !== '') {
            if (isset($blogIds[$idKey])) {
                cms_add_error($errors, $path . '.id', 'mora biti jedinstven ID bloga.');
            }
            $blogIds[$idKey] = true;
        }
    }

    foreach (cms_collection($cms, 'faq', 500, $errors) as $index => $faq) {
        $path = 'faq.' . $index;
        if (!is_array($faq)) {
            cms_add_error($errors, $path, 'mora biti objekat.');
            continue;
        }
        cms_validate_string($errors, $faq['q'] ?? null, $path . '.q', 1000, true);
        cms_validate_string($errors, $faq['a'] ?? null, $path . '.a', 10000, true);
        cms_validate_boolean($errors, $faq, 'enabled', $path);
    }

    $checklistIds = [];
    foreach (cms_collection($cms, 'launchChecklist', 50, $errors) as $index => $checklistItem) {
        $path = 'launchChecklist.' . $index;
        if (!is_array($checklistItem)) {
            cms_add_error($errors, $path, 'mora biti objekat.');
            continue;
        }
        cms_validate_string($errors, $checklistItem['id'] ?? null, $path . '.id', 80, true);
        cms_validate_string($errors, $checklistItem['label'] ?? null, $path . '.label', 250, true);
        cms_validate_optional_string($errors, $checklistItem, 'note', $path, 5000);
        if (!array_key_exists('done', $checklistItem) || !is_bool($checklistItem['done'])) {
            cms_add_error($errors, $path . '.done', 'mora biti uključeno ili isključeno.');
        }
        $idKey = cms_normalized_key((string)($checklistItem['id'] ?? ''));
        if ($idKey !== '') {
            if (isset($checklistIds[$idKey])) {
                cms_add_error($errors, $path . '.id', 'mora biti jedinstven ID kontrolne stavke.');
            }
            $checklistIds[$idKey] = true;
        }
    }

    return $errors;
}

function encode_json_or_fail($value, bool $pretty = false): string
{
    $flags = JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR;
    if ($pretty) {
        $flags |= JSON_PRETTY_PRINT;
    }

    try {
        return json_encode($value, $flags);
    } catch (JsonException $error) {
        throw new RuntimeException('Podaci se ne mogu pretvoriti u ispravan JSON zapis.', 0, $error);
    }
}

function prune_cms_revisions(PDO $pdo, int $keep = 25): void
{
    $ids = $pdo->query('SELECT id FROM cms_revisions ORDER BY id DESC')->fetchAll(PDO::FETCH_COLUMN);
    $obsoleteIds = array_slice(array_map('intval', $ids), $keep);
    if (!$obsoleteIds) {
        return;
    }

    $delete = $pdo->prepare('DELETE FROM cms_revisions WHERE id = :id');
    foreach ($obsoleteIds as $id) {
        $delete->execute([':id' => $id]);
    }
}

function save_cms(PDO $pdo, array $cms, ?int $expectedRevision = null): int
{
    $cms = cms_sanitize_content($cms);
    $ownsTransaction = !$pdo->inTransaction();
    if ($ownsTransaction) {
        $pdo->beginTransaction();
    }

    try {
        $keyColumn = quote_identifier($pdo, 'key');
        $selectSql = 'SELECT value, revision FROM cms_store WHERE ' . $keyColumn . ' = "cms"';
        if (database_driver($pdo) === 'mysql') {
            $selectSql .= ' FOR UPDATE';
        }
        $current = $pdo->query($selectSql)->fetch(PDO::FETCH_ASSOC);
        if (!$current) {
            throw new RuntimeException('CMS zapis nije pronađen u bazi.');
        }

        $currentRevision = max(1, (int)($current['revision'] ?? 1));
        if ($expectedRevision !== null && $expectedRevision !== $currentRevision) {
            throw new CmsRevisionConflict('CMS je u međuvremenu promijenjen u drugoj kartici. Osvježite CMS prije ponovnog spremanja.');
        }

        $history = $pdo->prepare('INSERT INTO cms_revisions (revision, value, created_at) VALUES (:revision, :value, :created_at)');
        $history->execute([
            ':revision' => $currentRevision,
            ':value' => (string)$current['value'],
            ':created_at' => date('c'),
        ]);

        $nextRevision = $currentRevision + 1;
        $stmt = $pdo->prepare('UPDATE cms_store SET value = :value, updated_at = :updated_at, revision = :next_revision WHERE ' . $keyColumn . ' = "cms" AND revision = :current_revision');
        $stmt->execute([
            ':value' => encode_json_or_fail($cms, true),
            ':updated_at' => date('c'),
            ':next_revision' => $nextRevision,
            ':current_revision' => $currentRevision,
        ]);
        if ($stmt->rowCount() !== 1) {
            throw new CmsRevisionConflict('CMS je u međuvremenu promijenjen. Osvježite CMS prije ponovnog spremanja.');
        }

        prune_cms_revisions($pdo);
        if ($ownsTransaction) {
            $pdo->commit();
        }
        return $nextRevision;
    } catch (Throwable $error) {
        if ($ownsTransaction && $pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $error;
    }
}

function ensure_writable_directory(string $dir, string $label): string
{
    if (!is_dir($dir) && !mkdir($dir, 0775, true) && !is_dir($dir)) {
        throw new RuntimeException($label . ' folder se ne može kreirati.');
    }
    if (!is_writable($dir)) {
        throw new RuntimeException($label . ' folder nije dostupan za pisanje.');
    }
    return rtrim($dir, DIRECTORY_SEPARATOR);
}

function atomic_write_file(string $target, string $contents): void
{
    $dir = ensure_writable_directory(dirname($target), 'Odredišni');
    $temporary = $dir . DIRECTORY_SEPARATOR . '.' . basename($target) . '.' . bin2hex(random_bytes(5)) . '.part';

    try {
        $written = file_put_contents($temporary, $contents, LOCK_EX);
        if ($written === false || $written !== strlen($contents)) {
            throw new RuntimeException('Datoteka nije zapisana u cijelosti.');
        }
        if (!rename($temporary, $target)) {
            throw new RuntimeException('Privremena datoteka se ne može objaviti.');
        }
    } finally {
        if (is_file($temporary)) {
            unlink($temporary);
        }
    }
}

function publish_uploaded_file(string $temporary, string $target, string $errorMessage): void
{
    if (!is_file($temporary) || filesize($temporary) === 0 || !rename($temporary, $target)) {
        if (is_file($temporary)) {
            unlink($temporary);
        }
        respond(['ok' => false, 'message' => $errorMessage], 500);
    }
}

function image_upload_config(string $folder): string
{
    $dir = __DIR__ . DIRECTORY_SEPARATOR . 'uploads' . DIRECTORY_SEPARATOR . $folder;
    return ensure_writable_directory($dir, 'Upload');
}

function image_source_from_upload(string $path, string $mime)
{
    if ($mime === 'image/jpeg') {
        return imagecreatefromjpeg($path);
    }
    if ($mime === 'image/png') {
        return imagecreatefrompng($path);
    }
    if ($mime === 'image/webp') {
        return imagecreatefromwebp($path);
    }
    return false;
}

function uploaded_file_or_error(string $key, string $label): array
{
    if (!isset($_FILES[$key]) || !is_array($_FILES[$key])) {
        respond(['ok' => false, 'message' => $label . ' nije poslana.'], 400);
    }

    $file = $_FILES[$key];
    $error = (int)($file['error'] ?? UPLOAD_ERR_NO_FILE);
    if ($error === UPLOAD_ERR_OK) {
        return $file;
    }

    $messages = [
        UPLOAD_ERR_INI_SIZE => $label . ' je veća od limita koji hosting dozvoljava.',
        UPLOAD_ERR_FORM_SIZE => $label . ' je veća od dozvoljenog limita.',
        UPLOAD_ERR_PARTIAL => $label . ' je samo djelimično uploadovana. Pokušajte ponovo.',
        UPLOAD_ERR_NO_FILE => $label . ' nije odabrana.',
        UPLOAD_ERR_NO_TMP_DIR => 'Hostingu nedostaje privremeni folder za upload.',
        UPLOAD_ERR_CANT_WRITE => 'Hosting nije mogao zapisati datoteku na disk.',
        UPLOAD_ERR_EXTENSION => 'Hosting je zaustavio upload datoteke.',
    ];

    respond(['ok' => false, 'message' => $messages[$error] ?? 'Upload nije uspio.'], 400);
}

function save_optimized_image(array $file, string $folder, string $prefix, int $maxWidth, int $maxHeight): array
{
    $maxSize = 5 * 1024 * 1024;
    $fileSize = (int)($file['size'] ?? 0);
    if ($fileSize < 1) {
        respond(['ok' => false, 'message' => 'Slika je prazna ili upload nije završen.'], 400);
    }
    if ($fileSize > $maxSize) {
        respond(['ok' => false, 'message' => 'Slika može biti maksimalno 5 MB.'], 400);
    }

    $finfo = new finfo(FILEINFO_MIME_TYPE);
    $mime = $finfo->file($file['tmp_name']);
    $extensions = [
        'image/jpeg' => 'jpg',
        'image/png' => 'png',
        'image/webp' => 'webp',
        'image/gif' => 'gif',
    ];

    if (!isset($extensions[$mime])) {
        respond(['ok' => false, 'message' => 'Dozvoljeni formati su JPG, PNG, WEBP i GIF.'], 400);
    }

    $dimensions = @getimagesize($file['tmp_name']);
    if (!$dimensions || empty($dimensions[0]) || empty($dimensions[1])) {
        respond(['ok' => false, 'message' => 'Slika nije ispravna.'], 400);
    }
    if ((int)$dimensions[0] * (int)$dimensions[1] > 40000000) {
        respond(['ok' => false, 'message' => 'Slika ima prevelike dimenzije. Maksimalno je 40 megapiksela.'], 400);
    }

    $dir = image_upload_config($folder);

    if ($mime === 'image/gif' || !function_exists('imagewebp')) {
        $name = $prefix . '-' . date('YmdHis') . '-' . bin2hex(random_bytes(4)) . '.' . $extensions[$mime];
        $target = $dir . DIRECTORY_SEPARATOR . $name;
        $temporary = $target . '.part';

        if (!move_uploaded_file($file['tmp_name'], $temporary)) {
            respond(['ok' => false, 'message' => 'Upload nije uspio.'], 500);
        }
        publish_uploaded_file($temporary, $target, 'Upload nije završen. Pokušajte ponovo.');

        return [
            'path' => 'uploads/' . $folder . '/' . $name,
            'name' => $name,
            'optimized' => false,
            'format' => $extensions[$mime],
        ];
    }

    $source = image_source_from_upload($file['tmp_name'], $mime);
    if (!$source) {
        respond(['ok' => false, 'message' => 'Slika se ne može obraditi.'], 400);
    }

    imagepalettetotruecolor($source);
    imagesavealpha($source, true);

    $sourceWidth = imagesx($source);
    $sourceHeight = imagesy($source);
    $ratio = min($maxWidth / $sourceWidth, $maxHeight / $sourceHeight, 1);
    $targetWidth = max(1, (int)round($sourceWidth * $ratio));
    $targetHeight = max(1, (int)round($sourceHeight * $ratio));
    $targetImage = imagecreatetruecolor($targetWidth, $targetHeight);
    imagealphablending($targetImage, false);
    imagesavealpha($targetImage, true);
    $transparent = imagecolorallocatealpha($targetImage, 255, 255, 255, 127);
    imagefilledrectangle($targetImage, 0, 0, $targetWidth, $targetHeight, $transparent);
    imagecopyresampled($targetImage, $source, 0, 0, 0, 0, $targetWidth, $targetHeight, $sourceWidth, $sourceHeight);

    $name = $prefix . '-' . date('YmdHis') . '-' . bin2hex(random_bytes(4)) . '.webp';
    $target = $dir . DIRECTORY_SEPARATOR . $name;
    $temporary = $target . '.part';

    if (!imagewebp($targetImage, $temporary, 82)) {
        imagedestroy($source);
        imagedestroy($targetImage);
        if (is_file($temporary)) {
            unlink($temporary);
        }
        respond(['ok' => false, 'message' => 'Optimizacija slike nije uspjela.'], 500);
    }

    imagedestroy($source);
    imagedestroy($targetImage);

    if (!is_file($temporary) || filesize($temporary) === 0 || @getimagesize($temporary) === false) {
        if (is_file($temporary)) {
            unlink($temporary);
        }
        respond(['ok' => false, 'message' => 'Slika je obrađena, ali spremljena datoteka nije ispravna.'], 500);
    }
    publish_uploaded_file($temporary, $target, 'Obrađena slika se ne može objaviti. Pokušajte ponovo.');

    return [
        'path' => 'uploads/' . $folder . '/' . $name,
        'name' => $name,
        'optimized' => true,
        'format' => 'webp',
        'width' => $targetWidth,
        'height' => $targetHeight,
    ];
}

function upload_product_image(): array
{
    return save_optimized_image(uploaded_file_or_error('image', 'Slika'), 'products', 'product', 1200, 1200);
}

function upload_blog_image(): array
{
    return save_optimized_image(uploaded_file_or_error('image', 'Slika'), 'blogs', 'blog', 1600, 900);
}

function upload_manual_file(): array
{
    $file = uploaded_file_or_error('manual', 'Uputstvo');
    $maxSize = 15 * 1024 * 1024;
    $fileSize = (int)($file['size'] ?? 0);
    if ($fileSize < 1) {
        respond(['ok' => false, 'message' => 'PDF je prazan ili upload nije završen.'], 400);
    }
    if ($fileSize > $maxSize) {
        respond(['ok' => false, 'message' => 'PDF može biti maksimalno 15 MB.'], 400);
    }

    $finfo = new finfo(FILEINFO_MIME_TYPE);
    $mime = $finfo->file($file['tmp_name']);
    if ($mime !== 'application/pdf') {
        respond(['ok' => false, 'message' => 'Dozvoljen je samo PDF format.'], 400);
    }

    $signature = file_get_contents($file['tmp_name'], false, null, 0, 5);
    if ($signature !== '%PDF-') {
        respond(['ok' => false, 'message' => 'PDF datoteka nema ispravan sadržaj.'], 400);
    }

    $dir = image_upload_config('manuals');

    $safeBase = preg_replace('/[^a-zA-Z0-9-_]+/', '-', pathinfo($file['name'], PATHINFO_FILENAME));
    $safeBase = trim((string)$safeBase, '-');
    if ($safeBase === '') {
        $safeBase = 'manual';
    }

    $name = strtolower($safeBase) . '-' . date('YmdHis') . '-' . bin2hex(random_bytes(4)) . '.pdf';
    $target = $dir . DIRECTORY_SEPARATOR . $name;
    $temporary = $target . '.part';

    if (!move_uploaded_file($file['tmp_name'], $temporary)) {
        respond(['ok' => false, 'message' => 'Upload uputstva nije uspio.'], 500);
    }
    publish_uploaded_file($temporary, $target, 'Upload uputstva nije završen. Pokušajte ponovo.');

    return [
        'path' => 'uploads/manuals/' . $name,
        'name' => $name,
    ];
}

function initialize_auth_state(PDO $pdo): void
{
    // This local generation is deliberately excluded from JSON backups.
    $pdo->exec(database_driver($pdo) === 'mysql'
        ? 'CREATE TABLE IF NOT EXISTS auth_state (id INT PRIMARY KEY, epoch VARCHAR(64) NOT NULL) ENGINE=InnoDB'
        : 'CREATE TABLE IF NOT EXISTS auth_state (id INTEGER PRIMARY KEY, epoch TEXT NOT NULL)');
    $sql = database_driver($pdo) === 'mysql'
        ? 'INSERT IGNORE INTO auth_state (id, epoch) VALUES (1, :epoch)'
        : 'INSERT OR IGNORE INTO auth_state (id, epoch) VALUES (1, :epoch)';
    $pdo->prepare($sql)->execute([':epoch' => bin2hex(random_bytes(32))]);
}

function auth_epoch(PDO $pdo): string
{
    $epoch = (string)$pdo->query('SELECT epoch FROM auth_state WHERE id = 1')->fetchColumn();
    if (!preg_match('/^[a-f0-9]{64}$/D', $epoch)) {
        throw new RuntimeException('Sigurnosno stanje prijave nije dostupno.');
    }
    return $epoch;
}

function rotate_auth_epoch(PDO $pdo): void
{
    if (!$pdo->inTransaction()) {
        throw new LogicException('Session revocation must share the restore transaction.');
    }
    $stmt = $pdo->prepare('UPDATE auth_state SET epoch = :epoch WHERE id = 1');
    $stmt->execute([':epoch' => bin2hex(random_bytes(32))]);
    if ($stmt->rowCount() !== 1) {
        throw new RuntimeException('Sesije nije moguće sigurno poništiti.');
    }
}

function clear_auth_session(string $scope, bool $regenerate = true): void
{
    foreach (['id', 'name', 'issued_at', 'last_activity', 'user_agent', 'auth_version', 'auth_epoch'] as $suffix) {
        unset($_SESSION[$scope . '_' . $suffix]);
    }
    if ($regenerate && session_status() === PHP_SESSION_ACTIVE) {
        session_regenerate_id(true);
    }
}

function establish_auth_session(string $scope, array $user, string $requestEpoch): void
{
    session_regenerate_id(true);
    $now = time();
    $_SESSION[$scope . '_id'] = (int)$user['id'];
    $_SESSION[$scope . '_name'] = (string)($user['name'] ?? '');
    $_SESSION[$scope . '_issued_at'] = $now;
    $_SESSION[$scope . '_last_activity'] = $now;
    $_SESSION[$scope . '_user_agent'] = hash('sha256', (string)($_SERVER['HTTP_USER_AGENT'] ?? ''));
    $_SESSION[$scope . '_auth_version'] = (int)($user['auth_version'] ?? 0);
    // Captured BEFORE credential reads. A concurrent restore cannot give a
    // pre-restore identity the new generation, even when IDs are reused.
    $_SESSION[$scope . '_auth_epoch'] = $requestEpoch;
}

function authenticated_session_active(PDO $pdo, string $scope, string $role, int $idleTimeout, int $absoluteTimeout): bool
{
    $userId = (int)($_SESSION[$scope . '_id'] ?? 0);
    if ($userId < 1) {
        return false;
    }

    $now = time();
    $issuedAt = (int)($_SESSION[$scope . '_issued_at'] ?? 0);
    $lastActivity = (int)($_SESSION[$scope . '_last_activity'] ?? 0);
    $storedUserAgent = (string)($_SESSION[$scope . '_user_agent'] ?? '');
    $currentUserAgent = hash('sha256', (string)($_SERVER['HTTP_USER_AGENT'] ?? ''));

    if (($issuedAt > 0 && $issuedAt < $now - $absoluteTimeout)
        || ($lastActivity > 0 && $lastActivity < $now - $idleTimeout)
        || ($storedUserAgent !== '' && !hash_equals($storedUserAgent, $currentUserAgent))) {
        clear_auth_session($scope);
        return false;
    }

    $stmt = $pdo->prepare('SELECT users.id, users.name, users.auth_version, auth_state.epoch FROM users CROSS JOIN auth_state WHERE users.id = :id AND role = :role AND auth_state.id = 1 LIMIT 1');
    $stmt->execute([':id' => $userId, ':role' => $role]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);
    $sessionEpoch = (string)($_SESSION[$scope . '_auth_epoch'] ?? '');
    if (!$user || $sessionEpoch === '' || !hash_equals((string)$user['epoch'], $sessionEpoch)) {
        clear_auth_session($scope);
        return false;
    }

    $databaseVersion = (int)($user['auth_version'] ?? 0);
    $sessionVersion = array_key_exists($scope . '_auth_version', $_SESSION)
        ? (int)$_SESSION[$scope . '_auth_version']
        : -1;
    if ($sessionVersion !== $databaseVersion) {
        clear_auth_session($scope);
        return false;
    }

    $_SESSION[$scope . '_name'] = (string)$user['name'];
    $_SESSION[$scope . '_issued_at'] = $issuedAt > 0 ? $issuedAt : $now;
    $_SESSION[$scope . '_last_activity'] = $now;
    $_SESSION[$scope . '_user_agent'] = $storedUserAgent !== '' ? $storedUserAgent : $currentUserAgent;
    $_SESSION[$scope . '_auth_version'] = $databaseVersion;
    return true;
}

function admin_session_active(?PDO $databaseConnection = null): bool
{
    if (!$databaseConnection instanceof PDO) {
        global $pdo;
        $databaseConnection = $pdo instanceof PDO ? $pdo : null;
    }
    if (!$databaseConnection instanceof PDO) {
        return false;
    }

    return authenticated_session_active($databaseConnection, 'admin', 'admin', 1800, 8 * 60 * 60);
}

function require_admin(): void
{
    if (!admin_session_active()) {
        respond(['ok' => false, 'message' => 'Potrebna je admin prijava.'], 401);
    }
}

function customer_session_active(?PDO $databaseConnection = null): bool
{
    if (!$databaseConnection instanceof PDO) {
        global $pdo;
        $databaseConnection = $pdo instanceof PDO ? $pdo : null;
    }
    if (!$databaseConnection instanceof PDO) {
        return false;
    }

    return authenticated_session_active($databaseConnection, 'customer', 'customer', 7 * 24 * 60 * 60, 30 * 24 * 60 * 60);
}

function require_customer(): int
{
    if (!customer_session_active()) {
        respond(['ok' => false, 'message' => 'Prijavite se da koristite korpu.'], 401);
    }

    return (int)$_SESSION['customer_id'];
}

function active_cart_id(PDO $pdo, int $userId): int
{
    $stmt = $pdo->prepare('SELECT id FROM carts WHERE user_id = :user_id AND status = "active" ORDER BY id DESC LIMIT 1');
    $stmt->execute([':user_id' => $userId]);
    $cartId = $stmt->fetchColumn();

    if ($cartId) {
        return (int)$cartId;
    }

    $insert = $pdo->prepare('INSERT INTO carts (user_id, status, created_at, updated_at) VALUES (:user_id, "active", :created_at, :updated_at)');
    $insert->execute([':user_id' => $userId, ':created_at' => date('c'), ':updated_at' => date('c')]);
    return (int)$pdo->lastInsertId();
}

function add_cart_item(PDO $pdo, int $cartId, string $productId, int $quantity): void
{
    $quantity = max(1, min(99, $quantity));
    if (database_driver($pdo) === 'mysql') {
        $stmt = $pdo->prepare('INSERT INTO cart_items (cart_id, product_id, quantity, created_at) VALUES (:cart_id, :product_id, :quantity, :created_at) ON DUPLICATE KEY UPDATE quantity = LEAST(99, quantity + VALUES(quantity))');
    } else {
        $stmt = $pdo->prepare('INSERT INTO cart_items (cart_id, product_id, quantity, created_at) VALUES (:cart_id, :product_id, :quantity, :created_at) ON CONFLICT(cart_id, product_id) DO UPDATE SET quantity = MIN(99, cart_items.quantity + excluded.quantity)');
    }
    $stmt->execute([
        ':cart_id' => $cartId,
        ':product_id' => $productId,
        ':quantity' => $quantity,
        ':created_at' => date('c'),
    ]);
}

function products_by_id(PDO $pdo): array
{
    $cms = public_cms(get_cms($pdo));
    $products = [];
    foreach (($cms['products'] ?? []) as $product) {
        if (!empty($product['id'])) {
            $products[(string)$product['id']] = $product;
        }
    }

    return $products;
}

function numeric_price($value): float
{
    $cleaned = preg_replace('/[^\d.]/', '', str_replace(',', '.', (string)($value ?? '')));
    if ($cleaned === null || $cleaned === '') {
        return 0.0;
    }

    return is_numeric($cleaned) ? (float)$cleaned : 0.0;
}

function format_price($value): string
{
    $number = numeric_price($value);
    if ($number <= 0) {
        return '0';
    }

    return floor($number) === $number ? (string)(int)$number : rtrim(rtrim(number_format($number, 2, '.', ''), '0'), '.');
}

function date_active($dateValue): bool
{
    if (empty($dateValue)) {
        return true;
    }

    return strtotime((string)$dateValue . ' 23:59:59') >= strtotime('today');
}

function product_price_label(array $product): string
{
    if (numeric_price($product['salePrice'] ?? 0) > 0 && !empty($product['saleUntil']) && date_active($product['saleUntil'])) {
        return format_price($product['salePrice']);
    }

    if (numeric_price($product['discountPrice'] ?? 0) > 0) {
        return format_price($product['discountPrice']);
    }

    if (numeric_price($product['mpcPrice'] ?? 0) > 0) {
        return format_price($product['mpcPrice']);
    }

    if (numeric_price($product['price'] ?? 0) > 0) {
        return format_price($product['price']);
    }

    return 'Cijena na upit';
}

function phone_validation_error(string $phone, bool $required = false): ?string
{
    $phone = trim($phone);
    if ($phone === '') {
        return $required ? 'Unesite broj telefona.' : null;
    }
    if (cms_text_length($phone) > 30 || preg_match('/[^0-9+()\/ .-]/', $phone)) {
        return 'Unesite ispravan broj telefona.';
    }
    if (substr_count($phone, '+') > 1 || (strpos($phone, '+') !== false && $phone[0] !== '+')) {
        return 'Unesite ispravan broj telefona.';
    }

    $digits = preg_replace('/\D/', '', $phone) ?? '';
    if (strlen($digits) < 6 || strlen($digits) > 15) {
        return 'Unesite ispravan broj telefona.';
    }
    return null;
}

function cart_payload_by_id(PDO $pdo, int $userId, int $cartId): array
{
    $cartStmt = $pdo->prepare('SELECT id, status FROM carts WHERE id = :id AND user_id = :user_id LIMIT 1');
    $cartStmt->execute([':id' => $cartId, ':user_id' => $userId]);
    $cart = $cartStmt->fetch(PDO::FETCH_ASSOC);
    if (!$cart) {
        return ['cartId' => 0, 'status' => '', 'items' => [], 'count' => 0];
    }

    $products = products_by_id($pdo);
    $stmt = $pdo->prepare('SELECT id, product_id, quantity FROM cart_items WHERE cart_id = :cart_id ORDER BY id DESC');
    $stmt->execute([':cart_id' => $cartId]);
    $items = [];
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $productId = (string)$row['product_id'];
        $product = $products[$productId] ?? ['id' => $productId, 'name' => 'Nedostupan proizvod', 'summary' => 'Ovaj proizvod više nije u javnoj ponudi.', 'status' => 'Nije dostupno', 'enabled' => false];
        $items[] = [
            'id' => (int)$row['id'],
            'productId' => $productId,
            'quantity' => max(1, min(99, (int)$row['quantity'])),
            'product' => $product,
        ];
    }

    return [
        'cartId' => (int)$cart['id'],
        'status' => (string)$cart['status'],
        'items' => $items,
        'count' => array_sum(array_column($items, 'quantity')),
    ];
}

function cart_payload(PDO $pdo, int $userId): array
{
    $cartId = active_cart_id($pdo, $userId);
    return cart_payload_by_id($pdo, $userId, $cartId);
}

function create_order_from_cart(PDO $pdo, int $userId, int $cartId, array $user, string $phone, string $note, bool $updateProfilePhone): int
{
    try {
        $pdo->beginTransaction();
        if (database_driver($pdo) === 'sqlite') {
            $sqliteLock = $pdo->prepare('UPDATE carts SET updated_at = updated_at WHERE id = :id AND user_id = :user_id');
            $sqliteLock->execute([':id' => $cartId, ':user_id' => $userId]);
        }
        $lockSql = 'SELECT id, status FROM carts WHERE id = :id AND user_id = :user_id LIMIT 1';
        if (database_driver($pdo) === 'mysql') {
            $lockSql .= ' FOR UPDATE';
        }
        $lock = $pdo->prepare($lockSql);
        $lock->execute([':id' => $cartId, ':user_id' => $userId]);
        $lockedCart = $lock->fetch(PDO::FETCH_ASSOC);
        if (!$lockedCart || (string)$lockedCart['status'] !== 'active') {
            throw new OrderSubmissionConflict('Ovaj upit je već poslan ili korpa više nije aktivna. Osvježite korpu.');
        }

        $cart = cart_payload_by_id($pdo, $userId, $cartId);
        if (!$cart['items']) {
            throw new OrderSubmissionConflict('Korpa je prazna.');
        }
        foreach ($cart['items'] as $cartItem) {
            if (($cartItem['product']['enabled'] ?? true) === false) {
                throw new OrderSubmissionConflict('Jedan od proizvoda u korpi više nije dostupan. Uklonite ga prije slanja upita.');
            }
        }

        $items = array_map(static function (array $item): array {
            $product = is_array($item['product'] ?? null) ? $item['product'] : [];
            return [
                'productId' => (string)$item['productId'],
                'name' => (string)($product['name'] ?? 'Proizvod'),
                'quantity' => (int)$item['quantity'],
                'price' => product_price_label($product),
            ];
        }, $cart['items']);

        $now = date('c');
        $insert = $pdo->prepare('INSERT INTO orders (user_id, customer_name, customer_email, phone, note, status, items_json, created_at, updated_at) VALUES (:user_id, :customer_name, :customer_email, :phone, :note, "Novo", :items_json, :created_at, :updated_at)');
        $insert->execute([
            ':user_id' => $userId,
            ':customer_name' => (string)$user['name'],
            ':customer_email' => (string)$user['email'],
            ':phone' => $phone,
            ':note' => $note,
            ':items_json' => encode_json_or_fail($items),
            ':created_at' => $now,
            ':updated_at' => $now,
        ]);
        $orderId = (int)$pdo->lastInsertId();

        $closeCart = $pdo->prepare('UPDATE carts SET status = "submitted", updated_at = :updated_at WHERE id = :id AND user_id = :user_id AND status = "active"');
        $closeCart->execute([':updated_at' => $now, ':id' => $cartId, ':user_id' => $userId]);
        if ($closeCart->rowCount() !== 1) {
            throw new OrderSubmissionConflict('Upit nije poslan jer korpa više nije aktivna. Osvježite korpu.');
        }

        if ($updateProfilePhone) {
            $pdo->prepare('UPDATE users SET phone = :phone WHERE id = :id AND role = "customer"')->execute([':phone' => $phone, ':id' => $userId]);
        }
        $pdo->commit();
        return $orderId;
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $error;
    }
}

function favorites_payload(PDO $pdo, int $userId): array
{
    $stmt = $pdo->prepare('SELECT product_id FROM product_favorites WHERE user_id = :user_id ORDER BY id DESC');
    $stmt->execute([':user_id' => $userId]);
    $publicProducts = products_by_id($pdo);
    return array_values(array_filter(
        array_map(static fn(array $row): string => (string)$row['product_id'], $stmt->fetchAll(PDO::FETCH_ASSOC)),
        static fn(string $productId): bool => isset($publicProducts[$productId])
    ));
}

function favorite_products_payload(PDO $pdo, int $userId): array
{
    $favoriteIds = favorites_payload($pdo, $userId);
    $products = products_by_id($pdo);
    $favoriteProducts = [];

    foreach ($favoriteIds as $productId) {
        if (!isset($products[$productId])) {
            continue;
        }

        $product = $products[$productId];
        $favoriteProducts[] = [
            'id' => $productId,
            'name' => $product['name'] ?? '',
            'category' => $product['category'] ?? '',
            'summary' => $product['summary'] ?? '',
            'image' => $product['image'] ?? '',
            'price' => product_price_label($product),
        ];
    }

    return $favoriteProducts;
}

function orders_payload(PDO $pdo): array
{
    $stmt = $pdo->query('SELECT id, user_id, customer_name, customer_email, phone, note, admin_note, status, items_json, created_at, updated_at FROM orders ORDER BY id DESC');
    $orders = [];

    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $items = json_decode((string)$row['items_json'], true);
        $orders[] = [
            'id' => (int)$row['id'],
            'userId' => (int)$row['user_id'],
            'customerName' => $row['customer_name'],
            'customerEmail' => $row['customer_email'],
            'phone' => $row['phone'],
            'note' => $row['note'],
            'adminNote' => $row['admin_note'],
            'status' => $row['status'],
            'items' => is_array($items) ? $items : [],
            'createdAt' => $row['created_at'],
            'updatedAt' => $row['updated_at'],
        ];
    }

    return $orders;
}

function customer_orders_payload(PDO $pdo, int $userId): array
{
    $stmt = $pdo->prepare('SELECT id, phone, note, status, items_json, created_at, updated_at FROM orders WHERE user_id = :user_id ORDER BY id DESC');
    $stmt->execute([':user_id' => $userId]);
    $orders = [];

    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $items = json_decode((string)$row['items_json'], true);
        $orders[] = [
            'id' => (int)$row['id'],
            'phone' => $row['phone'],
            'note' => $row['note'],
            'status' => $row['status'],
            'items' => is_array($items) ? $items : [],
            'createdAt' => $row['created_at'],
            'updatedAt' => $row['updated_at'],
        ];
    }

    return $orders;
}

function customers_payload(PDO $pdo): array
{
    $stmt = $pdo->query('SELECT id, name, email, phone, created_at FROM users WHERE role = "customer" ORDER BY id DESC');
    $customers = [];
    $ordersByUser = [];
    $orderStmt = $pdo->query('SELECT id, user_id, phone, note, admin_note, status, items_json, created_at, updated_at FROM orders ORDER BY user_id, id DESC');

    foreach ($orderStmt->fetchAll(PDO::FETCH_ASSOC) as $order) {
        $userId = (int)$order['user_id'];
        $items = json_decode((string)$order['items_json'], true);
        $ordersByUser[$userId][] = [
            'id' => (int)$order['id'],
            'phone' => $order['phone'],
            'note' => $order['note'],
            'adminNote' => $order['admin_note'],
            'status' => $order['status'],
            'items' => is_array($items) ? $items : [],
            'createdAt' => $order['created_at'],
            'updatedAt' => $order['updated_at'],
        ];
    }

    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $orders = $ordersByUser[(int)$row['id']] ?? [];

        $customers[] = [
            'id' => (int)$row['id'],
            'name' => $row['name'],
            'email' => $row['email'],
            'phone' => $row['phone'],
            'createdAt' => $row['created_at'],
            'orderCount' => count($orders),
            'lastOrderAt' => $orders[0]['createdAt'] ?? '',
            'lastOrderStatus' => $orders[0]['status'] ?? '',
            'orders' => $orders,
        ];
    }

    return $customers;
}

function table_rows(PDO $pdo, string $table): array
{
    return $pdo->query('SELECT * FROM ' . $table)->fetchAll(PDO::FETCH_ASSOC);
}

function backup_payload(PDO $pdo): array
{
    return [
        'version' => 2,
        'createdAt' => date('c'),
        'containsSensitiveData' => true,
        'cms' => get_cms($pdo),
        'cmsRevision' => get_cms_revision($pdo),
        'tables' => [
            'users' => table_rows($pdo, 'users'),
            'carts' => table_rows($pdo, 'carts'),
            'cart_items' => table_rows($pdo, 'cart_items'),
            'product_favorites' => table_rows($pdo, 'product_favorites'),
            'orders' => table_rows($pdo, 'orders'),
        ],
    ];
}

function backup_dir(): string
{
    $dir = __DIR__ . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'backups';
    return ensure_writable_directory($dir, 'Backup');
}

function validate_backup_payload($backup): array
{
    try {
        normalize_backup_payload($backup);
    } catch (InvalidArgumentException $error) {
        return [false, $error->getMessage()];
    }
    return [true, ''];
}

function insert_rows(PDO $pdo, string $table, array $rows): void
{
    foreach ($rows as $row) {
        if (!is_array($row) || !$row) {
            continue;
        }

        $columns = array_keys($row);
        $columnSql = implode(', ', array_map(static function (string $column) use ($pdo): string {
            return quote_identifier($pdo, $column);
        }, $columns));
        $placeholderSql = implode(', ', array_map(static function (string $column): string {
            return ':' . $column;
        }, $columns));
        $stmt = $pdo->prepare('INSERT INTO ' . $table . ' (' . $columnSql . ') VALUES (' . $placeholderSql . ')');
        $params = [];

        foreach ($columns as $column) {
            $params[':' . $column] = $row[$column];
        }

        $stmt->execute($params);
    }
}

function restore_backup_payload(PDO $pdo, array $backup, ?string $backupDirectory = null): int
{
    // Revalidate here as well: library callers must not bypass the HTTP checks.
    $backup = normalize_backup_payload($backup);
    if ($pdo->inTransaction()) {
        throw new LogicException('Restore requires its own transaction.');
    }
    if (database_driver($pdo) === 'mysql') {
        $engines = $pdo->query("SELECT TABLE_NAME, ENGINE FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE()")->fetchAll(PDO::FETCH_KEY_PAIR);
        foreach (['cms_store', 'cms_revisions', 'users', 'carts', 'cart_items', 'product_favorites', 'orders', 'auth_state'] as $table) {
            if (strtolower((string)($engines[$table] ?? '')) !== 'innodb') {
                throw new RuntimeException('Restore zahtijeva InnoDB transakcijsku tabelu: ' . $table);
            }
        }
    }
    $directory = $backupDirectory === null ? backup_dir() : ensure_writable_directory($backupDirectory, 'Backup');
    $preRestorePath = $directory . DIRECTORY_SEPARATOR . 'pre-restore-' . date('Y-m-d-His') . '-' . bin2hex(random_bytes(8)) . '.json';
    atomic_write_file($preRestorePath, encode_json_or_fail(backup_payload($pdo), true));

    try {
        $pdo->beginTransaction();
        $revision = save_cms($pdo, $backup['cms']);
        $pdo->exec('DELETE FROM cart_items');
        $pdo->exec('DELETE FROM product_favorites');
        $pdo->exec('DELETE FROM orders');
        $pdo->exec('DELETE FROM carts');
        $pdo->exec('DELETE FROM users');
        insert_rows($pdo, 'users', $backup['tables']['users']);
        insert_rows($pdo, 'carts', $backup['tables']['carts']);
        insert_rows($pdo, 'cart_items', $backup['tables']['cart_items']);
        insert_rows($pdo, 'product_favorites', $backup['tables']['product_favorites']);
        insert_rows($pdo, 'orders', $backup['tables']['orders']);
        rotate_auth_epoch($pdo);
        $pdo->commit();
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $error;
    }

    return $revision;
}

if (defined('ONES_API_LIBRARY_ONLY') && ONES_API_LIBRARY_ONLY) {
    return;
}

try {
    $pdo = database(is_array($config) ? $config : []);
    $requestAuthEpoch = auth_epoch($pdo);

    if ($action === 'csrf-token') {
        respond(['ok' => true, 'csrfToken' => csrf_token()]);
    }

    $mutatingActions = [
        'admin-login',
        'admin-password-update',
        'customer-profile-update',
        'customer-password-update',
        'customer-register',
        'customer-login',
        'customer-logout',
        'favorite-toggle',
        'cart-add',
        'cart-update',
        'cart-remove',
        'order-submit',
        'admin-logout',
        'admin-order-status',
        'admin-order-note',
        'backup-restore',
        'upload-product-image',
        'upload-blog-image',
        'upload-manual',
        'save-cms',
        'reset-cms',
    ];
    if (in_array($action, $mutatingActions, true)) {
        require_post_with_csrf();
    }

    if ($action === 'cms') {
        respond(['ok' => true, 'cms' => public_cms(get_cms($pdo))]);
    }

    if ($action === 'admin-cms') {
        require_admin();
        respond(['ok' => true, 'cms' => get_cms($pdo), 'revision' => get_cms_revision($pdo)]);
    }

    if ($action === 'admin-status') {
        $loggedIn = admin_session_active();
        $passwordNeedsChange = false;
        if ($loggedIn) {
            $stmt = $pdo->prepare('SELECT password_hash FROM users WHERE id = :id AND role = "admin" LIMIT 1');
            $stmt->execute([':id' => (int)$_SESSION['admin_id']]);
            $passwordNeedsChange = password_verify('onesadmin', (string)$stmt->fetchColumn());
        }
        respond(['ok' => true, 'loggedIn' => $loggedIn, 'passwordNeedsChange' => $passwordNeedsChange]);
    }

    if ($action === 'admin-login') {
        $loginIp = client_ip();
        $rateIdentifier = login_identifier($loginIp, 'admin');
        require_request_limit_available($pdo, 'admin-login', $rateIdentifier, 8, 900, 'Previše pokušaja prijave. Pokušajte ponovo za 15 minuta.');
        $body = body_json();
        $password = (string)($body['password'] ?? '');
        if ($password === '' || strlen($password) > password_max_length()) {
            record_request_limit($pdo, 'admin-login', $rateIdentifier);
            respond(['ok' => false, 'message' => 'Pogrešna lozinka.'], 401);
        }
        $stmt = $pdo->prepare('SELECT id, name, email, password_hash, role, auth_version FROM users WHERE email = :email AND role = "admin" LIMIT 1');
        $stmt->execute([':email' => 'admin@ones.local']);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!verify_user_password($password, $user ?: null)) {
            record_request_limit($pdo, 'admin-login', $rateIdentifier);
            respond(['ok' => false, 'message' => 'Pogrešna lozinka.'], 401);
        }

        clear_request_limit($pdo, 'admin-login', $rateIdentifier);
        rehash_password_if_needed($pdo, $user, $password);
        establish_auth_session('admin', $user, $requestAuthEpoch);
        respond(['ok' => true, 'user' => ['name' => $user['name'], 'email' => $user['email'], 'role' => $user['role']]]);
    }

    if ($action === 'admin-password-update') {
        require_admin();
        $body = body_json();
        $currentPassword = (string)($body['currentPassword'] ?? '');
        $newPassword = (string)($body['newPassword'] ?? '');
        $passwordError = password_validation_error($newPassword, true);

        if ($passwordError !== null) {
            respond(['ok' => false, 'message' => $passwordError], 400);
        }

        $adminId = (int)$_SESSION['admin_id'];
        $rateIdentifier = login_identifier(client_ip(), 'admin-password:' . $adminId);
        require_request_limit_available($pdo, 'admin-password-update', $rateIdentifier, 6, 900, 'Previše pokušaja potvrde lozinke. Pokušajte ponovo za 15 minuta.');
        $stmt = $pdo->prepare('SELECT id, name, password_hash, auth_version FROM users WHERE id = :id AND role = "admin" LIMIT 1');
        $stmt->execute([':id' => $adminId]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);
        if (strlen($currentPassword) > password_max_length() || !verify_user_password($currentPassword, $user ?: null)) {
            record_request_limit($pdo, 'admin-password-update', $rateIdentifier);
            respond(['ok' => false, 'message' => 'Trenutna admin lozinka nije ispravna.'], 401);
        }
        if (password_verify($newPassword, (string)$user['password_hash'])) {
            respond(['ok' => false, 'message' => 'Nova admin lozinka mora biti drugačija od trenutne.'], 400);
        }

        $update = $pdo->prepare('UPDATE users SET password_hash = :password_hash, auth_version = auth_version + 1 WHERE id = :id AND role = "admin"');
        $update->execute([
            ':password_hash' => hash_password($newPassword),
            ':id' => $adminId,
        ]);
        clear_request_limit($pdo, 'admin-password-update', $rateIdentifier);
        $user['auth_version'] = (int)($user['auth_version'] ?? 0) + 1;
        establish_auth_session('admin', $user, $requestAuthEpoch);
        respond(['ok' => true]);
    }

    if ($action === 'customer-status') {
        $loggedIn = customer_session_active($pdo);
        $user = null;
        if ($loggedIn) {
            $stmt = $pdo->prepare('SELECT name, email, phone FROM users WHERE id = :id LIMIT 1');
            $stmt->execute([':id' => (int)$_SESSION['customer_id']]);
            $row = $stmt->fetch(PDO::FETCH_ASSOC);
            $user = $row ? ['name' => $row['name'], 'email' => $row['email'], 'phone' => $row['phone'], 'role' => 'customer'] : null;
        }
        respond([
            'ok' => true,
            'loggedIn' => $loggedIn,
            'user' => $user,
            'favorites' => $loggedIn ? favorites_payload($pdo, (int)$_SESSION['customer_id']) : [],
        ]);
    }

    if ($action === 'customer-profile') {
        $userId = require_customer();
        $stmt = $pdo->prepare('SELECT name, email, phone, created_at FROM users WHERE id = :id LIMIT 1');
        $stmt->execute([':id' => $userId]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$user) {
            respond(['ok' => false, 'message' => 'Korisnik nije pronađen.'], 404);
        }

        respond([
            'ok' => true,
            'user' => [
                'name' => $user['name'],
                'email' => $user['email'],
                'phone' => $user['phone'],
                'createdAt' => $user['created_at'],
            ],
            'orders' => customer_orders_payload($pdo, $userId),
            'cart' => cart_payload($pdo, $userId),
            'favorites' => favorites_payload($pdo, $userId),
            'favoriteProducts' => favorite_products_payload($pdo, $userId),
        ]);
    }

    if ($action === 'customer-profile-update') {
        $userId = require_customer();
        $body = body_json();
        $name = trim((string)($body['name'] ?? ''));
        $email = trim(strtolower((string)($body['email'] ?? '')));
        $phone = trim((string)($body['phone'] ?? ''));
        $currentPassword = (string)($body['currentPassword'] ?? '');

        if (cms_text_length($name) < 2 || cms_text_length($name) > 120 || strlen($email) > 190 || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            respond(['ok' => false, 'message' => 'Unesite ime i ispravan email.'], 400);
        }
        $phoneError = phone_validation_error($phone);
        if ($phoneError !== null) {
            respond(['ok' => false, 'message' => $phoneError], 400);
        }

        $current = $pdo->prepare('SELECT id, name, email, password_hash, auth_version FROM users WHERE id = :id AND role = "customer" LIMIT 1');
        $current->execute([':id' => $userId]);
        $currentUser = $current->fetch(PDO::FETCH_ASSOC);
        if (!$currentUser) {
            clear_auth_session('customer');
            respond(['ok' => false, 'message' => 'Korisnik nije pronađen.'], 404);
        }

        $emailChanged = !hash_equals(strtolower((string)$currentUser['email']), $email);
        if ($emailChanged) {
            $rateIdentifier = login_identifier(client_ip(), 'profile-email:' . $userId);
            require_request_limit_available($pdo, 'customer-profile-email', $rateIdentifier, 6, 900, 'Previše pokušaja potvrde lozinke. Pokušajte ponovo za 15 minuta.');
            if (strlen($currentPassword) > password_max_length() || !verify_user_password($currentPassword, $currentUser)) {
                record_request_limit($pdo, 'customer-profile-email', $rateIdentifier);
                respond(['ok' => false, 'message' => 'Za promjenu emaila unesite ispravnu trenutnu lozinku.'], 401);
            }
            clear_request_limit($pdo, 'customer-profile-email', $rateIdentifier);
            rehash_password_if_needed($pdo, $currentUser, $currentPassword);
        }

        try {
            $stmt = $pdo->prepare('UPDATE users SET name = :name, email = :email, phone = :phone WHERE id = :id AND role = "customer"');
            $stmt->execute([':name' => $name, ':email' => $email, ':phone' => $phone, ':id' => $userId]);
            $_SESSION['customer_name'] = $name;
            if ($emailChanged) {
                $currentUser['name'] = $name;
                establish_auth_session('customer', $currentUser, $requestAuthEpoch);
            }
            respond(['ok' => true, 'profile' => ['name' => $name, 'email' => $email, 'phone' => $phone]]);
        } catch (PDOException $error) {
            if (is_unique_constraint_violation($error)) {
                respond(['ok' => false, 'message' => 'Korisnik sa ovim emailom već postoji.'], 409);
            }
            throw $error;
        }
    }

    if ($action === 'customer-password-update') {
        $userId = require_customer();
        $body = body_json();
        $currentPassword = (string)($body['currentPassword'] ?? '');
        $newPassword = (string)($body['newPassword'] ?? '');
        $passwordError = password_validation_error($newPassword);

        if ($passwordError !== null) {
            respond(['ok' => false, 'message' => $passwordError], 400);
        }

        $rateIdentifier = login_identifier(client_ip(), 'customer-password:' . $userId);
        require_request_limit_available($pdo, 'customer-password-update', $rateIdentifier, 6, 900, 'Previše pokušaja potvrde lozinke. Pokušajte ponovo za 15 minuta.');
        $stmt = $pdo->prepare('SELECT id, name, password_hash, auth_version FROM users WHERE id = :id AND role = "customer" LIMIT 1');
        $stmt->execute([':id' => $userId]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);

        if (strlen($currentPassword) > password_max_length() || !verify_user_password($currentPassword, $user ?: null)) {
            record_request_limit($pdo, 'customer-password-update', $rateIdentifier);
            respond(['ok' => false, 'message' => 'Trenutna lozinka nije ispravna.'], 401);
        }
        if (password_verify($newPassword, (string)$user['password_hash'])) {
            respond(['ok' => false, 'message' => 'Nova lozinka mora biti drugačija od trenutne.'], 400);
        }

        $update = $pdo->prepare('UPDATE users SET password_hash = :password_hash, auth_version = auth_version + 1 WHERE id = :id');
        $update->execute([':password_hash' => hash_password($newPassword), ':id' => $userId]);
        clear_request_limit($pdo, 'customer-password-update', $rateIdentifier);
        $user['auth_version'] = (int)($user['auth_version'] ?? 0) + 1;
        establish_auth_session('customer', $user, $requestAuthEpoch);
        respond(['ok' => true]);
    }

    if ($action === 'customer-register') {
        $body = body_json();
        reject_honeypot($body);
        require_action_rate_limit($pdo, 'customer-register', login_identifier(client_ip()), 6, 3600, 'Previše registracija dolazi sa ove mreže. Pokušajte ponovo kasnije.');
        $name = trim((string)($body['name'] ?? ''));
        $email = trim(strtolower((string)($body['email'] ?? '')));
        $password = (string)($body['password'] ?? '');
        $acceptedPrivacy = !empty($body['acceptedPrivacy']);

        if (!$acceptedPrivacy) {
            respond(['ok' => false, 'message' => 'Potvrdite privatnost i uslove korištenja prije registracije.'], 400);
        }
        if (strlen($name) < 2 || strlen($name) > 120 || strlen($email) > 190 || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            respond(['ok' => false, 'message' => 'Unesite ime i ispravan email.'], 400);
        }
        $passwordError = password_validation_error($password);
        if ($passwordError !== null) {
            respond(['ok' => false, 'message' => $passwordError], 400);
        }

        try {
            $pdo->beginTransaction();
            $stmt = $pdo->prepare('INSERT INTO users (name, email, password_hash, role, created_at, privacy_accepted_at) VALUES (:name, :email, :password_hash, "customer", :created_at, :privacy_accepted_at)');
            $stmt->execute([
                ':name' => $name,
                ':email' => $email,
                ':password_hash' => hash_password($password),
                ':created_at' => date('c'),
                ':privacy_accepted_at' => date('c'),
            ]);
            $userId = (int)$pdo->lastInsertId();
            $cart = $pdo->prepare('INSERT INTO carts (user_id, status, created_at, updated_at) VALUES (:user_id, "active", :created_at, :updated_at)');
            $cart->execute([':user_id' => $userId, ':created_at' => date('c'), ':updated_at' => date('c')]);
            $pdo->commit();

            establish_auth_session('customer', ['id' => $userId, 'name' => $name, 'auth_version' => 0], $requestAuthEpoch);
            respond(['ok' => true, 'user' => ['name' => $name, 'email' => $email, 'role' => 'customer']]);
        } catch (Throwable $error) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            if ($error instanceof PDOException && is_unique_constraint_violation($error)) {
                respond(['ok' => false, 'message' => 'Profil nije moguće kreirati s unesenim podacima.'], 409);
            }
            throw $error;
        }
    }

    if ($action === 'customer-login') {
        $body = body_json();
        $email = trim(strtolower((string)($body['email'] ?? '')));
        $password = (string)($body['password'] ?? '');
        $loginIp = client_ip();
        $ipIdentifier = login_identifier($loginIp);
        $pairIdentifier = login_identifier($loginIp, $email);
        $rateMessage = 'Previše pokušaja prijave. Pokušajte ponovo za 15 minuta.';
        require_request_limit_available($pdo, 'customer-login-ip', $ipIdentifier, 30, 900, $rateMessage);
        require_request_limit_available($pdo, 'customer-login-pair', $pairIdentifier, 8, 900, $rateMessage);
        if (strlen($email) > 190 || strlen($password) > password_max_length()) {
            record_request_limit($pdo, 'customer-login-ip', $ipIdentifier);
            record_request_limit($pdo, 'customer-login-pair', $pairIdentifier);
            respond(['ok' => false, 'message' => 'Pogrešan email ili lozinka.'], 401);
        }

        $stmt = $pdo->prepare('SELECT id, name, email, password_hash, role, auth_version FROM users WHERE email = :email AND role = "customer" LIMIT 1');
        $stmt->execute([':email' => $email]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!verify_user_password($password, $user ?: null)) {
            record_request_limit($pdo, 'customer-login-ip', $ipIdentifier);
            record_request_limit($pdo, 'customer-login-pair', $pairIdentifier);
            respond(['ok' => false, 'message' => 'Pogrešan email ili lozinka.'], 401);
        }

        clear_request_limit($pdo, 'customer-login-pair', $pairIdentifier);
        rehash_password_if_needed($pdo, $user, $password);
        establish_auth_session('customer', $user, $requestAuthEpoch);
        respond(['ok' => true, 'user' => ['name' => $user['name'], 'email' => $user['email'], 'role' => 'customer']]);
    }

    if ($action === 'customer-logout') {
        clear_auth_session('customer');
        respond(['ok' => true]);
    }

    if ($action === 'cart') {
        $userId = require_customer();
        respond(['ok' => true, 'cart' => cart_payload($pdo, $userId)]);
    }

    if ($action === 'favorites') {
        $userId = require_customer();
        respond(['ok' => true, 'favorites' => favorites_payload($pdo, $userId)]);
    }

    if ($action === 'favorite-toggle') {
        $userId = require_customer();
        $body = body_json();
        $productId = trim((string)($body['productId'] ?? ''));
        $products = products_by_id($pdo);

        if ($productId === '' || !isset($products[$productId]) || ($products[$productId]['enabled'] ?? true) === false) {
            respond(['ok' => false, 'message' => 'Proizvod nije pronađen.'], 404);
        }

        $existing = $pdo->prepare('SELECT id FROM product_favorites WHERE user_id = :user_id AND product_id = :product_id LIMIT 1');
        $existing->execute([':user_id' => $userId, ':product_id' => $productId]);
        $favoriteId = $existing->fetchColumn();

        if ($favoriteId) {
            $delete = $pdo->prepare('DELETE FROM product_favorites WHERE id = :id AND user_id = :user_id');
            $delete->execute([':id' => (int)$favoriteId, ':user_id' => $userId]);
            $favorited = false;
        } else {
            $insert = $pdo->prepare('INSERT INTO product_favorites (user_id, product_id, created_at) VALUES (:user_id, :product_id, :created_at)');
            $insert->execute([':user_id' => $userId, ':product_id' => $productId, ':created_at' => date('c')]);
            $favorited = true;
        }

        respond(['ok' => true, 'favorited' => $favorited, 'favorites' => favorites_payload($pdo, $userId)]);
    }

    if ($action === 'cart-add') {
        $userId = require_customer();
        $body = body_json();
        $productId = trim((string)($body['productId'] ?? ''));
        $quantityValue = $body['quantity'] ?? 1;
        if (!is_int($quantityValue) || $quantityValue < 1 || $quantityValue > 99) {
            respond(['ok' => false, 'message' => 'Količina mora biti između 1 i 99.'], 400);
        }
        $quantity = $quantityValue;
        $products = products_by_id($pdo);

        if ($productId === '' || !isset($products[$productId]) || ($products[$productId]['enabled'] ?? true) === false) {
            respond(['ok' => false, 'message' => 'Proizvod nije pronađen.'], 404);
        }

        try {
            $pdo->beginTransaction();
            $cartId = active_cart_id($pdo, $userId);
            add_cart_item($pdo, $cartId, $productId, $quantity);
            $pdo->prepare('UPDATE carts SET updated_at = :updated_at WHERE id = :id AND user_id = :user_id')->execute([
                ':updated_at' => date('c'),
                ':id' => $cartId,
                ':user_id' => $userId,
            ]);
            $pdo->commit();
        } catch (Throwable $error) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $error;
        }
        respond(['ok' => true, 'cart' => cart_payload($pdo, $userId)]);
    }

    if ($action === 'cart-update') {
        $userId = require_customer();
        $body = body_json();
        $itemId = (int)($body['itemId'] ?? 0);
        $quantityValue = $body['quantity'] ?? null;
        if ($itemId < 1 || !is_int($quantityValue) || $quantityValue < 0 || $quantityValue > 99) {
            respond(['ok' => false, 'message' => 'Stavka ili količina nisu ispravni.'], 400);
        }
        $quantity = $quantityValue;
        $cartId = active_cart_id($pdo, $userId);
        $exists = $pdo->prepare('SELECT id FROM cart_items WHERE id = :id AND cart_id = :cart_id LIMIT 1');
        $exists->execute([':id' => $itemId, ':cart_id' => $cartId]);
        if (!$exists->fetchColumn()) {
            respond(['ok' => false, 'message' => 'Stavka korpe nije pronađena. Osvježite korpu.'], 404);
        }

        if ($quantity === 0) {
            $stmt = $pdo->prepare('DELETE FROM cart_items WHERE id = :id AND cart_id = :cart_id');
            $stmt->execute([':id' => $itemId, ':cart_id' => $cartId]);
        } else {
            $stmt = $pdo->prepare('UPDATE cart_items SET quantity = :quantity WHERE id = :id AND cart_id = :cart_id');
            $stmt->execute([':quantity' => $quantity, ':id' => $itemId, ':cart_id' => $cartId]);
        }

        $pdo->prepare('UPDATE carts SET updated_at = :updated_at WHERE id = :id')->execute([':updated_at' => date('c'), ':id' => $cartId]);
        respond(['ok' => true, 'cart' => cart_payload($pdo, $userId)]);
    }

    if ($action === 'cart-remove') {
        $userId = require_customer();
        $body = body_json();
        $itemId = (int)($body['itemId'] ?? 0);
        if ($itemId < 1) {
            respond(['ok' => false, 'message' => 'Stavka korpe nije ispravna.'], 400);
        }
        $cartId = active_cart_id($pdo, $userId);
        $stmt = $pdo->prepare('DELETE FROM cart_items WHERE id = :id AND cart_id = :cart_id');
        $stmt->execute([':id' => $itemId, ':cart_id' => $cartId]);
        if ($stmt->rowCount() !== 1) {
            respond(['ok' => false, 'message' => 'Stavka korpe nije pronađena. Osvježite korpu.'], 404);
        }
        $pdo->prepare('UPDATE carts SET updated_at = :updated_at WHERE id = :id')->execute([':updated_at' => date('c'), ':id' => $cartId]);
        respond(['ok' => true, 'cart' => cart_payload($pdo, $userId)]);
    }

    if ($action === 'order-submit') {
        $userId = require_customer();
        $body = body_json();
        reject_honeypot($body);
        $phone = trim((string)($body['phone'] ?? ''));
        $note = trim((string)($body['note'] ?? ''));
        $updateProfilePhone = !empty($body['updateProfilePhone']);
        $cart = cart_payload($pdo, $userId);

        if (empty($cart['items'])) {
            respond(['ok' => false, 'message' => 'Korpa je prazna.'], 400);
        }
        foreach ($cart['items'] as $cartItem) {
            if (($cartItem['product']['enabled'] ?? true) === false) {
                respond(['ok' => false, 'message' => 'Jedan od proizvoda u korpi više nije dostupan. Uklonite ga prije slanja upita.'], 409);
            }
        }

        $userStmt = $pdo->prepare('SELECT name, email, phone FROM users WHERE id = :id LIMIT 1');
        $userStmt->execute([':id' => $userId]);
        $user = $userStmt->fetch(PDO::FETCH_ASSOC);

        if (!$user) {
            respond(['ok' => false, 'message' => 'Korisnik nije pronađen.'], 404);
        }

        if ($phone === '') {
            $phone = (string)($user['phone'] ?? '');
        }
        $phoneError = phone_validation_error($phone, true);
        if ($phoneError !== null) {
            respond(['ok' => false, 'message' => $phoneError], 400);
        }
        if (cms_text_length($note) > 1000) {
            respond(['ok' => false, 'message' => 'Napomena može imati najviše 1000 znakova.'], 400);
        }

        require_action_rate_limit($pdo, 'order-submit', 'user:' . $userId, 3, 600, 'Poslali ste više upita u kratkom periodu. Pokušajte ponovo za nekoliko minuta.');
        require_action_rate_limit($pdo, 'order-submit', 'user-day:' . $userId, 10, 86400, 'Dnevni limit upita je dostignut. Pokušajte ponovo sutra ili nas kontaktirajte direktno.');
        require_action_rate_limit($pdo, 'order-submit', login_identifier(client_ip(), 'order-submit'), 20, 86400, 'Previše upita dolazi sa ove mreže. Pokušajte ponovo kasnije.');

        try {
            $orderId = create_order_from_cart($pdo, $userId, (int)$cart['cartId'], $user, $phone, $note, $updateProfilePhone);
        } catch (OrderSubmissionConflict $error) {
            respond(['ok' => false, 'message' => $error->getMessage()], 409);
        }

        respond(['ok' => true, 'order' => ['id' => $orderId], 'cart' => cart_payload($pdo, $userId)]);
    }

    if ($action === 'admin-logout') {
        clear_auth_session('admin');
        respond(['ok' => true]);
    }

    if ($action === 'admin-orders') {
        require_admin();
        respond(['ok' => true, 'orders' => orders_payload($pdo)]);
    }

    if ($action === 'admin-customers') {
        require_admin();
        respond(['ok' => true, 'customers' => customers_payload($pdo)]);
    }

    if ($action === 'admin-order-status') {
        require_admin();
        $body = body_json();
        $orderId = (int)($body['orderId'] ?? 0);
        $status = trim((string)($body['status'] ?? ''));
        $allowed = ['Novo', 'U obradi', 'Kontaktiran', 'Završeno', 'Otkazano'];

        if ($orderId < 1 || !in_array($status, $allowed, true)) {
            respond(['ok' => false, 'message' => 'Neispravan status narudžbe.'], 400);
        }
        $exists = $pdo->prepare('SELECT id FROM orders WHERE id = :id LIMIT 1');
        $exists->execute([':id' => $orderId]);
        if (!$exists->fetchColumn()) {
            respond(['ok' => false, 'message' => 'Upit nije pronađen.'], 404);
        }

        $stmt = $pdo->prepare('UPDATE orders SET status = :status, updated_at = :updated_at WHERE id = :id');
        $stmt->execute([':status' => $status, ':updated_at' => date('c'), ':id' => $orderId]);
        respond(['ok' => true, 'orders' => orders_payload($pdo)]);
    }

    if ($action === 'admin-order-note') {
        require_admin();
        $body = body_json();
        $orderId = (int)($body['orderId'] ?? 0);
        $note = trim((string)($body['note'] ?? ''));

        if ($orderId < 1) {
            respond(['ok' => false, 'message' => 'Narudžba nije pronađena.'], 400);
        }
        if (cms_text_length($note) > 1000) {
            respond(['ok' => false, 'message' => 'Interna napomena može imati najviše 1000 znakova.'], 400);
        }
        $exists = $pdo->prepare('SELECT id FROM orders WHERE id = :id LIMIT 1');
        $exists->execute([':id' => $orderId]);
        if (!$exists->fetchColumn()) {
            respond(['ok' => false, 'message' => 'Upit nije pronađen.'], 404);
        }

        $stmt = $pdo->prepare('UPDATE orders SET admin_note = :note, updated_at = :updated_at WHERE id = :id');
        $stmt->execute([':note' => $note, ':updated_at' => date('c'), ':id' => $orderId]);
        respond(['ok' => true, 'orders' => orders_payload($pdo)]);
    }

    if ($action === 'backup-download') {
        require_admin();
        $filename = 'ones-backup-' . date('Y-m-d-His') . '.json';
        $backupJson = encode_json_or_fail(backup_payload($pdo), true);
        header('Content-Type: application/json; charset=utf-8');
        header('Content-Disposition: attachment; filename="' . $filename . '"');
        header('Content-Length: ' . strlen($backupJson));
        echo $backupJson;
        exit;
    }

    if ($action === 'backup-restore') {
        require_admin();

        if (empty($_FILES['backup']) || ($_FILES['backup']['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
            respond(['ok' => false, 'message' => 'Odaberite backup JSON fajl.'], 400);
        }
        if ((int)($_FILES['backup']['size'] ?? 0) > 20 * 1024 * 1024) {
            respond(['ok' => false, 'message' => 'Backup može biti maksimalno 20 MB.'], 400);
        }

        $raw = file_get_contents($_FILES['backup']['tmp_name']);
        if ($raw === false || $raw === '') {
            respond(['ok' => false, 'message' => 'Backup fajl se ne može pročitati.'], 400);
        }
        try {
            $backup = json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
        } catch (JsonException $error) {
            respond(['ok' => false, 'message' => 'Backup nije ispravan JSON fajl.'], 400);
        }
        [$valid, $message] = validate_backup_payload($backup);

        if (!$valid) {
            respond(['ok' => false, 'message' => $message], 400);
        }

        $revision = restore_backup_payload($pdo, $backup);
        clear_auth_session('admin', false);
        clear_auth_session('customer', false);
        session_regenerate_id(true);
        respond(['ok' => true, 'reauthenticate' => true, 'revision' => $revision]);
    }

    if ($action === 'upload-product-image') {
        require_admin();
        respond(['ok' => true, 'file' => upload_product_image()]);
    }

    if ($action === 'upload-blog-image') {
        require_admin();
        respond(['ok' => true, 'file' => upload_blog_image()]);
    }

    if ($action === 'upload-manual') {
        require_admin();
        respond(['ok' => true, 'file' => upload_manual_file()]);
    }

    if ($action === 'save-cms') {
        require_admin();
        $body = body_json();
        if (!isset($body['cms']) || !is_array($body['cms'])) {
            respond(['ok' => false, 'message' => 'CMS podaci nedostaju.'], 400);
        }
        $validationErrors = cms_validate_payload($body['cms']);
        if ($validationErrors) {
            respond([
                'ok' => false,
                'message' => 'CMS nije sačuvan. ' . $validationErrors[0],
                'errors' => $validationErrors,
            ], 422);
        }
        $expectedRevision = null;
        if (array_key_exists('revision', $body)) {
            if (!is_int($body['revision']) || $body['revision'] < 1) {
                respond(['ok' => false, 'message' => 'CMS revizija nije ispravna. Osvježite stranicu.'], 400);
            }
            $expectedRevision = $body['revision'];
        }
        try {
            $revision = save_cms($pdo, $body['cms'], $expectedRevision);
        } catch (CmsRevisionConflict $error) {
            respond(['ok' => false, 'message' => $error->getMessage(), 'revision' => get_cms_revision($pdo)], 409);
        }
        respond(['ok' => true, 'cms' => get_cms($pdo), 'revision' => $revision]);
    }

    if ($action === 'reset-cms') {
        require_admin();
        $body = body_json();
        $expectedRevision = isset($body['revision']) && is_int($body['revision']) ? $body['revision'] : null;
        try {
            $revision = save_cms($pdo, default_cms(), $expectedRevision);
        } catch (CmsRevisionConflict $error) {
            respond(['ok' => false, 'message' => $error->getMessage(), 'revision' => get_cms_revision($pdo)], 409);
        }
        respond(['ok' => true, 'cms' => get_cms($pdo), 'revision' => $revision]);
    }

    respond(['ok' => false, 'message' => 'Nepoznata akcija.'], 404);
} catch (Throwable $error) {
    error_log('oneS API error: ' . $error->getMessage());
    respond([
        'ok' => false,
        'message' => $isLocalHost ? $error->getMessage() : 'Došlo je do greške na serveru. Pokušajte ponovo.',
    ], 500);
}
