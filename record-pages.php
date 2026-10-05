<?php
declare(strict_types=1);

final class InvalidRecordQuery extends InvalidArgumentException {}

function record_integer(array $query, string $key, int $default, int $max = 1000000000): int
{
    $value = $query[$key] ?? $default;
    if ((!is_string($value) && !is_int($value)) || !preg_match('/^[1-9][0-9]{0,9}$/D', (string)$value) || (int)$value > $max) {
        throw new InvalidRecordQuery('Neispravan parametar: ' . $key);
    }
    return (int)$value;
}

function record_text(array $query, string $key, int $max = 190): string
{
    $value = $query[$key] ?? '';
    if (!is_string($value) || !mb_check_encoding($value, 'UTF-8') || mb_strlen($value, 'UTF-8') > $max || preg_match('/[\x00-\x1f\x7f]/', $value)) {
        throw new InvalidRecordQuery('Neispravan parametar: ' . $key);
    }
    return trim($value);
}

function record_date(array $query, string $key): string
{
    $value = record_text($query, $key, 10);
    if ($value === '') return '';
    $date = DateTimeImmutable::createFromFormat('!Y-m-d', $value);
    if (!$date || $date->format('Y-m-d') !== $value) throw new InvalidRecordQuery('Neispravan datum.');
    return $value;
}

function record_like(string $value): string
{
    return '%' . strtr(mb_strtolower($value, 'UTF-8'), ['!' => '!!', '%' => '!%', '_' => '!_']) . '%';
}

function record_lower(PDO $pdo, string $column): string
{
    return database_driver($pdo) === 'sqlite' ? 'ones_lower(' . $column . ')' : 'LOWER(' . $column . ') COLLATE utf8mb4_bin';
}

function record_snapshot(PDO $pdo, callable $work): array
{
    if ($pdo->inTransaction()) return $work();
    if (database_driver($pdo) === 'mysql') $pdo->exec('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    try {
        $pdo->beginTransaction();
        $result = $work();
        $pdo->commit();
        return $result;
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $error;
    }
}

function record_pagination(int $total, array $query): array
{
    $size = record_integer($query, 'pageSize', 25, 50);
    $count = max(1, (int)ceil($total / $size));
    $page = min(record_integer($query, 'page', 1), $count);
    return ['page' => $page, 'pageSize' => $size, 'pageCount' => $count, 'total' => $total, 'start' => ($page - 1) * $size];
}

function order_record(array $row, bool $admin = true): array
{
    $items = json_decode((string)$row['items_json'], true);
    $record = ['id' => (int)$row['id'], 'phone' => $row['phone'], 'note' => $row['note'], 'status' => $row['status'],
        'items' => is_array($items) ? $items : [], 'createdAt' => $row['created_at'], 'updatedAt' => $row['updated_at']];
    if ($admin) $record += ['userId' => (int)$row['user_id'], 'customerName' => $row['customer_name'],
        'customerEmail' => $row['customer_email'], 'adminNote' => $row['admin_note']];
    return $record;
}

function order_detail(PDO $pdo, int $id): ?array
{
    $stmt = $pdo->prepare('SELECT * FROM orders WHERE id = ?');
    $stmt->execute([$id]); $row = $stmt->fetch(PDO::FETCH_ASSOC);
    return $row ? order_record($row) : null;
}

function order_page(PDO $pdo, array $query = [], ?int $userId = null, bool $admin = true): array
{
    // Validate pagination even when no row matches.
    record_pagination(0, $query);
    $where = []; $params = [];
    if ($userId !== null) { $where[] = 'o.user_id = ?'; $params[] = $userId; }
    if ($admin) {
        $search = record_text($query, 'search');
        if ($search !== '') {
            $parts = [];
            foreach (['o.customer_name', 'o.customer_email', 'o.phone', 'CAST(o.id AS CHAR)'] as $column) {
                $parts[] = record_lower($pdo, $column) . " LIKE ? ESCAPE '!'"; $params[] = record_like($search);
            }
            $parts[] = 'EXISTS (SELECT 1 FROM order_search_items si WHERE si.order_id = o.id AND ' . record_lower($pdo, 'si.name') . " LIKE ? ESCAPE '!')";
            $params[] = record_like($search); $where[] = '(' . implode(' OR ', $parts) . ')';
        }
        $status = record_text($query, 'status', 30);
        if ($status !== '' && $status !== 'Sve') {
            if (!in_array($status, ['Novo', 'U obradi', 'Kontaktiran', 'Završeno', 'Otkazano'], true)) throw new InvalidRecordQuery('Neispravan status.');
            $where[] = 'o.status = ?'; $params[] = $status;
        }
        $from = record_date($query, 'date'); $to = record_date($query, 'dateTo');
        if ($from !== '' && $to !== '' && $from > $to) throw new InvalidRecordQuery('Datum od mora biti prije datuma do.');
        if ($from !== '') { $where[] = 'o.created_at >= ?'; $params[] = $from; }
        if ($to !== '') { $where[] = 'o.created_at < ?'; $params[] = (new DateTimeImmutable($to))->modify('+1 day')->format('Y-m-d'); }
        $product = record_text($query, 'product');
        if ($product !== '') {
            $where[] = 'EXISTS (SELECT 1 FROM order_search_items pi WHERE pi.order_id = o.id AND ' . record_lower($pdo, 'pi.name') . " LIKE ? ESCAPE '!')";
            $params[] = record_like($product);
        }
    }
    $whereSql = $where ? ' WHERE ' . implode(' AND ', $where) : '';
    return record_snapshot($pdo, static function () use ($pdo, $query, $whereSql, $params, $userId, $admin): array {
        $count = $pdo->prepare('SELECT COUNT(*) FROM orders o' . $whereSql); $count->execute($params);
        $pagination = record_pagination((int)$count->fetchColumn(), $query);
        $stmt = $pdo->prepare('SELECT o.* FROM orders o' . $whereSql . ' ORDER BY o.id DESC LIMIT ' . $pagination['pageSize'] . ' OFFSET ' . $pagination['start']);
        $stmt->execute($params);
        $result = ['orders' => array_map(static fn($row) => order_record($row, $admin), $stmt->fetchAll(PDO::FETCH_ASSOC)), 'pagination' => $pagination];
        if ($admin && $userId === null) {
            $stats = $pdo->query('SELECT COUNT(*) AS total, COALESCE(SUM(CASE WHEN status = "Novo" THEN 1 ELSE 0 END), 0) AS new_count FROM orders')->fetch(PDO::FETCH_ASSOC);
            $result['stats'] = ['total' => (int)$stats['total'], 'new' => (int)$stats['new_count']];
        }
        return $result;
    });
}

