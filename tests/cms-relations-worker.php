<?php
declare(strict_types=1);
require __DIR__.'/strict-errors.php';
$_SERVER['HTTP_HOST']='localhost';define('ONES_API_LIBRARY_ONLY',true);require __DIR__.'/../api.php';
$input=json_decode(stream_get_contents(STDIN),true,512,JSON_THROW_ON_ERROR);
$db=['driver'=>'sqlite','sqlite_path'=>$input['path']];
if(getenv('ONES_TEST_MYSQL_PORT')) {
    $name=getenv('ONES_TEST_MYSQL_DATABASE');if(!preg_match('/^ones_segment_test[0-9]+$/D',(string)$name))throw new RuntimeException('Disposable DB required');
    $db=['driver'=>'mysql','host'=>'127.0.0.1','port'=>getenv('ONES_TEST_MYSQL_PORT'),'name'=>$name,'user'=>'root','password'=>''];
}
if($input['action']==='init') {
    $pdo=database(['database'=>$db,'security'=>['initial_admin_password'=>'Relations concurrent admin 2026!']]);
    if(get_cms_revision($pdo)!==1)throw new RuntimeException('Fresh DB required');
    $pdo->prepare('INSERT INTO users(name,email,password_hash,role,created_at) VALUES (?,?,?,"customer",?)')->execute(['Buyer','race-relations@example.invalid',hash_password('Relations customer 2026!'),date('c')]);
    $uid=(int)$pdo->lastInsertId();
    $pdo->prepare('INSERT INTO customer_email_state(user_id,email,verified_at) VALUES (?,?,?)')->execute([$uid,'race-relations@example.invalid',date('c')]);
    echo json_encode(['userId'=>$uid]);exit;
}
$pdo=$db['driver']==='sqlite'?new PDO('sqlite:'.$db['sqlite_path']):new PDO('mysql:host=127.0.0.1;port='.$db['port'].';dbname='.$db['name'].';charset=utf8mb4','root','',[PDO::ATTR_EMULATE_PREPARES=>false]);
$pdo->setAttribute(PDO::ATTR_ERRMODE,PDO::ERRMODE_EXCEPTION);$pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE,PDO::FETCH_ASSOC);
if($db['driver']==='sqlite'){$pdo->exec('PRAGMA busy_timeout=15000');$pdo->exec('PRAGMA foreign_keys=ON');}
$uid=$input['userId'];
try {
    switch($input['action']) {
        case 'prepare':
            $cms=default_cms();$other=$cms['products'][0];$other['id']='other-product';$cms['products'][]=$other;
            $cms['manuals']=[['title'=>'Linked','relatedProductId'=>'scooter-f3','category'=>$cms['products'][0]['category'],'visibility'=>'Javno','file'=>'assets/ones-logo.webp']];
            save_cms($pdo,$cms);$cart=cart_payload($pdo,$uid);
            if(!$cart['items'])add_cart_item($pdo,$cart['cartId'],'other-product',1);
            add_cart_item($pdo,$cart['cartId'],'scooter-f3',1);$result=true;break;
        case 'delete':
            $cms=$input['cms'];$cms['products']=array_values(array_filter($cms['products'],static fn($p)=>$p['id']!=='scooter-f3'));
            $result=save_cms($pdo,$cms,$input['revision'],['scooter-f3']);break;
        case 'favorite':$result=toggle_favorite($pdo,$uid,'scooter-f3');break;
        case 'add':$result=mutate_cart($pdo,$uid,$input['cartId'],$input['cartRevision'],'cart-add',['productId'=>'scooter-f3','quantity'=>1]);break;
        case 'submit':$result=create_order_from_cart($pdo,$uid,$input['cartId'],[],'061123456','Race snapshot',false,$input['cartRevision']);break;
        default:$result=['cms'=>admin_cms_view($pdo),'revision'=>get_cms_revision($pdo),'cart'=>cart_payload($pdo,$uid),'favorites'=>table_rows($pdo,'product_favorites'),'items'=>table_rows($pdo,'cart_items'),'carts'=>table_rows($pdo,'carts'),'orders'=>table_rows($pdo,'orders')];
    }
    echo json_encode(['ok'=>true,'result'=>$result]);
}catch(CartConflict|OrderSubmissionConflict $e){echo json_encode(['ok'=>false,'conflict'=>true,'transactionOpen'=>$pdo->inTransaction()]);}
