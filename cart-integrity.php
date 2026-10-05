<?php
declare(strict_types=1);

final class CartConflict extends RuntimeException {}

function cart_conflict(): never
{
    throw new CartConflict('Korpa je promijenjena na drugom uređaju ili je upit već poslan. Pregledajte osvježenu korpu pa pokušajte ponovo.');
}

// Consolidate old active carts without silently discarding quantities. An
// ambiguous total above 99 needs an administrator's decision before migration.
function normalize_active_carts(array $carts, array $items): array
{
    $keep = [];
    foreach ($carts as $cart) if ($cart['status'] === 'active') $keep[$cart['user_id']] = max($keep[$cart['user_id']] ?? 0, (int)$cart['id']);
    $map = [];
    foreach ($carts as $cart) if ($cart['status'] === 'active') $map[$cart['id']] = $keep[$cart['user_id']];
    $merged = []; $positions = [];
    foreach ($items as $item) {
        $item['cart_id'] = $map[$item['cart_id']] ?? $item['cart_id'];
        $key = $item['cart_id'] . ':' . $item['product_id'];
        if (isset($positions[$key])) {
            $index = $positions[$key];
            $quantity = (int)$merged[$index]['quantity'] + (int)$item['quantity'];
            if ($quantity > 99) throw new RuntimeException('Spajanje starih korpi bi prešlo 99 komada. Podaci nisu odbačeni; administrator treba razriješiti duple korpe prije nadogradnje.');
            $merged[$index]['quantity'] = $quantity;
        } else { $positions[$key] = count($merged); $merged[] = $item; }
    }
    $carts = array_values(array_filter($carts, static fn($c) => $c['status'] !== 'active' || (int)$c['id'] === $keep[$c['user_id']]));
    return [$carts, $merged];
}

function initialize_cart_integrity(PDO $pdo): void
{
    if (has_index($pdo, 'carts', 'one_active_cart')) return;
    $mysql = database_driver($pdo) === 'mysql';
    $lockName = 'ones-cart-' . substr(hash('sha256', $mysql ? (string)$pdo->query('SELECT DATABASE()')->fetchColumn() : ''), 0, 40);
    if ($mysql) {
        $lock = $pdo->prepare('SELECT GET_LOCK(?, 15)'); $lock->execute([$lockName]);
        if ((int)$lock->fetchColumn() !== 1) throw new RuntimeException('Migracija korpe je zauzeta. Pokušajte ponovo.');
    }
    try {
        if ($mysql && has_index($pdo, 'carts', 'one_active_cart')) return;
        if ($mysql && !has_column($pdo, 'carts', 'revision')) $pdo->exec('ALTER TABLE carts ADD COLUMN revision INT UNSIGNED NOT NULL DEFAULT 1');
        $pdo->beginTransaction();
        // Acquire the SQLite write lock before reading schema or legacy rows.
        if (!$mysql) $pdo->exec('UPDATE carts SET id = id WHERE 0');
        if (!$mysql && !has_column($pdo, 'carts', 'revision')) $pdo->exec('ALTER TABLE carts ADD COLUMN revision INTEGER NOT NULL DEFAULT 1');
        $carts = $pdo->query('SELECT id,user_id,status,created_at,updated_at,revision FROM carts ORDER BY id')->fetchAll(PDO::FETCH_ASSOC);
        $items = table_rows($pdo, 'cart_items');
        [$normalized, $merged] = normalize_active_carts($carts, $items);
        if (count($normalized) !== count($carts)) {
            $pdo->exec('DELETE FROM cart_items');
            $keepIds = array_column($normalized, 'id');
            $delete = $pdo->prepare('DELETE FROM carts WHERE id = ?');
            foreach ($carts as $cart) if (!in_array($cart['id'], $keepIds)) $delete->execute([$cart['id']]);
            insert_rows($pdo, 'cart_items', $merged);
            $pdo->exec('UPDATE carts SET revision = revision + 1 WHERE status = "active"');
        }
        if (!$mysql) $pdo->exec('CREATE UNIQUE INDEX IF NOT EXISTS one_active_cart ON carts(user_id) WHERE status = "active"');
        $pdo->commit();
        // MySQL DDL commits implicitly; the named migration lock covers it.
        if ($mysql) {
            if (!has_column($pdo, 'carts', 'active_user_id')) $pdo->exec('ALTER TABLE carts ADD COLUMN active_user_id INT UNSIGNED GENERATED ALWAYS AS (CASE WHEN status = "active" THEN user_id ELSE NULL END) STORED');
            $pdo->exec('CREATE UNIQUE INDEX one_active_cart ON carts(active_user_id)');
        }
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $error;
    } finally {
        if ($mysql) $pdo->prepare('SELECT RELEASE_LOCK(?)')->execute([$lockName]);
    }
}

