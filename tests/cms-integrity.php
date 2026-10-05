<?php
declare(strict_types=1);
$_SERVER['HTTP_HOST'] = 'localhost';
define('ONES_API_LIBRARY_ONLY', true);
require __DIR__ . '/../api.php';
$checks = 0;
function cms_check(bool $condition, string $message): void { global $checks; if (!$condition) throw new RuntimeException($message); $checks++; }
$config = ['database' => ['driver' => 'sqlite', 'sqlite_path' => ':memory:'], 'security' => ['initial_admin_password' => 'CMS integrity admin 2026!']];
if (getenv('ONES_TEST_MYSQL_PORT')) {
    $name = getenv('ONES_TEST_MYSQL_DATABASE');
    if (!preg_match('/^ones_segment_test[0-9]+$/D', (string)$name)) throw new RuntimeException('Disposable DB required');
    $config['database'] = ['driver'=>'mysql','host'=>'127.0.0.1','port'=>getenv('ONES_TEST_MYSQL_PORT'),'name'=>$name,'user'=>'root','password'=>''];
}
$pdo = database($config);
cms_check((int)$pdo->query('SELECT COUNT(*) FROM users')->fetchColumn() === 1, 'Fresh isolated DB');
$base = get_cms($pdo);
$base['categories'][0]['attributes'] = [['name'=>'Boja','values'=>['Crna','Bijela']]];
$base['categories'][0]['badge'] = $base['badges'][0]['name'];
$base['badges'][0]['applyCategory'] = $base['categories'][0]['name'];
$base['products'][0]['badge'] = $base['badges'][0]['name'];
$base['products'][0]['gallery'] = ['assets/ones-logo.webp'];
$base['products'][0]['attributes'] = ['Boja'=>'Crna'];
$base['manuals'] = [['title'=>'Test manual','relatedProductId'=>$base['products'][0]['id'],'category'=>$base['categories'][0]['name'],'visibility'=>'Javno','file'=>'uploads/manuals/test.pdf']];
save_cms($pdo,$base,1);
cms_check(cms_validate_payload($base) === [], 'Valid complete CMS');
$before = $pdo->query('SELECT value,revision FROM cms_store')->fetch(PDO::FETCH_ASSOC);
$historyCount = (int)$pdo->query('SELECT COUNT(*) FROM cms_revisions')->fetchColumn();
function reject_cms(PDO $pdo, array $candidate, string $path): void {
    global $before,$historyCount;
    $errors=cms_validate_payload($candidate);
    cms_check((bool)array_filter($errors,static fn($e)=>str_contains($e,$path)), 'Validation path '.$path);
    try { save_cms($pdo,$candidate); throw new RuntimeException('Invalid save accepted'); }
    catch (CmsValidationError $e) { cms_check(true,'Direct save rejects invalid CMS'); }
    cms_check($pdo->query('SELECT value,revision FROM cms_store')->fetch(PDO::FETCH_ASSOC)===$before,'Invalid save preserves CMS/revision');
    cms_check((int)$pdo->query('SELECT COUNT(*) FROM cms_revisions')->fetchColumn()===$historyCount,'Invalid save preserves history');
}
foreach (['launchChecklist','categories','badges','products','comingSoon','parts','manuals','locations','blogs','faq'] as $key) {
    foreach ([null,false,'bad',17,['named'=>['name'=>'Bad']], [1=>['name'=>'Bad']]] as $bad) { $c=$base; $c[$key]=$bad; reject_cms($pdo,$c,$key); }
    $wire=json_decode(json_encode($base));
    foreach ([(object)[],(object)['0'=>(object)['name'=>'Bad']]] as $bad) { $wire->$key=$bad; cms_check((bool)cms_shape_errors($wire,true),'JSON object cannot masquerade as list'); }
}
foreach ([['products',0,'gallery'],['categories',0,'attributes'],['categories',0,'attributes',0,'values']] as $path) {
    foreach (['bad',['named'=>'item'],[2=>'item']] as $bad) { $c=$base; $target=&$c; foreach ($path as $part) $target=&$target[$part]; $target=$bad; unset($target); reject_cms($pdo,$c,implode('.',$path)); }
}
foreach ([['products',0,'id'],['products',0,'category'],['badges',0,'applyCategory'],['manuals',0,'relatedProductId'],['settings','productGridColumns'],['launchChecklist',0,'id']] as $path) {
    $c=$base; $target=&$c; foreach($path as $part)$target=&$target[$part];$target=['bad'];unset($target);reject_cms($pdo,$c,implode('.',$path));
}
foreach (['specs','attributes'] as $field) {
    $c=$base;$c['products'][0][$field]=['numeric list'];reject_cms($pdo,$c,'products.0.'.$field);
    $c['products'][0][$field]=['Named'=>['nested']];reject_cms($pdo,$c,'products.0.'.$field);
    $c['products'][0][$field]=[];cms_check(cms_validate_payload($c)===[],'Legacy empty map accepted');
    $wire=json_decode(json_encode($c));$wire->products[0]->$field=(object)[];cms_check(cms_shape_errors($wire,true)===[],'Empty JSON map accepted');
}
// Every reference kind uses the same exact spelling as public rendering.
$relations=[['products','category'],['products','badge'],['categories','badge'],['badges','applyCategory'],['manuals','relatedProductId'],['manuals','category']];
foreach ($relations as [$collection,$field]) {
    $c=$base;$c[$collection][0][$field]=' '.mb_strtoupper($base[$collection][0][$field],'UTF-8').' ';
    reject_cms($pdo,$c,$collection.'.0.'.$field);
    cms_check(cms_canonical_references($c)===$base,'Unambiguous legacy reference canonicalizes');
    $public=public_cms($c);cms_check(count($public['products'])===1 && count($public['manuals'])===1,'Legacy public product/manual remains visible');
    $c[$collection][0][$field]='Unknown target';reject_cms($pdo,$c,$collection.'.0.'.$field);
}
$legacy=$base;$legacy['products']=['named'=>$base['products'][0]];$legacy['products']['named']['category']=' '.mb_strtoupper($base['categories'][0]['name'],'UTF-8').' ';
$pdo->prepare('UPDATE cms_store SET value=?')->execute([json_encode($legacy)]);
cms_check(get_cms($pdo)===$base,'Legacy read repairs container and reference without loss');
cms_check(json_decode($pdo->query('SELECT value FROM cms_store')->fetchColumn(),true)===$legacy,'Read does not rewrite database');
$pdo->prepare('UPDATE cms_store SET value=?')->execute([json_encode($base)]);
$id=$base['products'][0]['id'];
$pdo->prepare('INSERT INTO users(name,email,password_hash,role,created_at) VALUES (?,?,?,"customer",?)')->execute(['Test','cms@example.invalid',hash_password('CMS customer password 2026!'),date('c')]);
$uid=(int)$pdo->lastInsertId();$cartId=active_cart_id($pdo,$uid);add_cart_item($pdo,$cartId,$id,2);
$pdo->prepare('INSERT INTO product_favorites(user_id,product_id,created_at) VALUES (?,?,?)')->execute([$uid,$id,date('c')]);
$view=admin_cms_view($pdo);cms_check(isset($view['products'][0]['_identity']),'Admin receives identity evidence');
foreach (['id','proof','missing','false-deletion'] as $attack) {
    $c=$view;$deleted=[];
    if($attack==='id'){$c['products'][0]['id']='renamed';$c['manuals'][0]['relatedProductId']='renamed';$deleted=[$id];}
    elseif($attack==='proof')$c['products'][0]['_identity']=str_repeat('0',64);
    elseif($attack==='missing')unset($c['products'][0]['_identity']);
    else $deleted=[$id];
    try{save_cms($pdo,$c,get_cms_revision($pdo),$deleted);throw new RuntimeException('Identity tampering accepted');}
    catch(CmsValidationError $e){cms_check(true,'Identity tampering rejected: '.$attack);}
    cms_check(get_cms($pdo)===$base,'Identity rejection preserves CMS');
}
$renamed=$view;$renamed['products'][0]['name']='Promijenjen naziv';
$rev=save_cms($pdo,$renamed,get_cms_revision($pdo),[]);
cms_check(get_cms($pdo)['products'][0]['id']===$id,'Name edit preserves ID');
cms_check(cart_payload($pdo,$uid)['items'][0]['productId']===$id && favorites_payload($pdo,$uid)===[$id],'Name edit preserves cart/favorite links');
cms_check(!str_contains(json_encode(backup_payload($pdo)),'_identity') && !str_contains(json_encode(public_cms(get_cms($pdo))),'_identity'),'Identity metadata absent from backup/public payload');
$view=admin_cms_view($pdo);$new=$view['products'][0];unset($new['_identity']);$new['id']='new-product';$view['products'][]=$new;
$rev=save_cms($pdo,$view,$rev,[]);cms_check(count(get_cms($pdo)['products'])===2,'New product allowed');
$view=admin_cms_view($pdo);$view['products']=array_reverse($view['products']);$rev=save_cms($pdo,$view,$rev,[]);cms_check(get_cms($pdo)['products'][0]['id']==='new-product','Reorder preserves identities');
$view=admin_cms_view($pdo);array_shift($view['products']);
try{save_cms($pdo,$view,$rev,[]);throw new RuntimeException('Undeclared removal accepted');}catch(CmsValidationError $e){cms_check(true,'Undeclared removal rejected');}
$rev=save_cms($pdo,$view,$rev,['new-product']);cms_check(count(get_cms($pdo)['products'])===1,'Explicit deletion remains a separate action');
$view=admin_cms_view($pdo);$pdo->beginTransaction();rotate_auth_epoch($pdo);$pdo->commit();
try{save_cms($pdo,$view,$rev,[]);throw new RuntimeException('Old epoch proof accepted');}catch(CmsValidationError $e){cms_check(true,'Restore epoch invalidates old identity evidence');}
cms_check(!$pdo->inTransaction(),'Failed identity save releases transaction');
echo 'CMS integrity checks passed: '.$checks.' ('.database_driver($pdo).')'.PHP_EOL;
