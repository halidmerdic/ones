<?php
declare(strict_types=1);
$_SERVER['HTTP_HOST'] = 'localhost';
define('ONES_API_LIBRARY_ONLY', true);
define('ONES_SITEMAP_LIBRARY_ONLY', true);
require __DIR__ . '/../api.php';
require __DIR__ . '/../sitemap.php';
$checks = 0;
function sitemap_check(bool $condition, string $message): void {
    global $checks;
    if (!$condition) throw new RuntimeException($message);
    $checks++;
}
foreach (['12', '1440', '2026', 'Model 1440', '1440 Model'] as $name) {
    $cms = ['products' => [['name' => $name, 'category' => 'Oprema']], 'blogs' => [
        ['id' => 'notice', 'title' => 'Radno vrijeme', 'enabled' => true],
        ['id' => 'hidden', 'title' => $name, 'enabled' => false],
        ['id' => 'legacy', 'title' => 'Obavijest'],
    ]];
    sitemap_check(array_column(sitemap_public_blogs($cms), 'id') === ['notice', 'legacy'], 'Blog visibility ignores product keywords');
    $cms['products'] = [];
    sitemap_check(array_column(sitemap_public_blogs($cms), 'id') === ['notice', 'legacy'], 'Empty catalogue preserves blog visibility');
}
$cms=default_cms();$cms['products']=['legacy-key'=>$cms['products'][0]];
$cms['products']['legacy-key']['category']=' '.mb_strtoupper($cms['products']['legacy-key']['category'],'UTF-8').' ';
$pdo=new PDO('sqlite::memory:');$pdo->setAttribute(PDO::ATTR_ERRMODE,PDO::ERRMODE_EXCEPTION);
$pdo->exec('CREATE TABLE cms_store ("key" TEXT PRIMARY KEY, value TEXT)');
$pdo->prepare('INSERT INTO cms_store VALUES (?,?)')->execute(['cms',json_encode($cms)]);
$read=sitemap_cms($pdo);$visible=sitemap_public_products($read);
sitemap_check(count($visible)===1,'Sitemap recovers legacy collection/category reference');
sitemap_check($visible[0]['id']===$cms['products']['legacy-key']['id'],'Sitemap preserves original ID');
sitemap_check(array_column($visible,'id')===array_column(public_cms($read)['products'],'id'),'Sitemap agrees with public product visibility');
$read['categories'][0]['enabled']=false;
sitemap_check(sitemap_public_products($read)===[],'Disabled category remains hidden');
sitemap_check(json_decode($pdo->query('SELECT value FROM cms_store')->fetchColumn(),true)===$cms,'Read does not rewrite legacy CMS');
echo 'Sitemap checks passed: '.$checks.PHP_EOL;
