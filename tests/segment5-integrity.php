<?php
declare(strict_types=1);
$_SERVER['HTTP_HOST'] = 'localhost';
define('ONES_API_LIBRARY_ONLY', true);
require __DIR__ . '/../api.php';
$checks = 0;
function check5(bool $ok, string $message): void { global $checks; if (!$ok) throw new RuntimeException($message); $checks++; }

$product = ['mpcPrice' => '100', 'discountPrice' => '90', 'salePrice' => '80', 'saleUntil' => '2026-10-04'];
foreach (['UTC','America/Los_Angeles','Pacific/Kiritimati','Europe/Sarajevo'] as $zone) {
    date_default_timezone_set($zone);
    foreach (['2026-10-04T21:59:59.999Z' => '80', '2026-10-04T22:00:00Z' => '90'] as $time => $price) {
        $clock = pricing_clock(new DateTimeImmutable($time));
        check5(effective_product_price($product, $clock['date'])['label'] === $price, 'Store midnight independent of PHP time zone');
    }
}
foreach (['2026-03-29' => 23, '2026-10-25' => 25, '2026-10-04' => 24] as $day => $hours) {
    $clock = pricing_clock(new DateTimeImmutable($day . ' 00:00:00', new DateTimeZone('Europe/Sarajevo')));
    check5($clock['refreshAfterMs'] === $hours * 3600000, 'DST day length');
}
foreach (['2026-02-30','2026-13-01','2026-1-1','garbage'] as $day) check5(!business_date_active($day, '2026-01-01'), 'Invalid calendar date');
date_default_timezone_set('UTC');