function lock_cart_owner(PDO $pdo, int $userId): void
{
    if (!$pdo->inTransaction()) throw new LogicException('Cart lock requires a transaction.');
    if (database_driver($pdo) === 'sqlite') $pdo->prepare('UPDATE users SET id = id WHERE id = ?')->execute([$userId]);
    $stmt = $pdo->prepare('SELECT id FROM users WHERE id = ?' . (database_driver($pdo) === 'mysql' ? ' FOR UPDATE' : ''));
    $stmt->execute([$userId]);
    if (!$stmt->fetchColumn()) cart_conflict();
}

function cart_transaction(PDO $pdo, int $userId, callable $work)
{
    $owns = !$pdo->inTransaction();
    try {
        if ($owns) $pdo->beginTransaction();
        lock_cart_owner($pdo, $userId);
        $result = $work();
        if ($owns) $pdo->commit();
        return $result;
    } catch (Throwable $error) {
        if ($owns && $pdo->inTransaction()) $pdo->rollBack();
        throw $error;
    }
}

function expected_cart(array $body): array
{
    if (!is_int($body['cartId'] ?? null) || $body['cartId'] < 1 || !is_int($body['cartRevision'] ?? null) || $body['cartRevision'] < 1) {
        throw new CartConflict('Verzija korpe nedostaje ili nije ispravna. Osvježite stranicu prije ponovnog pokušaja.');
    }
    return [$body['cartId'], $body['cartRevision']];
}

function lock_expected_cart(PDO $pdo, int $userId, int $cartId, ?int $revision): void
{
    $stmt = $pdo->prepare('SELECT status, revision FROM carts WHERE id = ? AND user_id = ?' . (database_driver($pdo) === 'mysql' ? ' FOR UPDATE' : ''));
    $stmt->execute([$cartId, $userId]); $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row || $row['status'] !== 'active' || ($revision !== null && (int)$row['revision'] !== $revision)) cart_conflict();
}

function bump_cart_revision(PDO $pdo, int $cartId): void
{
    $pdo->prepare('UPDATE carts SET revision = revision + 1, updated_at = ? WHERE id = ?')->execute([date('c'), $cartId]);
}

function mutate_cart(PDO $pdo, int $userId, int $cartId, int $revision, string $action, array $body): array
{
    return cart_transaction($pdo, $userId, static function () use ($pdo, $userId, $cartId, $revision, $action, $body): array {
        lock_expected_cart($pdo, $userId, $cartId, $revision);
        if ($action === 'cart-add') {
            $products = products_by_id($pdo);
            if (!isset($products[$body['productId']])) throw new CartConflict('Proizvod više nije dostupan. Pregledajte korpu.');
            write_cart_item($pdo, $cartId, $body['productId'], $body['quantity']);
        } else {
            $itemId = $body['itemId'];
            $stmt = $pdo->prepare('SELECT id FROM cart_items WHERE id = ? AND cart_id = ?');
            $stmt->execute([$itemId, $cartId]);
            if (!$stmt->fetchColumn()) cart_conflict();
            if ($action === 'cart-remove' || $body['quantity'] === 0) $pdo->prepare('DELETE FROM cart_items WHERE id = ? AND cart_id = ?')->execute([$itemId, $cartId]);
            else $pdo->prepare('UPDATE cart_items SET quantity = ? WHERE id = ? AND cart_id = ?')->execute([$body['quantity'], $itemId, $cartId]);
        }
        bump_cart_revision($pdo, $cartId);
        return cart_payload_by_id($pdo, $userId, $cartId);
    });
}
