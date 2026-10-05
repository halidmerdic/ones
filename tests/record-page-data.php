<?php
declare(strict_types=1);
// Synthetic data shared by SQL and disposable HTTP regressions.
function seed_record_page_data(PDO $pdo): array
{
$user=$pdo->prepare('INSERT INTO users(name,email,password_hash,role,created_at,phone) VALUES(?,?,?,"customer",?,?)');
$order=$pdo->prepare('INSERT INTO orders(user_id,customer_name,customer_email,phone,note,admin_note,status,items_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)');
$hash=hash_password('Page customer password 2026!');$ids=[];
$pdo->beginTransaction();
for($i=0;$i<130;$i++){
    $name=$i===0?'ŽELJKO 100%_!':"Kupac $i";$email="page$i@example.invalid";
    $user->execute([$name,$email,$hash,'2026-01-01T00:00:00+01:00','+38761123456']);$uid=(int)$pdo->lastInsertId();$ids[]=$uid;
    for($j=0;$j<($i===0?77:3);$j++){
        $items=[['productId'=>'historic','name'=>$i===0?'Stari ŽUTI artikal 100%_!':'Drugi artikal','quantity'=>1,'price'=>'12']];
        $at=$j%2?'2026-02-03T23:59:59+01:00':'2026-02-04T00:00:00+01:00';
        $order->execute([$uid,$name,$email,'+38761123456','Customer note','PRIVATE ADMIN NOTE',$j%2?'Završeno':'Novo',json_encode($items,JSON_UNESCAPED_UNICODE),$at,$at]);
        index_order_items($pdo,(int)$pdo->lastInsertId(),$items);
    }
}
$pdo->prepare('INSERT INTO customer_email_state(user_id,email,verified_at) VALUES(?,?,?)')->execute([$ids[0],'page0@example.invalid',date('c')]);
$pdo->commit();
return $ids;
}
