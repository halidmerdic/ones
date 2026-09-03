<?php
declare(strict_types=1);

ini_set('session.save_path', sys_get_temp_dir());
$_SERVER['HTTP_HOST'] = 'localhost';
define('ONES_API_LIBRARY_ONLY', true);
require __DIR__ . '/../api.php';

$checks = 0;
$databasePath = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'ones-business-' . bin2hex(random_bytes(6)) . '.sqlite';

function assert_business_test(bool $condition, string $message): void
{
    global $checks;
    if (!$condition) {
        fwrite(STDERR, 'FAILED: ' . $message . PHP_EOL);
        exit(1);
    }
    $checks++;
}

try {
    $config = [
        'database' => [
            'driver' => 'sqlite',
            'sqlite_path' => $databasePath,
        ],
        'security' => [
            'initial_admin_password' => 'Sigurna admin lozinka 2026',
        ],
    ];
    $isLocalHost = true;
    $pdo = database($config);

    assert_business_test(has_index($pdo, 'cart_items', 'cart_product'), 'korpa ima jedinstven indeks za proizvod');
    assert_business_test(phone_validation_error('+387 61 123 456', true) === null, 'ispravan međunarodni telefon se prihvata');
    assert_business_test(phone_validation_error('telefon 061123456', true) !== null, 'telefon sa slovima se odbija');
    assert_business_test(phone_validation_error('123', true) !== null, 'prekratak telefon se odbija');

    $activeSale = [
        'salePrice' => '1600',
        'saleUntil' => date('Y-m-d', strtotime('+1 day')),
        'discountPrice' => '1800',
        'mpcPrice' => '2000',
    ];
    assert_business_test(product_price_label($activeSale) === '1600', 'aktivna akcijska cijena ima prioritet');
    $activeSale['saleUntil'] = date('Y-m-d', strtotime('-1 day'));
    assert_business_test(product_price_label($activeSale) === '1800', 'istekla akcija pada na redovnu sniženu cijenu');

    $userInsert = $pdo->prepare('INSERT INTO users (name, email, password_hash, role, created_at) VALUES (:name, :email, :password_hash, "customer", :created_at)');
    $userInsert->execute([
        ':name' => 'Poslovni Test',
        ':email' => 'business-test@example.com',
        ':password_hash' => hash_password('Sigurna korisnicka lozinka 2026'),
        ':created_at' => date('c'),
    ]);
    $userId = (int)$pdo->lastInsertId();
    $cartId = active_cart_id($pdo, $userId);

    add_cart_item($pdo, $cartId, 'scooter-f3', 1);
    add_cart_item($pdo, $cartId, 'scooter-f3', 2);
    $cart = cart_payload_by_id($pdo, $userId, $cartId);
    assert_business_test(count($cart['items']) === 1 && $cart['count'] === 3, 'ponovljeno dodavanje sabira količinu bez duplog reda');

    add_cart_item($pdo, $cartId, 'scooter-f3', 99);
    $cart = cart_payload_by_id($pdo, $userId, $cartId);
    assert_business_test($cart['count'] === 99, 'količina proizvoda ne prelazi 99');

    $user = ['name' => 'Poslovni Test', 'email' => 'business-test@example.com'];
    $phone = '+387 61 123 456';
    $orderId = create_order_from_cart($pdo, $userId, $cartId, $user, $phone, 'Testni upit', true);
    assert_business_test($orderId > 0, 'aktivna korpa se pretvara u upit');
    assert_business_test((string)$pdo->query('SELECT status FROM carts WHERE id = ' . $cartId)->fetchColumn() === 'submitted', 'poslana korpa se zatvara');
    assert_business_test((string)$pdo->query('SELECT phone FROM users WHERE id = ' . $userId)->fetchColumn() === $phone, 'telefon se mijenja tek u uspješnoj transakciji');

    $orderItems = json_decode((string)$pdo->query('SELECT items_json FROM orders WHERE id = ' . $orderId)->fetchColumn(), true);
    assert_business_test(($orderItems[0]['productId'] ?? '') === 'scooter-f3' && ($orderItems[0]['quantity'] ?? 0) === 99, 'upit čuva snapshot proizvoda i količine');

    $customerRows = customers_payload($pdo);
    $businessCustomer = array_values(array_filter($customerRows, static fn(array $customer): bool => (int)$customer['id'] === $userId))[0] ?? null;
    assert_business_test(is_array($businessCustomer) && (int)$businessCustomer['orderCount'] === 1, 'CMS pregled kupaca vraća tačan broj upita');
    assert_business_test((int)($businessCustomer['orders'][0]['id'] ?? 0) === $orderId, 'CMS pregled kupaca vraća najnoviji upit kupca');

    $duplicateBlocked = false;
    try {
        create_order_from_cart($pdo, $userId, $cartId, $user, $phone, 'Dupli upit', false);
    } catch (OrderSubmissionConflict $error) {
        $duplicateBlocked = true;
    }
    assert_business_test($duplicateBlocked, 'ista korpa se ne može poslati dva puta');
    assert_business_test((int)$pdo->query('SELECT COUNT(*) FROM orders')->fetchColumn() === 1, 'blokirani dupli klik ne pravi drugi upit');

    $newCartId = active_cart_id($pdo, $userId);
    add_cart_item($pdo, $newCartId, 'obrisani-proizvod', 1);
    $unavailableBlocked = false;
    try {
        create_order_from_cart($pdo, $userId, $newCartId, $user, '+387 62 999 999', 'Nedostupan proizvod', true);
    } catch (OrderSubmissionConflict $error) {
        $unavailableBlocked = true;
    }
    assert_business_test($unavailableBlocked, 'upit sa nedostupnim proizvodom se odbija');
    assert_business_test((string)$pdo->query('SELECT phone FROM users WHERE id = ' . $userId)->fetchColumn() === $phone, 'odbijeni upit ne mijenja profil kupca');

    $legacyPdo = new PDO('sqlite::memory:');
    $legacyPdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $legacyPdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
    $legacyPdo->exec('CREATE TABLE cart_items (id INTEGER PRIMARY KEY AUTOINCREMENT, cart_id INTEGER NOT NULL, product_id TEXT NOT NULL, quantity INTEGER NOT NULL, created_at TEXT NOT NULL)');
    $legacyPdo->exec('INSERT INTO cart_items (cart_id, product_id, quantity, created_at) VALUES (1, "scooter-f3", 2, "now"), (1, "scooter-f3", 3, "now")');
    ensure_cart_item_uniqueness($legacyPdo);
    $legacyRow = $legacyPdo->query('SELECT COUNT(*) AS row_count, SUM(quantity) AS quantity FROM cart_items')->fetch(PDO::FETCH_ASSOC);
    assert_business_test((int)$legacyRow['row_count'] === 1 && (int)$legacyRow['quantity'] === 5, 'migracija spaja stare duple stavke bez gubitka količine');

    $restoredRows = consolidate_cart_item_rows([
        ['id' => 10, 'cart_id' => 4, 'product_id' => 'scooter-f3', 'quantity' => 60, 'created_at' => 'now'],
        ['id' => 11, 'cart_id' => 4, 'product_id' => 'scooter-f3', 'quantity' => 60, 'created_at' => 'now'],
    ]);
    assert_business_test(count($restoredRows) === 1 && (int)$restoredRows[0]['quantity'] === 99, 'restore konsoliduje duple stavke i poštuje maksimalnu količinu');

    echo 'Business logic checks passed: ' . $checks . PHP_EOL;
} finally {
    unset($userInsert, $legacyPdo);
    $pdo = null;
    gc_collect_cycles();
    for ($attempt = 0; $attempt < 5 && is_file($databasePath); $attempt++) {
        if (@unlink($databasePath)) {
            break;
        }
        usleep(50000);
    }
}