$file = sys_get_temp_dir() . '/ones-snapshot-' . bin2hex(random_bytes(6)) . '.sqlite';
$db = ['driver' => 'sqlite', 'sqlite_path' => $file];
if (getenv('ONES_TEST_MYSQL_PORT')) {
    $name = getenv('ONES_TEST_MYSQL_DATABASE');
    if (!preg_match('/^ones_segment_test[0-9]+$/D', (string)$name)) throw new RuntimeException('Disposable DB required');
    $db = ['driver'=>'mysql','host'=>'127.0.0.1','port'=>getenv('ONES_TEST_MYSQL_PORT'),'name'=>$name,'user'=>'root','password'=>''];
}
$config = ['database'=>$db,'security'=>['initial_admin_password'=>'Snapshot admin password 2026!']];
class SnapshotTestPDO extends PDO {
    public ?Closure $afterUsers = null;
    public function query(string $query, ?int $fetchMode = null, mixed ...$fetchModeArgs): PDOStatement|false {
        $result = $fetchMode === null ? parent::query($query) : parent::query($query, $fetchMode, ...$fetchModeArgs);
        if ($query === 'SELECT * FROM users' && $this->afterUsers) { $hook = $this->afterUsers; $this->afterUsers = null; $hook(); }
        return $result;
    }
}
$pdo = database($config);
$dsn = $db['driver'] === 'mysql' ? 'mysql:host=127.0.0.1;port='.$db['port'].';dbname='.$db['name'] : 'sqlite:'.$file;
$reader = new SnapshotTestPDO($dsn, $db['driver']==='mysql'?'root':null, $db['driver']==='mysql'?'':null, [PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC, PDO::ATTR_EMULATE_PREPARES=>false]);
if ($db['driver'] === 'sqlite') { $pdo->exec('PRAGMA journal_mode = WAL'); $reader->exec('PRAGMA busy_timeout=10000'); }
else $reader->exec('SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED');
try {
    check5((int)$pdo->query('SELECT COUNT(*) FROM users')->fetchColumn()===1, 'Fresh test DB');
    $before = backup_payload($reader);
    $reader->afterUsers = static function () use ($pdo): void {
        $pdo->beginTransaction();
        try {
            $pdo->prepare('INSERT INTO users(name,email,password_hash,role,created_at) VALUES (?,?,?,"customer",?)')->execute(['During backup','snapshot@example.invalid',hash_password('Snapshot customer password!'),date('c')]);
            $id = (int)$pdo->lastInsertId();
            add_cart_item($pdo, active_cart_id($pdo,$id), 'scooter-f3', 3);
            $cms = get_cms($pdo); $cms['products'][0]['mpcPrice'] = '123.45'; save_cms($pdo,$cms);
            $pdo->commit();
        } catch (Throwable $e) { $pdo->rollBack(); throw $e; }
    };
    $during = backup_payload($reader);
    check5($during['tables']===$before['tables'], 'Backup does not mix pre/post concurrent commit');
    check5($during['cms']===$before['cms'] && $during['cmsRevision']===$before['cmsRevision'], 'CMS and revision same snapshot');
    check5(validate_backup_payload($during)[0], 'Concurrent backup is restorable');
    $after = backup_payload($reader);
    check5(count($after['tables']['users'])===2 && count($after['tables']['cart_items'])===1, 'Next snapshot sees complete committed change');
    check5(validate_backup_payload($after)[0], 'Following backup is restorable');
    check5(!$reader->inTransaction(), 'Read transaction released');
    $reader->afterUsers = static function (): void { throw new RuntimeException('Injected export read error'); };
    try { backup_payload($reader); throw new LogicException('Export should fail'); } catch (RuntimeException $e) { check5($e->getMessage()==='Injected export read error','Export read failure preserved'); }
    check5(!$reader->inTransaction(), 'Failed export rolls back');
    $reader->beginTransaction();
    try { backup_payload($reader); throw new RuntimeException('Nested export accepted'); } catch (LogicException $e) { check5($reader->inTransaction(), 'Does not commit caller transaction'); }
    $reader->rollBack();
    $cart = $after['tables']['carts'][0];
    try { $pdo->prepare('INSERT INTO carts(user_id,status,created_at,updated_at) VALUES (?,"active",?,?)')->execute([$cart['user_id'],date('c'),date('c')]); throw new RuntimeException('Unique invariant absent'); }
    catch (PDOException $e) { check5(is_unique_constraint_violation($e), 'DB enforces one active cart'); }
    $old = $after; $old['version']=2; unset($old['tables']['carts'][0]['revision']);
    $duplicate = $old['tables']['carts'][0]; $duplicate['id'] += 100;
    $old['tables']['carts'][]=$duplicate;
    $row=$old['tables']['cart_items'][0]; $row['id']+=100; $row['cart_id']=$duplicate['id']; $old['tables']['cart_items'][]=$row;
    $normalized=normalize_backup_payload($old);
    check5(count($normalized['tables']['carts'])===1 && $normalized['tables']['cart_items'][0]['quantity']===6, 'Legacy v2 active carts merge without losing quantities');
    check5($normalized['tables']['carts'][0]['revision']===1,'Legacy v2 gets revision');
    $bad=$after; unset($bad['tables']['carts'][0]['revision']); check5(!validate_backup_payload($bad)[0],'v3 requires revision');
    $bad=$after; $duplicate=$bad['tables']['carts'][0]; $duplicate['id']+=100; $bad['tables']['carts'][]=$duplicate; check5(!validate_backup_payload($bad)[0],'v3 rejects duplicate active carts');
    $old['tables']['cart_items'][0]['quantity']=99; check5(!validate_backup_payload($old)[0],'Overflow legacy merge fails without truncation');
    check5(backup_payload($reader)['tables']===$after['tables'],'Rejected exports/imports do not mutate data');
    // Upgrade a real pre-invariant table, then run the upgrade again.
    $pdo->exec(database_driver($pdo)==='mysql' ? 'DROP INDEX one_active_cart ON carts' : 'DROP INDEX one_active_cart');
    $pdo->prepare('INSERT INTO carts(user_id,status,created_at,updated_at) VALUES (?,"active",?,?)')->execute([$cart['user_id'],date('c'),date('c')]);
    $duplicateId=(int)$pdo->lastInsertId();
    write_cart_item($pdo,$duplicateId,'scooter-f3',4);
    initialize_cart_integrity($pdo);
    $migrated=cart_payload($pdo,(int)$cart['user_id']);
    check5($migrated['count']===7 && $migrated['cartId']===$duplicateId,'Actual migration preserves all quantities in newest cart');
    initialize_cart_integrity($pdo);
    check5(cart_payload($pdo,(int)$cart['user_id'])===$migrated,'Migration is idempotent');
    if (database_driver($pdo)==='mysql') {
        $pdo->exec('ALTER TABLE orders ENGINE=MyISAM');
        try { backup_payload($reader); throw new LogicException('Nontransactional backup accepted'); }
        catch (RuntimeException $e) { check5(str_contains($e->getMessage(),'InnoDB'),'Rejects nontransactional backup tables'); }
        finally { $pdo->exec('ALTER TABLE orders ENGINE=InnoDB'); }
    }
    echo 'Segment 5 integrity: '.$checks.' checks ('.$db['driver'].')'.PHP_EOL;
} finally {
    $pdo=null; $reader=null; gc_collect_cycles();
    foreach (['','-wal','-shm'] as $suffix) if (is_file($file.$suffix)) unlink($file.$suffix);
}
