<?php
declare(strict_types=1);
// Only the explicit CLI deployment command (or CLI test fixture) can migrate.
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require_once __DIR__ . '/database-schema.php';

function migrate_database(PDO $pdo, array $settings, bool $development = false): void
{
    if ($pdo->inTransaction()) throw new LogicException('Migration needs its own connection.');
    $mysql = database_driver($pdo) === 'mysql';
    $lock = null;
    $lockName = 'ones-schema-' . substr(hash('sha256', $mysql ? (string)$pdo->query('SELECT DATABASE()')->fetchColumn() : ''), 0, 40);
    if ($mysql) {
        $stmt = $pdo->prepare('SELECT GET_LOCK(?, 15)'); $stmt->execute([$lockName]);
        if ((int)$stmt->fetchColumn() !== 1) throw new RuntimeException('Druga migracija je u toku.');
    } else {
        $path = (string)($pdo->query('PRAGMA database_list')->fetch(PDO::FETCH_ASSOC)['file'] ?? '');
        if ($path !== '') {
            $lock = fopen($path . '.migration.lock', 'c');
            if ($lock === false) throw new RuntimeException('Migracijski lock nije dostupan.');
            $deadline = microtime(true) + 15;
            while (!flock($lock, LOCK_EX | LOCK_NB)) {
                if (microtime(true) >= $deadline) { fclose($lock); throw new RuntimeException('Druga migracija je u toku.'); }
                usleep(50000);
            }
        }
    }
    try {
        $pdo->exec('CREATE TABLE IF NOT EXISTS schema_version (id INTEGER PRIMARY KEY, version INTEGER NOT NULL)' . ($mysql ? ' ENGINE=InnoDB' : ''));
        $version = (int)$pdo->query('SELECT version FROM schema_version WHERE id = 1')->fetchColumn();
        if ($version > ONES_SCHEMA_VERSION) throw new RuntimeException('Baza je novija od ovog koda. Koristite odgovarajući release.');
        if ($version < 1) {
            migrate_initial_schema($pdo, $settings, $development);
            $sql = $mysql ? 'INSERT INTO schema_version(id,version) VALUES(1,1) ON DUPLICATE KEY UPDATE version=1'
                : 'INSERT INTO schema_version(id,version) VALUES(1,1) ON CONFLICT(id) DO UPDATE SET version=1';
            $pdo->exec($sql);
        }
        if ($version < 2) {
            migrate_record_pages($pdo);
            $pdo->exec('UPDATE schema_version SET version=2 WHERE id=1');
        }
        require_database_schema($pdo);
    } finally {
        if ($mysql) $pdo->prepare('SELECT RELEASE_LOCK(?)')->execute([$lockName]);
        if (is_resource($lock)) { flock($lock, LOCK_UN); fclose($lock); }
    }
}

function migrate_record_pages(PDO $pdo): void
{
    $mysql = database_driver($pdo) === 'mysql';
    $pdo->exec($mysql
        ? 'CREATE TABLE IF NOT EXISTS order_search_items (order_id INT UNSIGNED NOT NULL, position INT NOT NULL, name TEXT NOT NULL, PRIMARY KEY(order_id,position), FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin'
        : 'CREATE TABLE IF NOT EXISTS order_search_items (order_id INTEGER NOT NULL, position INTEGER NOT NULL, name TEXT NOT NULL, PRIMARY KEY(order_id,position), FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE)');
    foreach ([['orders','orders_user_id','user_id,id'], ['orders','orders_status_id','status,id'],
        ['orders','orders_created_id','created_at,id'], ['users','users_role_id','role,id'],
        ['request_limits','action_identifier_created','action,identifier,created_at']] as [$table,$index,$columns]) {
        if (!has_index($pdo, $table, $index)) $pdo->exec("CREATE INDEX $index ON $table($columns)");
    }
    try {
        $pdo->beginTransaction();
        rebuild_order_items($pdo);
        $pdo->commit();
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $error;
    }
}

function migrate_initial_schema(PDO $pdo, array $settings, bool $development): void
{
    if (database_driver($pdo) === 'mysql') {
        $pdo->exec('CREATE TABLE IF NOT EXISTS cms_store (`key` VARCHAR(64) PRIMARY KEY, `value` LONGTEXT NOT NULL, updated_at VARCHAR(64) NOT NULL, revision INT UNSIGNED NOT NULL DEFAULT 1) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
        $pdo->exec('CREATE TABLE IF NOT EXISTS cms_revisions (id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT, revision INT UNSIGNED NOT NULL, value LONGTEXT NOT NULL, created_at VARCHAR(64) NOT NULL, INDEX(revision)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
        $pdo->exec('CREATE TABLE IF NOT EXISTS users (id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT, name VARCHAR(190) NOT NULL, email VARCHAR(190) NOT NULL UNIQUE, password_hash VARCHAR(255) NOT NULL, role VARCHAR(40) NOT NULL DEFAULT "customer", created_at VARCHAR(64) NOT NULL, phone VARCHAR(80) NOT NULL DEFAULT "", privacy_accepted_at VARCHAR(64) NOT NULL DEFAULT "", auth_version INT UNSIGNED NOT NULL DEFAULT 0) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
        $pdo->exec('CREATE TABLE IF NOT EXISTS carts (id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT, user_id INT UNSIGNED NOT NULL, status VARCHAR(40) NOT NULL DEFAULT "active", created_at VARCHAR(64) NOT NULL, updated_at VARCHAR(64) NOT NULL, INDEX(user_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
        $pdo->exec('CREATE TABLE IF NOT EXISTS cart_items (id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT, cart_id INT UNSIGNED NOT NULL, product_id VARCHAR(190) NOT NULL, quantity INT UNSIGNED NOT NULL DEFAULT 1, created_at VARCHAR(64) NOT NULL, UNIQUE KEY cart_product (cart_id, product_id), INDEX(cart_id), INDEX(product_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
        $pdo->exec('CREATE TABLE IF NOT EXISTS product_favorites (id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT, user_id INT UNSIGNED NOT NULL, product_id VARCHAR(190) NOT NULL, created_at VARCHAR(64) NOT NULL, UNIQUE KEY user_product (user_id, product_id), INDEX(user_id), INDEX(product_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
        $pdo->exec('CREATE TABLE IF NOT EXISTS orders (id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT, user_id INT UNSIGNED NOT NULL, customer_name VARCHAR(190) NOT NULL, customer_email VARCHAR(190) NOT NULL, phone VARCHAR(80) NOT NULL DEFAULT "", note TEXT NOT NULL, status VARCHAR(40) NOT NULL DEFAULT "Novo", items_json LONGTEXT NOT NULL, created_at VARCHAR(64) NOT NULL, updated_at VARCHAR(64) NOT NULL, admin_note VARCHAR(1000) NOT NULL DEFAULT "", INDEX(user_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
        $pdo->exec('CREATE TABLE IF NOT EXISTS request_limits (id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT, action VARCHAR(80) NOT NULL, identifier VARCHAR(190) NOT NULL, created_at VARCHAR(64) NOT NULL, INDEX action_identifier_created (action, identifier, created_at)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
    } else {
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
    initialize_login_limits($pdo);
    initialize_email_security($pdo);
    initialize_cart_integrity($pdo);
    seed_database($pdo, $settings, $development);
}
