<?php
declare(strict_types=1);

$dbPath = __DIR__ . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'ones.sqlite';

function sitemap_base_url(): string
{
    $configured = trim((string)(getenv('ONES_SITE_URL') ?: ''));
    if ($configured !== '') {
        return rtrim($configured, '/');
    }

    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (($_SERVER['SERVER_PORT'] ?? '') === '443');
    $scheme = $https ? 'https' : 'http';
    $host = $_SERVER['HTTP_HOST'] ?? '127.0.0.1:8000';
    $path = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '/')), '/');
    return $scheme . '://' . $host . ($path === '' ? '' : $path);
}

function sitemap_slugify(string $value): string
{
    $value = strtolower(trim($value));
    $map = ['č' => 'c', 'ć' => 'c', 'š' => 's', 'ž' => 'z', 'đ' => 'dj'];
    $value = strtr($value, $map);
    $value = preg_replace('/[^a-z0-9]+/', '-', $value) ?? '';
    return trim($value, '-');
}

function sitemap_cms(string $dbPath): array
{
    if (!is_file($dbPath)) {
        return ['products' => [], 'blogs' => []];
    }

    $pdo = new PDO('sqlite:' . $dbPath);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $stmt = $pdo->prepare('SELECT value FROM cms_store WHERE key = "cms" LIMIT 1');
    $stmt->execute();
    $cms = json_decode((string)$stmt->fetchColumn(), true);
    return is_array($cms) ? $cms : ['products' => [], 'blogs' => []];
}

function sitemap_url(string $loc, string $priority = '0.7', string $changefreq = 'weekly'): string
{
    return "  <url>\n"
        . '    <loc>' . htmlspecialchars($loc, ENT_XML1) . "</loc>\n"
        . '    <changefreq>' . $changefreq . "</changefreq>\n"
        . '    <priority>' . $priority . "</priority>\n"
        . "  </url>\n";
}

$base = sitemap_base_url();
$cms = sitemap_cms($dbPath);
$xml = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n";
$xml .= "<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n";
$xml .= sitemap_url($base . '/index.html', '1.0', 'daily');

foreach (($cms['products'] ?? []) as $product) {
    $id = trim((string)($product['id'] ?? ''));
    if ($id !== '') {
        $xml .= sitemap_url($base . '/product.html?id=' . rawurlencode($id), '0.8', 'weekly');
    }
}

foreach (($cms['blogs'] ?? []) as $index => $post) {
    $id = trim((string)($post['id'] ?? ''));
    if ($id === '') {
        $id = sitemap_slugify((string)($post['title'] ?? ('blog-' . ($index + 1))));
    }
    if ($id !== '') {
        $xml .= sitemap_url($base . '/blog.html?id=' . rawurlencode($id), '0.7', 'weekly');
    }
}

$xml .= "</urlset>\n";

header('Content-Type: application/xml; charset=utf-8');
echo $xml;
