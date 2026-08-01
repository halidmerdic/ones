<?php
declare(strict_types=1);

ini_set('session.gc_maxlifetime', (string)(60 * 60 * 24 * 7));
ini_set('session.use_strict_mode', '1');
session_name('ones_session');
session_set_cookie_params([
    'lifetime' => 60 * 60 * 24 * 7,
    'path' => '/',
    'secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off',
    'httponly' => true,
    'samesite' => 'Lax',
]);
session_start();

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate');

$action = $_GET['action'] ?? '';
$host = strtolower((string)($_SERVER['HTTP_HOST'] ?? ''));
$isLocalHost = $host === '' || strpos($host, '127.0.0.1') === 0 || strpos($host, 'localhost') === 0;
$configPath = file_exists(__DIR__ . '/config.local.php')
    ? __DIR__ . '/config.local.php'
    : (file_exists(__DIR__ . '/config.php') ? __DIR__ . '/config.php' : '');

if ($configPath === '' && !$isLocalHost) {
    http_response_code(500);
    echo json_encode([
        'ok' => false,
        'message' => 'Nedostaje config.local.php na hostingu. Aplikacija nije spojena na MySQL bazu.',
    ], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    exit;
}

$config = $configPath !== '' ? require $configPath : require __DIR__ . '/config.example.php';

if (!$isLocalHost && strtolower((string)($config['database']['driver'] ?? '')) !== 'mysql') {
    http_response_code(500);
    echo json_encode([
        'ok' => false,
        'message' => 'Hosting config nije podešen na MySQL. Provjerite config.local.php i driver postavite na mysql.',
    ], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    exit;
}

function respond($data, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    exit;
}

function body_json(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === false || trim($raw) === '') {
        return [];
    }

    $data = json_decode($raw, true);
    if (!is_array($data)) {
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

function login_attempt_key(string $scope): string
{
    return 'login_attempts_' . preg_replace('/[^a-z0-9_-]+/i', '-', $scope);
}

function require_login_window(string $scope): void
{
    $key = login_attempt_key($scope);
    $now = time();
    $attempts = array_values(array_filter(
        is_array($_SESSION[$key] ?? null) ? $_SESSION[$key] : [],
        static fn($timestamp): bool => is_int($timestamp) && $timestamp > $now - 900
    ));
    $_SESSION[$key] = $attempts;

    if (count($attempts) >= 6) {
        respond(['ok' => false, 'message' => 'Previše pokušaja prijave. Pokušajte ponovo za 15 minuta.'], 429);
    }
}

function record_login_failure(string $scope): void
{
    $key = login_attempt_key($scope);
    $attempts = is_array($_SESSION[$key] ?? null) ? $_SESSION[$key] : [];
    $attempts[] = time();
    $_SESSION[$key] = $attempts;
}

function clear_login_failures(string $scope): void
{
    unset($_SESSION[login_attempt_key($scope)]);
}

function client_ip(): string
{
    foreach (['HTTP_CF_CONNECTING_IP', 'HTTP_X_FORWARDED_FOR', 'REMOTE_ADDR'] as $key) {
        $value = trim((string)($_SERVER[$key] ?? ''));
        if ($value === '') {
            continue;
        }
        $ip = trim(explode(',', $value)[0]);
        if (filter_var($ip, FILTER_VALIDATE_IP)) {
            return $ip;
        }
    }

    return 'unknown';
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
    $cutoff = date('c', time() - $windowSeconds);
    $cleanup = $pdo->prepare('DELETE FROM request_limits WHERE created_at < :cutoff');
    $cleanup->execute([':cutoff' => date('c', time() - 60 * 60 * 24 * 2)]);

    $count = $pdo->prepare('SELECT COUNT(*) FROM request_limits WHERE action = :action AND identifier = :identifier AND created_at >= :cutoff');
    $count->execute([':action' => $action, ':identifier' => $identifier, ':cutoff' => $cutoff]);
    if ((int)$count->fetchColumn() >= $maxAttempts) {
        respond(['ok' => false, 'message' => $message], 429);
    }

    $insert = $pdo->prepare('INSERT INTO request_limits (action, identifier, created_at) VALUES (:action, :identifier, :created_at)');
    $insert->execute([':action' => $action, ':identifier' => $identifier, ':created_at' => date('c')]);
}

function default_cms(): array
{
    return [
        'contact' => [
            'whatsapp' => '062455779',
            'viber' => '062455779',
            'email' => 'info@fontele.ba',
            'defaultMessage' => 'Pozdrav, zanima me oneS proizvod.',
        ],
        'sections' => [
            'hero' => true,
            'trust' => true,
            'categories' => true,
            'products' => true,
            'comingSoon' => true,
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
            ['title' => 'Kako odabrati električni romobil za gradsku vožnju', 'text' => 'Savjeti o dometu, brzini, bateriji, težini i održavanju.', 'tag' => 'Romobili'],
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
        ]);
        $pdo->exec('CREATE TABLE IF NOT EXISTS cms_store (`key` VARCHAR(64) PRIMARY KEY, `value` LONGTEXT NOT NULL, updated_at VARCHAR(64) NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
        $pdo->exec('CREATE TABLE IF NOT EXISTS users (id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT, name VARCHAR(190) NOT NULL, email VARCHAR(190) NOT NULL UNIQUE, password_hash VARCHAR(255) NOT NULL, role VARCHAR(40) NOT NULL DEFAULT "customer", created_at VARCHAR(64) NOT NULL, phone VARCHAR(80) NOT NULL DEFAULT "", privacy_accepted_at VARCHAR(64) NOT NULL DEFAULT "") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
        $pdo->exec('CREATE TABLE IF NOT EXISTS carts (id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT, user_id INT UNSIGNED NOT NULL, status VARCHAR(40) NOT NULL DEFAULT "active", created_at VARCHAR(64) NOT NULL, updated_at VARCHAR(64) NOT NULL, INDEX(user_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
        $pdo->exec('CREATE TABLE IF NOT EXISTS cart_items (id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT, cart_id INT UNSIGNED NOT NULL, product_id VARCHAR(190) NOT NULL, quantity INT UNSIGNED NOT NULL DEFAULT 1, created_at VARCHAR(64) NOT NULL, INDEX(cart_id), INDEX(product_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
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
        $pdo->exec('PRAGMA foreign_keys = ON');
        $pdo->exec('CREATE TABLE IF NOT EXISTS cms_store (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)');
        $pdo->exec('CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT "customer", created_at TEXT NOT NULL, privacy_accepted_at TEXT NOT NULL DEFAULT "")');
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
    if (!has_column($pdo, 'orders', 'admin_note')) {
        $pdo->exec(database_driver($pdo) === 'mysql'
            ? 'ALTER TABLE orders ADD COLUMN admin_note VARCHAR(1000) NOT NULL DEFAULT ""'
            : 'ALTER TABLE orders ADD COLUMN admin_note TEXT NOT NULL DEFAULT ""');
    }
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
        if (!$isLocalHost && (strlen($initialPassword) < 12 || $initialPassword === 'PROMIJENI-U-JAKU-LOZINKU')) {
            throw new RuntimeException('Prije prvog pokretanja postavite security.initial_admin_password sa najmanje 12 znakova u config.local.php.');
        }

        $stmt = $pdo->prepare('INSERT INTO users (name, email, password_hash, role, created_at) VALUES (:name, :email, :password_hash, "admin", :created_at)');
        $stmt->execute([
            ':name' => 'oneS Admin',
            ':email' => 'admin@ones.local',
            ':password_hash' => password_hash($initialPassword, PASSWORD_DEFAULT),
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
    foreach (['whatsapp', 'viber'] as $channel) {
        if (($cms['contact'][$channel] ?? '') === '38761000000') {
            $cms['contact'][$channel] = default_cms()['contact'][$channel];
        }
    }

    return sanitize_cms_content($cms);
}

function sanitize_cms_content(array $cms): array
{
    if (!isset($cms['products']) || !is_array($cms['products'])) {
        return $cms;
    }

    $invalidScooterSpecs = ['Programi', 'Posuda', 'Upotreba'];
    foreach ($cms['products'] as &$product) {
        if (!is_array($product)) {
            continue;
        }

        $category = (string)($product['category'] ?? '');
        $isScooter = stripos($category, 'romobil') !== false || stripos($category, 'skuter') !== false;
        if (!$isScooter) {
            continue;
        }

        foreach (['specs', 'attributes'] as $field) {
            if (!isset($product[$field]) || !is_array($product[$field])) {
                continue;
            }
            foreach ($invalidScooterSpecs as $specName) {
                unset($product[$field][$specName]);
            }
        }
    }
    unset($product);

    return $cms;
}

function cms_products_missing_sale_end_date(array $cms): array
{
    $missing = [];
    foreach (($cms['products'] ?? []) as $product) {
        if (!is_array($product)) {
            continue;
        }

        $salePrice = (float)str_replace(',', '.', (string)($product['salePrice'] ?? '0'));
        $saleUntil = trim((string)($product['saleUntil'] ?? ''));
        if ($salePrice > 0 && $saleUntil === '') {
            $missing[] = (string)($product['name'] ?? $product['id'] ?? 'Proizvod');
        }
    }

    return $missing;
}

function save_cms(PDO $pdo, array $cms): void
{
    $cms = sanitize_cms_content($cms);
    $stmt = $pdo->prepare('UPDATE cms_store SET value = :value, updated_at = :updated_at WHERE ' . quote_identifier($pdo, 'key') . ' = "cms"');
    $stmt->execute([
        ':value' => json_encode($cms, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT),
        ':updated_at' => date('c'),
    ]);
}

function upload_dir(): string
{
    $dir = __DIR__ . DIRECTORY_SEPARATOR . 'uploads' . DIRECTORY_SEPARATOR . 'products';
    if (!is_dir($dir)) {
        mkdir($dir, 0775, true);
    }

    return $dir;
}

function image_upload_config(string $folder): string
{
    $dir = __DIR__ . DIRECTORY_SEPARATOR . 'uploads' . DIRECTORY_SEPARATOR . $folder;
    if (!is_dir($dir)) {
        mkdir($dir, 0775, true);
    }

    return $dir;
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

function save_optimized_image(array $file, string $folder, string $prefix, int $maxWidth, int $maxHeight): array
{
    $maxSize = 5 * 1024 * 1024;
    if ($file['size'] > $maxSize) {
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

        if (!move_uploaded_file($file['tmp_name'], $target)) {
            respond(['ok' => false, 'message' => 'Upload nije uspio.'], 500);
        }

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

    if (!imagewebp($targetImage, $target, 82)) {
        imagedestroy($source);
        imagedestroy($targetImage);
        respond(['ok' => false, 'message' => 'Optimizacija slike nije uspjela.'], 500);
    }

    imagedestroy($source);
    imagedestroy($targetImage);

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
    if (!isset($_FILES['image']) || $_FILES['image']['error'] !== UPLOAD_ERR_OK) {
        respond(['ok' => false, 'message' => 'Slika nije poslana.'], 400);
    }

    return save_optimized_image($_FILES['image'], 'products', 'product', 1200, 1200);
}

function upload_blog_image(): array
{
    if (!isset($_FILES['image']) || $_FILES['image']['error'] !== UPLOAD_ERR_OK) {
        respond(['ok' => false, 'message' => 'Slika nije poslana.'], 400);
    }

    return save_optimized_image($_FILES['image'], 'blogs', 'blog', 1600, 900);
}

function upload_manual_file(): array
{
    if (!isset($_FILES['manual']) || $_FILES['manual']['error'] !== UPLOAD_ERR_OK) {
        respond(['ok' => false, 'message' => 'Uputstvo nije poslano.'], 400);
    }

    $file = $_FILES['manual'];
    $maxSize = 15 * 1024 * 1024;
    if ($file['size'] > $maxSize) {
        respond(['ok' => false, 'message' => 'PDF može biti maksimalno 15 MB.'], 400);
    }

    $finfo = new finfo(FILEINFO_MIME_TYPE);
    $mime = $finfo->file($file['tmp_name']);
    if ($mime !== 'application/pdf') {
        respond(['ok' => false, 'message' => 'Dozvoljen je samo PDF format.'], 400);
    }

    $dir = __DIR__ . DIRECTORY_SEPARATOR . 'uploads' . DIRECTORY_SEPARATOR . 'manuals';
    if (!is_dir($dir)) {
        mkdir($dir, 0775, true);
    }

    $safeBase = preg_replace('/[^a-zA-Z0-9-_]+/', '-', pathinfo($file['name'], PATHINFO_FILENAME));
    $safeBase = trim((string)$safeBase, '-');
    if ($safeBase === '') {
        $safeBase = 'manual';
    }

    $name = strtolower($safeBase) . '-' . date('YmdHis') . '-' . bin2hex(random_bytes(4)) . '.pdf';
    $target = $dir . DIRECTORY_SEPARATOR . $name;

    if (!move_uploaded_file($file['tmp_name'], $target)) {
        respond(['ok' => false, 'message' => 'Upload uputstva nije uspio.'], 500);
    }

    return [
        'path' => 'uploads/manuals/' . $name,
        'name' => $name,
    ];
}

function admin_session_active(): bool
{
    if (empty($_SESSION['admin_id'])) {
        return false;
    }

    $lastActivity = (int)($_SESSION['admin_last_activity'] ?? time());
    if ($lastActivity < time() - 1800) {
        unset($_SESSION['admin_id'], $_SESSION['admin_name'], $_SESSION['admin_last_activity']);
        return false;
    }

    $_SESSION['admin_last_activity'] = time();
    return true;
}

function require_admin(): void
{
    if (!admin_session_active()) {
        respond(['ok' => false, 'message' => 'Potrebna je admin prijava.'], 401);
    }
}

function require_customer(): int
{
    if (empty($_SESSION['customer_id'])) {
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

function products_by_id(PDO $pdo): array
{
    $cms = get_cms($pdo);
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

function cart_payload(PDO $pdo, int $userId): array
{
    $cartId = active_cart_id($pdo, $userId);
    $products = products_by_id($pdo);
    $stmt = $pdo->prepare('SELECT id, product_id, quantity FROM cart_items WHERE cart_id = :cart_id ORDER BY id DESC');
    $stmt->execute([':cart_id' => $cartId]);
    $items = [];

    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $productId = (string)$row['product_id'];
        $product = $products[$productId] ?? ['id' => $productId, 'name' => 'Obrisan proizvod', 'summary' => ''];
        $items[] = [
            'id' => (int)$row['id'],
            'productId' => $productId,
            'quantity' => (int)$row['quantity'],
            'product' => $product,
        ];
    }

    return ['cartId' => $cartId, 'items' => $items, 'count' => array_sum(array_column($items, 'quantity'))];
}

function favorites_payload(PDO $pdo, int $userId): array
{
    $stmt = $pdo->prepare('SELECT product_id FROM product_favorites WHERE user_id = :user_id ORDER BY id DESC');
    $stmt->execute([':user_id' => $userId]);
    return array_map(static fn(array $row): string => (string)$row['product_id'], $stmt->fetchAll(PDO::FETCH_ASSOC));
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
    $orderStmt = $pdo->prepare('SELECT id, phone, note, admin_note, status, items_json, created_at, updated_at FROM orders WHERE user_id = :user_id ORDER BY id DESC');

    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $orderStmt->execute([':user_id' => (int)$row['id']]);
        $orders = [];

        foreach ($orderStmt->fetchAll(PDO::FETCH_ASSOC) as $order) {
            $items = json_decode((string)$order['items_json'], true);
            $orders[] = [
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
        'version' => 1,
        'createdAt' => date('c'),
        'containsSensitiveData' => true,
        'cms' => get_cms($pdo),
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
    if (!is_dir($dir)) {
        mkdir($dir, 0775, true);
    }
    return $dir;
}

function validate_backup_payload($backup): array
{
    if (!is_array($backup) || !isset($backup['cms']) || !is_array($backup['cms']) || !isset($backup['tables']) || !is_array($backup['tables'])) {
        return [false, 'Backup fajl nema ispravnu strukturu.'];
    }

    foreach (['users', 'carts', 'cart_items', 'orders'] as $table) {
        if (!isset($backup['tables'][$table]) || !is_array($backup['tables'][$table])) {
            return [false, 'Backup fajl nema tabelu: ' . $table . '.'];
        }
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

function restore_backup_payload(PDO $pdo, array $backup): void
{
    $existingHashes = [];
    foreach (table_rows($pdo, 'users') as $user) {
        if (!empty($user['email']) && !empty($user['password_hash'])) {
            $existingHashes[(string)$user['email']] = (string)$user['password_hash'];
        }
    }

    $users = array_map(static function (array $user) use ($existingHashes): array {
        if (empty($user['password_hash'])) {
            $email = (string)($user['email'] ?? '');
            $user['password_hash'] = $existingHashes[$email] ?? password_hash(bin2hex(random_bytes(12)), PASSWORD_DEFAULT);
        }
        return $user;
    }, $backup['tables']['users']);

    $preRestorePath = backup_dir() . DIRECTORY_SEPARATOR . 'pre-restore-' . date('Y-m-d-His') . '.json';
    file_put_contents($preRestorePath, json_encode(backup_payload($pdo), JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));

    try {
        $pdo->beginTransaction();
        save_cms($pdo, $backup['cms']);
        $pdo->exec('DELETE FROM cart_items');
        $pdo->exec('DELETE FROM product_favorites');
        $pdo->exec('DELETE FROM orders');
        $pdo->exec('DELETE FROM carts');
        $pdo->exec('DELETE FROM users');
        insert_rows($pdo, 'users', $users);
        insert_rows($pdo, 'carts', $backup['tables']['carts']);
        insert_rows($pdo, 'cart_items', $backup['tables']['cart_items']);
        insert_rows($pdo, 'product_favorites', $backup['tables']['product_favorites'] ?? []);
        insert_rows($pdo, 'orders', $backup['tables']['orders']);
        $pdo->commit();
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $error;
    }

    seed_database($pdo);
}

try {
    $pdo = database(is_array($config) ? $config : []);

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
        respond(['ok' => true, 'cms' => get_cms($pdo)]);
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
        require_login_window('admin');
        $body = body_json();
        $password = (string)($body['password'] ?? '');
        if (strlen($password) > 4096) {
            record_login_failure('admin');
            respond(['ok' => false, 'message' => 'Pogrešna lozinka.'], 401);
        }
        $stmt = $pdo->prepare('SELECT id, name, email, password_hash, role FROM users WHERE email = :email AND role = "admin" LIMIT 1');
        $stmt->execute([':email' => 'admin@ones.local']);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$user || !password_verify($password, $user['password_hash'])) {
            record_login_failure('admin');
            respond(['ok' => false, 'message' => 'Pogrešna lozinka.'], 401);
        }

        clear_login_failures('admin');
        session_regenerate_id(true);
        $_SESSION['admin_id'] = (int)$user['id'];
        $_SESSION['admin_name'] = $user['name'];
        $_SESSION['admin_last_activity'] = time();
        respond(['ok' => true, 'user' => ['name' => $user['name'], 'email' => $user['email'], 'role' => $user['role']]]);
    }

    if ($action === 'admin-password-update') {
        require_admin();
        $body = body_json();
        $currentPassword = (string)($body['currentPassword'] ?? '');
        $newPassword = (string)($body['newPassword'] ?? '');

        if (strlen($newPassword) < 12 || strlen($newPassword) > 4096) {
            respond(['ok' => false, 'message' => 'Nova admin lozinka mora imati najmanje 12 znakova.'], 400);
        }

        $stmt = $pdo->prepare('SELECT password_hash FROM users WHERE id = :id AND role = "admin" LIMIT 1');
        $stmt->execute([':id' => (int)$_SESSION['admin_id']]);
        $hash = (string)$stmt->fetchColumn();
        if ($hash === '' || !password_verify($currentPassword, $hash)) {
            respond(['ok' => false, 'message' => 'Trenutna admin lozinka nije ispravna.'], 401);
        }

        $update = $pdo->prepare('UPDATE users SET password_hash = :password_hash WHERE id = :id AND role = "admin"');
        $update->execute([
            ':password_hash' => password_hash($newPassword, PASSWORD_DEFAULT),
            ':id' => (int)$_SESSION['admin_id'],
        ]);
        session_regenerate_id(true);
        respond(['ok' => true]);
    }

    if ($action === 'customer-status') {
        $loggedIn = !empty($_SESSION['customer_id']);
        $user = null;
        if ($loggedIn) {
            $stmt = $pdo->prepare('SELECT name, email, phone FROM users WHERE id = :id LIMIT 1');
            $stmt->execute([':id' => (int)$_SESSION['customer_id']]);
            $row = $stmt->fetch(PDO::FETCH_ASSOC);
            $user = $row ? ['name' => $row['name'], 'email' => $row['email'], 'phone' => $row['phone'], 'role' => 'customer'] : ['name' => $_SESSION['customer_name'] ?? '', 'role' => 'customer'];
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

        if (strlen($name) < 2 || strlen($name) > 120 || strlen($email) > 190 || !filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($phone) > 30) {
            respond(['ok' => false, 'message' => 'Unesite ime i ispravan email.'], 400);
        }

        try {
            $stmt = $pdo->prepare('UPDATE users SET name = :name, email = :email, phone = :phone WHERE id = :id AND role = "customer"');
            $stmt->execute([':name' => $name, ':email' => $email, ':phone' => $phone, ':id' => $userId]);
            $_SESSION['customer_name'] = $name;
            respond(['ok' => true, 'profile' => ['name' => $name, 'email' => $email, 'phone' => $phone]]);
        } catch (PDOException $error) {
            respond(['ok' => false, 'message' => 'Korisnik sa ovim emailom već postoji.'], 409);
        }
    }

    if ($action === 'customer-password-update') {
        $userId = require_customer();
        $body = body_json();
        $currentPassword = (string)($body['currentPassword'] ?? '');
        $newPassword = (string)($body['newPassword'] ?? '');

        if (strlen($newPassword) < 8 || strlen($newPassword) > 4096) {
            respond(['ok' => false, 'message' => 'Nova lozinka mora imati najmanje 8 znakova.'], 400);
        }

        $stmt = $pdo->prepare('SELECT password_hash FROM users WHERE id = :id AND role = "customer" LIMIT 1');
        $stmt->execute([':id' => $userId]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$user || !password_verify($currentPassword, $user['password_hash'])) {
            respond(['ok' => false, 'message' => 'Trenutna lozinka nije ispravna.'], 401);
        }

        $update = $pdo->prepare('UPDATE users SET password_hash = :password_hash WHERE id = :id');
        $update->execute([':password_hash' => password_hash($newPassword, PASSWORD_DEFAULT), ':id' => $userId]);
        session_regenerate_id(true);
        $_SESSION['customer_id'] = $userId;
        respond(['ok' => true]);
    }

    if ($action === 'customer-register') {
        require_login_window('customer');
        $body = body_json();
        reject_honeypot($body);
        require_action_rate_limit($pdo, 'customer-register', 'ip:' . client_ip(), 6, 3600, 'Previše registracija dolazi sa ove mreže. Pokušajte ponovo kasnije.');
        $name = trim((string)($body['name'] ?? ''));
        $email = trim(strtolower((string)($body['email'] ?? '')));
        $password = (string)($body['password'] ?? '');
        $acceptedPrivacy = !empty($body['acceptedPrivacy']);

        if (!$acceptedPrivacy) {
            respond(['ok' => false, 'message' => 'Potvrdite privatnost i uslove korištenja prije registracije.'], 400);
        }
        if (strlen($name) < 2 || strlen($name) > 120 || strlen($email) > 190 || !filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($password) < 8 || strlen($password) > 4096) {
            respond(['ok' => false, 'message' => 'Unesite ime, ispravan email i lozinku od najmanje 8 znakova.'], 400);
        }

        try {
            $stmt = $pdo->prepare('INSERT INTO users (name, email, password_hash, role, created_at, privacy_accepted_at) VALUES (:name, :email, :password_hash, "customer", :created_at, :privacy_accepted_at)');
            $stmt->execute([
                ':name' => $name,
                ':email' => $email,
                ':password_hash' => password_hash($password, PASSWORD_DEFAULT),
                ':created_at' => date('c'),
                ':privacy_accepted_at' => date('c'),
            ]);
            $userId = (int)$pdo->lastInsertId();
            $cart = $pdo->prepare('INSERT INTO carts (user_id, status, created_at, updated_at) VALUES (:user_id, "active", :created_at, :updated_at)');
            $cart->execute([':user_id' => $userId, ':created_at' => date('c'), ':updated_at' => date('c')]);

            clear_login_failures('customer');
            session_regenerate_id(true);
            $_SESSION['customer_id'] = $userId;
            $_SESSION['customer_name'] = $name;
            respond(['ok' => true, 'user' => ['name' => $name, 'email' => $email, 'role' => 'customer']]);
        } catch (PDOException $error) {
            respond(['ok' => false, 'message' => 'Korisnik sa ovim emailom već postoji.'], 409);
        }
    }

    if ($action === 'customer-login') {
        require_login_window('customer');
        $body = body_json();
        $email = trim(strtolower((string)($body['email'] ?? '')));
        $password = (string)($body['password'] ?? '');
        if (strlen($email) > 190 || strlen($password) > 4096) {
            respond(['ok' => false, 'message' => 'Pogrešan email ili lozinka.'], 401);
        }

        $stmt = $pdo->prepare('SELECT id, name, email, password_hash, role FROM users WHERE email = :email AND role = "customer" LIMIT 1');
        $stmt->execute([':email' => $email]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$user || !password_verify($password, $user['password_hash'])) {
            record_login_failure('customer');
            respond(['ok' => false, 'message' => 'Pogrešan email ili lozinka.'], 401);
        }

        clear_login_failures('customer');
        session_regenerate_id(true);
        $_SESSION['customer_id'] = (int)$user['id'];
        $_SESSION['customer_name'] = $user['name'];
        respond(['ok' => true, 'user' => ['name' => $user['name'], 'email' => $user['email'], 'role' => 'customer']]);
    }

    if ($action === 'customer-logout') {
        unset($_SESSION['customer_id'], $_SESSION['customer_name']);
        session_regenerate_id(true);
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
        $quantity = max(1, min(99, (int)($body['quantity'] ?? 1)));
        $products = products_by_id($pdo);

        if ($productId === '' || !isset($products[$productId]) || ($products[$productId]['enabled'] ?? true) === false) {
            respond(['ok' => false, 'message' => 'Proizvod nije pronađen.'], 404);
        }

        $cartId = active_cart_id($pdo, $userId);
        $existing = $pdo->prepare('SELECT id, quantity FROM cart_items WHERE cart_id = :cart_id AND product_id = :product_id LIMIT 1');
        $existing->execute([':cart_id' => $cartId, ':product_id' => $productId]);
        $item = $existing->fetch(PDO::FETCH_ASSOC);

        if ($item) {
            $update = $pdo->prepare('UPDATE cart_items SET quantity = :quantity WHERE id = :id');
            $update->execute([':quantity' => min(99, (int)$item['quantity'] + $quantity), ':id' => (int)$item['id']]);
        } else {
            $insert = $pdo->prepare('INSERT INTO cart_items (cart_id, product_id, quantity, created_at) VALUES (:cart_id, :product_id, :quantity, :created_at)');
            $insert->execute([':cart_id' => $cartId, ':product_id' => $productId, ':quantity' => $quantity, ':created_at' => date('c')]);
        }

        $pdo->prepare('UPDATE carts SET updated_at = :updated_at WHERE id = :id')->execute([':updated_at' => date('c'), ':id' => $cartId]);
        respond(['ok' => true, 'cart' => cart_payload($pdo, $userId)]);
    }

    if ($action === 'cart-update') {
        $userId = require_customer();
        $body = body_json();
        $itemId = (int)($body['itemId'] ?? 0);
        $quantity = min(99, (int)($body['quantity'] ?? 1));
        $cartId = active_cart_id($pdo, $userId);

        if ($quantity < 1) {
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
        $cartId = active_cart_id($pdo, $userId);
        $stmt = $pdo->prepare('DELETE FROM cart_items WHERE id = :id AND cart_id = :cart_id');
        $stmt->execute([':id' => (int)($body['itemId'] ?? 0), ':cart_id' => $cartId]);
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
        } elseif ($updateProfilePhone) {
            $pdo->prepare('UPDATE users SET phone = :phone WHERE id = :id')->execute([':phone' => $phone, ':id' => $userId]);
        }

        if ($phone === '') {
            respond(['ok' => false, 'message' => 'Unesite broj telefona prije slanja upita.'], 400);
        }
        if (strlen($phone) < 6 || strlen($phone) > 30) {
            respond(['ok' => false, 'message' => 'Unesite ispravan broj telefona.'], 400);
        }
        if (strlen($note) > 1000) {
            respond(['ok' => false, 'message' => 'Napomena može imati najviše 1000 znakova.'], 400);
        }

        require_action_rate_limit($pdo, 'order-submit', 'user:' . $userId, 3, 600, 'Poslali ste više upita u kratkom periodu. Pokušajte ponovo za nekoliko minuta.');
        require_action_rate_limit($pdo, 'order-submit', 'user-day:' . $userId, 10, 86400, 'Dnevni limit upita je dostignut. Pokušajte ponovo sutra ili nas kontaktirajte direktno.');
        require_action_rate_limit($pdo, 'order-submit', 'ip:' . client_ip(), 20, 86400, 'Previše upita dolazi sa ove mreže. Pokušajte ponovo kasnije.');

        $items = array_map(static function (array $item): array {
            $product = is_array($item['product'] ?? null) ? $item['product'] : [];
            return [
                'productId' => $item['productId'],
                'name' => $product['name'] ?? 'Proizvod',
                'quantity' => (int)$item['quantity'],
                'price' => product_price_label($product),
            ];
        }, $cart['items']);

        try {
            $pdo->beginTransaction();
            $insert = $pdo->prepare('INSERT INTO orders (user_id, customer_name, customer_email, phone, note, status, items_json, created_at, updated_at) VALUES (:user_id, :customer_name, :customer_email, :phone, :note, "Novo", :items_json, :created_at, :updated_at)');
            $insert->execute([
                ':user_id' => $userId,
                ':customer_name' => $user['name'],
                ':customer_email' => $user['email'],
                ':phone' => $phone,
                ':note' => $note,
                ':items_json' => json_encode($items, JSON_UNESCAPED_UNICODE),
                ':created_at' => date('c'),
                ':updated_at' => date('c'),
            ]);
            $orderId = (int)$pdo->lastInsertId();
            $pdo->prepare('UPDATE carts SET status = "submitted", updated_at = :updated_at WHERE id = :id')->execute([':updated_at' => date('c'), ':id' => (int)$cart['cartId']]);
            $pdo->commit();
        } catch (Throwable $error) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $error;
        }

        respond(['ok' => true, 'order' => ['id' => $orderId], 'cart' => cart_payload($pdo, $userId)]);
    }

    if ($action === 'admin-logout') {
        unset($_SESSION['admin_id'], $_SESSION['admin_name'], $_SESSION['admin_last_activity']);
        session_regenerate_id(true);
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

        $stmt = $pdo->prepare('UPDATE orders SET admin_note = :note, updated_at = :updated_at WHERE id = :id');
        $stmt->execute([':note' => $note, ':updated_at' => date('c'), ':id' => $orderId]);
        respond(['ok' => true, 'orders' => orders_payload($pdo)]);
    }

    if ($action === 'backup-download') {
        require_admin();
        $filename = 'ones-backup-' . date('Y-m-d-His') . '.json';
        header('Content-Type: application/json; charset=utf-8');
        header('Content-Disposition: attachment; filename="' . $filename . '"');
        echo json_encode(backup_payload($pdo), JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
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
        $backup = json_decode((string)$raw, true);
        [$valid, $message] = validate_backup_payload($backup);

        if (!$valid) {
            respond(['ok' => false, 'message' => $message], 400);
        }

        restore_backup_payload($pdo, $backup);
        respond(['ok' => true, 'cms' => get_cms($pdo), 'orders' => orders_payload($pdo)]);
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
        $missingSaleDates = cms_products_missing_sale_end_date($body['cms']);
        if ($missingSaleDates) {
            respond([
                'ok' => false,
                'message' => 'CMS nije sačuvan. Dodajte završni datum akcije za: ' . implode(', ', $missingSaleDates) . '.',
            ], 422);
        }
        save_cms($pdo, $body['cms']);
        respond(['ok' => true, 'cms' => get_cms($pdo)]);
    }

    if ($action === 'reset-cms') {
        require_admin();
        save_cms($pdo, default_cms());
        respond(['ok' => true, 'cms' => get_cms($pdo)]);
    }

    respond(['ok' => false, 'message' => 'Nepoznata akcija.'], 404);
} catch (Throwable $error) {
    error_log('oneS API error: ' . $error->getMessage());
    respond([
        'ok' => false,
        'message' => $isLocalHost ? $error->getMessage() : 'Došlo je do greške na serveru. Pokušajte ponovo.',
    ], 500);
}
