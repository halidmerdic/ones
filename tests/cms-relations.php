<?php
declare(strict_types=1);
require_once __DIR__ . '/database-fixture.php';
$_SERVER['HTTP_HOST']='localhost';
define('ONES_API_LIBRARY_ONLY',true);
require __DIR__.'/../api.php';
$checks=0;
function relation_check(bool $ok,string $message): void {global $checks;if(!$ok)throw new RuntimeException($message);$checks++;}
$db=['driver'=>'sqlite','sqlite_path'=>':memory:'];
if(getenv('ONES_TEST_MYSQL_PORT')) {
    $name=getenv('ONES_TEST_MYSQL_DATABASE');
    if(!preg_match('/^ones_segment_test[0-9]+$/D',(string)$name))throw new RuntimeException('Disposable DB required');
    $db=['driver'=>'mysql','host'=>'127.0.0.1','port'=>getenv('ONES_TEST_MYSQL_PORT'),'name'=>$name,'user'=>'root','password'=>''];
}
$pdo=test_database(['database'=>$db,'security'=>['initial_admin_password'=>'CMS relation admin 2026!']]);
relation_check(get_cms_revision($pdo)===1,'Fresh database required');
$cms=get_cms($pdo);$source=$cms['categories'][0]['name'];$target=$cms['categories'][1]['name'];
$badge=$cms['badges'][1]['name'];$id=$cms['products'][0]['id'];
$cms['products'][0]['badge']=$badge;$cms['products'][0]['badgeUntil']='2030-01-01';$cms['products'][0]['specs']=['Original'=>'Kept'];
$cms['categories'][0]['badge']=$badge;$cms['categories'][0]['badgeUntil']='2030-01-02';
$cms['badges'][1]['applyCategory']=$source;
$other=$cms['products'][0];$other['id']='second-product';$other['category']=$target;$other['badge']='-';$cms['products'][]=$other;
$cms['manuals']=[['title'=>'Product manual','relatedProductId'=>$id,'category'=>$source,'visibility'=>'Javno','file'=>'assets/ones-logo.webp'],['title'=>'General manual','relatedProductId'=>'','category'=>$source,'visibility'=>'Javno','file'=>'assets/ones-logo.webp']];
save_cms($pdo,$cms,1);
$pdo->prepare('INSERT INTO users(name,email,password_hash,role,created_at) VALUES (?,?,?,"customer",?)')->execute(['Buyer','relations@example.invalid',hash_password('Relation customer 2026!'),date('c')]);
$uid=(int)$pdo->lastInsertId();$pdo->prepare('INSERT INTO customer_email_state(user_id,email,verified_at) VALUES (?,?,?)')->execute([$uid,'relations@example.invalid',date('c')]);
$submitted=active_cart_id($pdo,$uid);add_cart_item($pdo,$submitted,$id,2);
create_order_from_cart($pdo,$uid,$submitted,[],'061123456','Keep historical order',false);
$active=active_cart_id($pdo,$uid);add_cart_item($pdo,$active,$id,3);add_cart_item($pdo,$active,'second-product',1);
toggle_favorite($pdo,$uid,$id);toggle_favorite($pdo,$uid,'second-product');
function relation_snapshot(PDO $pdo): array {
    $out=[];foreach(['cms_store','cms_revisions','carts','cart_items','product_favorites','orders'] as $table)$out[$table]=table_rows($pdo,$table);return $out;
}
function relation_reject(PDO $pdo,array $cms,array $changes=[],array $deleted=[]): void {
    $before=relation_snapshot($pdo);
    try{save_cms($pdo,$cms,get_cms_revision($pdo),$deleted,$changes);throw new RuntimeException('Invalid relations accepted');}
    catch(CmsValidationError $error){relation_check(true,'Invalid operation rejected');}
    relation_check(relation_snapshot($pdo)===$before,'Rejection preserves every related table/history');
    relation_check(!$pdo->inTransaction(),'Rejected operation releases transaction');
}
foreach(['categories','badges'] as $collection) {
    $view=admin_cms_view($pdo);unset($view[$collection][0]['_identity']);relation_reject($pdo,$view);
    $view=admin_cms_view($pdo);$view[$collection][0]['_identity']='bad';relation_reject($pdo,$view);
    $view=admin_cms_view($pdo);$view[$collection][1]['_identity']=$view[$collection][0]['_identity'];relation_reject($pdo,$view);
}
$view=admin_cms_view($pdo);$view['badges'][1]['name']='Renamed badge';
save_cms($pdo,$view,get_cms_revision($pdo),[]);$read=get_cms($pdo);
relation_check($read['products'][0]['badge']==='Renamed badge'&&$read['categories'][0]['badge']==='Renamed badge','Server migrates product/category badge assignments');
relation_check($read['products'][0]['badgeUntil']==='2030-01-01','Rename preserves badge expiry');
$view=admin_cms_view($pdo);$view['categories'][0]['name']='Renamed category';
save_cms($pdo,$view,get_cms_revision($pdo),[]);$read=get_cms($pdo);$source='Renamed category';
relation_check($read['products'][0]['category']===$source&&$read['manuals'][0]['category']===$source&&$read['badges'][1]['applyCategory']===$source,'Server migrates all category references');
// Renaming to another pre-existing name remains ambiguous even if it is removed.
$view=admin_cms_view($pdo);$view['categories'][0]['name']=$target;array_splice($view['categories'],1,1);relation_reject($pdo,$view,['categories'=>[['from'=>$target,'to'=>null]]]);
$view=admin_cms_view($pdo);array_shift($view['categories']);
relation_reject($pdo,$view);
relation_reject($pdo,$view,['categories'=>[['from'=>$source,'to'=>null]]]);
relation_reject($pdo,$view,['categories'=>[['from'=>$source,'to'=>'Missing']]]);
relation_reject($pdo,$view,['categories'=>[['from'=>$source,'to'=>$target],['from'=>$source,'to'=>$target]]]);
save_cms($pdo,$view,get_cms_revision($pdo),[],['categories'=>[['from'=>$source,'to'=>$target]]]);$read=get_cms($pdo);
relation_check($read['products'][0]['category']===$target&&$read['manuals'][0]['category']===$target&&$read['badges'][1]['applyCategory']===$target,'Delete migrates products/manuals/badge scope to replacement');
relation_check($read['products'][0]['specs']===['Original'=>'Kept'],'Moving category preserves specifications');
relation_check(count($read['categories'])===2,'Unrelated empty category is preserved');
$view=admin_cms_view($pdo);array_splice($view['badges'],1,1);relation_reject($pdo,$view);
save_cms($pdo,$view,get_cms_revision($pdo),[],['badges'=>['Renamed badge']]);$read=get_cms($pdo);
relation_check($read['products'][0]['badge']==='-'&&$read['products'][0]['badgeUntil']==='','Badge deletion clears assignment and expiry');
$view=admin_cms_view($pdo);array_shift($view['badges']);relation_reject($pdo,$view,['badges'=>['-']]);
$view=admin_cms_view($pdo);$view['badges'][0]['name']='Reserved rename';relation_reject($pdo,$view);
$snapshot=relation_snapshot($pdo);$cart=cart_payload($pdo,$uid);
$view=admin_cms_view($pdo);array_shift($view['products']);
// Fail after dependency cleanup but before the CMS update: everything rolls back.
$trigger=database_driver($pdo)==='mysql' ? "CREATE TRIGGER reject_relation_save BEFORE UPDATE ON cms_store FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Injected late failure'" : "CREATE TRIGGER reject_relation_save BEFORE UPDATE OF value ON cms_store BEGIN SELECT RAISE(ABORT,'Injected late failure'); END";
$pdo->exec($trigger);
try{save_cms($pdo,$view,get_cms_revision($pdo),[$id]);throw new RuntimeException('Injected failure missed');}catch(PDOException $e){relation_check(true,'Late failure injected');}
relation_check(relation_snapshot($pdo)===$snapshot,'Late failure rolls back CMS/manuals/carts/favorites/history');
$pdo->exec('DROP TRIGGER reject_relation_save');
save_cms($pdo,$view,get_cms_revision($pdo),[$id]);$read=get_cms($pdo);$after=cart_payload($pdo,$uid);
relation_check(array_column($read['products'],'id')===['second-product'],'Requested product removed');
relation_check(array_column($read['manuals'],'title')===['General manual'],'Linked manual deleted; general manual preserved');
relation_check($after['count']===1&&$after['items'][0]['productId']==='second-product','Only deleted product removed from active cart');
relation_check($after['revision']===$cart['revision']+1,'Affected cart version incremented once');
relation_check(favorites_payload($pdo,$uid)===['second-product'],'Only deleted favorite removed');
$historical=array_values(array_filter(table_rows($pdo,'cart_items'),static fn($i)=>(int)$i['cart_id']===$submitted));
relation_check(count($historical)===1&&$historical[0]['product_id']===$id,'Submitted cart preserves historical product');
relation_check(table_rows($pdo,'orders')===$snapshot['orders'],'Order snapshot is unchanged');
foreach(['cart','favorite'] as $action){try{if($action==='cart')mutate_cart($pdo,$uid,$active,$after['revision'],'cart-add',['productId'=>$id,'quantity'=>1]);else toggle_favorite($pdo,$uid,$id);throw new RuntimeException('Removed product accepted');}catch(CartConflict $e){relation_check(true,'No orphan can be recreated');}}
relation_check(!str_contains(json_encode(backup_payload($pdo)),'_identity'),'Identity evidence excluded from backup');
relation_check(!str_contains(json_encode(public_cms($read)),'_identity'),'Identity evidence excluded from public CMS');
$beforeResponse=relation_snapshot($pdo);$response=admin_cms_response($pdo);
relation_check($response['cms']===admin_cms_view($pdo)&&$response['revision']===get_cms_revision($pdo),'Admin CMS identity and revision form one coherent response');
relation_check(!$pdo->inTransaction()&&relation_snapshot($pdo)===$beforeResponse,'Admin read releases its lock without changing data/history');
echo 'CMS relation checks passed: '.$checks.' ('.database_driver($pdo).')'.PHP_EOL;
