<?php
declare(strict_types=1);
require __DIR__ . '/strict-errors.php';
require __DIR__ . '/database-fixture.php';
$_SERVER['HTTP_HOST']='localhost';define('ONES_API_LIBRARY_ONLY',true);require __DIR__.'/../api.php';
$checks=0;
function page_check(bool $ok,string $message): void {global $checks;if(!$ok)throw new RuntimeException($message);$checks++;}
$db=['driver'=>'sqlite','sqlite_path'=>':memory:'];
if(getenv('ONES_TEST_MYSQL_PORT')) {
    $name=(string)getenv('ONES_TEST_MYSQL_DATABASE');if(!preg_match('/^ones_segment_test[0-9]+$/D',$name))throw new RuntimeException('Disposable database required');
    $db=['driver'=>'mysql','host'=>'127.0.0.1','port'=>getenv('ONES_TEST_MYSQL_PORT'),'name'=>$name,'user'=>'root','password'=>''];
}
$pdo=test_database(['database'=>$db,'security'=>['initial_admin_password'=>'Page admin password 2026!']]);
require __DIR__.'/record-page-data.php';
$ids=seed_record_page_data($pdo);$total=464;
foreach([1,10,25,50] as $size){
    $seen=[];for($page=1;$page<=(int)ceil($total/$size);$page++){
        $data=order_page($pdo,['page'=>$page,'pageSize'=>$size]);
        page_check(count($data['orders'])<=min($size,50)&&$data['pagination']['total']===$total,'Unbounded/wrong page');
        foreach($data['orders'] as $row)$seen[]=$row['id'];
    }
    page_check(count(array_unique($seen))===$total && $seen===range($total,1),'Pagination omitted/duplicated/reordered rows');
}
foreach([['search'=>'željko','n'=>77],['search'=>'100%_!','n'=>77],['search'=>"' OR 1=1 --",'n'=>0],['search'=>'%','n'=>77],['product'=>'žuti','n'=>77],['product'=>'DRUGI','n'=>387],['date'=>'2026-02-03','dateTo'=>'2026-02-03','n'=>167],['search'=>'željko','status'=>'Završeno','n'=>38]] as $query){
    $expected=$query['n'];unset($query['n']);page_check(order_page($pdo,$query)['pagination']['total']===$expected,'Filter changed semantics: '.json_encode($query));
}
$last=order_page($pdo,['page'=>999999999,'pageSize'=>25]);page_check($last['pagination']['page']===19&&count($last['orders'])===14,'Stale page not clamped');
foreach([['page'=>'0'],['page'=>-1],['page'=>'1 OR 1=1'],['page'=>[]],['pageSize'=>51],['pageSize'=>'1.5'],['search'=>[]],['date'=>'2026-02-30'],['date'=>'2026-03-01','dateTo'=>'2026-02-01'],['status'=>'Invalid'],['product'=>str_repeat('a',191)]] as $query){
    try {order_page($pdo,$query);throw new LogicException('Invalid query accepted');}catch(InvalidRecordQuery $expected){$checks++;}
}
$customers=customer_page($pdo,['page'=>3,'pageSize'=>50]);
page_check(count($customers['customers'])===30&&$customers['stats']['total']===130,'Customer page not bounded/count wrong');
page_check(array_sum(array_map(fn($c)=>count($c['orders']),$customers['customers']))===0,'Customer list downloaded history');
page_check(customer_page($pdo,['search'=>'željko 100%_!'])['pagination']['total']===1,'Unicode/literal customer search broken');
$detail=customer_detail($pdo,$ids[0],['page'=>3,'pageSize'=>25]);
page_check($detail['customer']['orderCount']===77&&count($detail['customer']['orders'])===25&&$detail['pagination']['total']===77,'Customer detail unbounded');
page_check($detail['customer']['latestOrder']['id']===77&&$detail['customer']['orders'][0]['id']===27,'Latest contact order incorrectly follows visible history page');
page_check(customer_detail($pdo,1,[])===null,'Admin exposed as a customer');
$private=order_page($pdo,['page'=>2,'pageSize'=>50,'customerId'=>$ids[1]],$ids[0],false);
page_check(count($private['orders'])===27&&$private['pagination']['total']===77,'Customer history escaped ownership scope');
page_check(!isset($private['orders'][0]['adminNote'])&&!isset($private['orders'][0]['customerEmail']),'Private history leaked admin fields');
page_check(order_page($pdo,['search'=>'absent'])['pagination']===['page'=>1,'pageSize'=>25,'pageCount'=>1,'total'=>0,'start'=>0],'Empty result metadata invalid');
page_check(order_detail($pdo,$total)['id']===$total&&order_detail($pdo,9999999)===null,'Detail lookup invalid');
$backup=backup_payload($pdo);$directory=sys_get_temp_dir().'/ones-page-restore-'.bin2hex(random_bytes(5));mkdir($directory);
try{
    $pdo->exec('DELETE FROM order_search_items');
    restore_backup_payload($pdo,$backup,$directory);
    page_check(order_page($pdo,['product'=>'žuti'])['pagination']['total']===77,'Restore failed to rebuild historical product search');
    page_check(!isset($backup['tables']['order_search_items'])&&!isset($backup['tables']['schema_version']),'Backup included derived schema data');
}finally{foreach(glob($directory.'/*') as $file)unlink($file);rmdir($directory);}
echo "Record pages: $checks checks (".database_driver($pdo).", 130 customers/464 orders, bounded pages, filters, ownership, restore)\n";