function customer_select_sql(): string
{
    return 'SELECT u.id,u.name,u.email,u.phone,u.created_at,
        (SELECT COUNT(*) FROM orders oc WHERE oc.user_id=u.id) AS order_count,
        (SELECT ol.created_at FROM orders ol WHERE ol.user_id=u.id ORDER BY ol.id DESC LIMIT 1) AS last_order_at,
        (SELECT os.status FROM orders os WHERE os.user_id=u.id ORDER BY os.id DESC LIMIT 1) AS last_order_status FROM users u';
}

function customer_record(array $row): array
{
    return ['id' => (int)$row['id'], 'name' => $row['name'], 'email' => $row['email'], 'phone' => $row['phone'],
        'createdAt' => $row['created_at'], 'orderCount' => (int)$row['order_count'],
        'lastOrderAt' => $row['last_order_at'] ?? '', 'lastOrderStatus' => $row['last_order_status'] ?? '', 'orders' => []];
}

function customer_page(PDO $pdo, array $query = []): array
{
    record_pagination(0, $query);
    $search = record_text($query, 'search');
    $where = ' WHERE u.role = "customer"'; $params = [];
    if ($search !== '') {
        $parts = [];
        foreach (['u.name', 'u.email', 'u.phone', 'CAST(u.id AS CHAR)'] as $column) {
            $parts[] = record_lower($pdo, $column) . " LIKE ? ESCAPE '!'"; $params[] = record_like($search);
        }
        $where .= ' AND (' . implode(' OR ', $parts) . ')';
    }
    return record_snapshot($pdo, static function () use ($pdo, $query, $where, $params): array {
        $count = $pdo->prepare('SELECT COUNT(*) FROM users u' . $where); $count->execute($params);
        $pagination = record_pagination((int)$count->fetchColumn(), $query);
        $stmt = $pdo->prepare(customer_select_sql() . $where . ' ORDER BY u.id DESC LIMIT ' . $pagination['pageSize'] . ' OFFSET ' . $pagination['start']);
        $stmt->execute($params);
        return ['customers' => array_map('customer_record', $stmt->fetchAll(PDO::FETCH_ASSOC)), 'pagination' => $pagination,
            'stats' => ['total' => (int)$pdo->query('SELECT COUNT(*) FROM users WHERE role = "customer"')->fetchColumn()]];
    });
}

function customer_detail(PDO $pdo, int $id, array $query): ?array
{
    return record_snapshot($pdo, static function () use ($pdo, $id, $query): array {
        $stmt = $pdo->prepare(customer_select_sql() . ' WHERE u.role = "customer" AND u.id = ?'); $stmt->execute([$id]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) return [];
        $customer = customer_record($row);
        $history = order_page($pdo, $query, $id);
        $customer['orders'] = $history['orders'];
        // Contact templates always describe the latest inquiry, independently of the visible history page.
        $latest = $pdo->prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC LIMIT 1');
        $latest->execute([$id]); $latestRow = $latest->fetch(PDO::FETCH_ASSOC);
        $customer['latestOrder'] = $latestRow ? order_record($latestRow) : null;
        return ['customer' => $customer, 'pagination' => $history['pagination']];
    }) ?: null;
}

function index_order_items(PDO $pdo, int $id, array $items): void
{
    $pdo->prepare('DELETE FROM order_search_items WHERE order_id = ?')->execute([$id]);
    $insert = $pdo->prepare('INSERT INTO order_search_items(order_id,position,name) VALUES(?,?,?)');
    foreach (array_values($items) as $position => $item) $insert->execute([$id, $position, (string)($item['name'] ?? '')]);
}

function rebuild_order_items(PDO $pdo): void
{
    // Bounded batches also cover legacy histories and JSON backup restoration.
    $pdo->exec('DELETE FROM order_search_items');
    $lastId = 0;
    do {
        $stmt = $pdo->prepare('SELECT id,items_json FROM orders WHERE id > ? ORDER BY id LIMIT 100');
        $stmt->execute([$lastId]); $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        foreach ($rows as $row) {
            index_order_items($pdo, (int)$row['id'], json_decode((string)$row['items_json'], true) ?: []);
            $lastId = (int)$row['id'];
        }
    } while (count($rows) === 100);
}
