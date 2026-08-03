<?php
declare(strict_types=1);

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

function sitemap_database(): ?PDO
{
    $configPath = file_exists(__DIR__ . '/config.local.php')
        ? __DIR__ . '/config.local.php'
        : (file_exists(__DIR__ . '/config.php') ? __DIR__ . '/config.php' : __DIR__ . '/config.example.php');
    $config = require $configPath;
    $database = is_array($config['database'] ?? null) ? $config['database'] : [];
    $driver = strtolower((string)($database['driver'] ?? 'sqlite'));

    if ($driver === 'mysql') {
        $host = (string)($database['host'] ?? '');
        $port = (string)($database['port'] ?? '3306');
        $name = (string)($database['name'] ?? '');
        $user = (string)($database['user'] ?? '');
        $password = (string)($database['password'] ?? '');
        if ($host === '' || $name === '' || $user === '') {
            return null;
        }

        return new PDO(
            'mysql:host=' . $host . ';port=' . $port . ';dbname=' . $name . ';charset=utf8mb4',
            $user,
            $password,
            [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
            ]
        );
    }

    $dbPath = (string)($database['sqlite_path'] ?? (__DIR__ . '/data/ones.sqlite'));
    if (!is_file($dbPath)) {
        return null;
    }

    $pdo = new PDO('sqlite:' . $dbPath);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
    return $pdo;
}

function sitemap_cms(?PDO $pdo): array
{
    if (!$pdo) {
        return ['products' => [], 'blogs' => []];
    }

    $key = $pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql' ? '`key`' : '"key"';
    $stmt = $pdo->prepare('SELECT value FROM cms_store WHERE ' . $key . ' = "cms" LIMIT 1');
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

function sitemap_blog_matches_products(array $post, array $products): bool
{
    $ignored = ['ones' => true, 'elektricni' => true, 'proizvod' => true, 'proizvodi' => true];
    $keywords = [];
    foreach ($products as $product) {
        if (($product['enabled'] ?? true) === false) {
            continue;
        }
        $text = sitemap_slugify((string)($product['name'] ?? '') . ' ' . (string)($product['category'] ?? ''));
        foreach (array_filter(explode('-', $text)) as $word) {
            if (strlen($word) >= 2 && !isset($ignored[$word])) {
                $keywords[$word] = true;
            }
        }
    }
    foreach (array_keys($keywords) as $keyword) {
        if (strpos($keyword, 'romobil') !== false || strpos($keyword, 'skuter') !== false) {
            $keywords['romobil'] = true;
            $keywords['skuter'] = true;
            break;
        }
    }

    if (!$keywords) {
        return true;
    }

    $haystack = sitemap_slugify(
        (string)($post['title'] ?? '') . ' '
        . (string)($post['tag'] ?? '') . ' '
        . strip_tags((string)($post['text'] ?? ''))
    );
    foreach (array_keys($keywords) as $keyword) {
        if (strpos($haystack, $keyword) !== false) {
            return true;
        }
    }
    return false;
}

$base = sitemap_base_url();
$cms = ['products' => [], 'blogs' => []];
try {
    $cms = sitemap_cms(sitemap_database());
} catch (Throwable $error) {
    error_log('oneS sitemap error: ' . $error->getMessage());
}
$xml = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n";
$xml .= "<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n";
$xml .= sitemap_url($base . '/', '1.0', 'daily');
$xml .= sitemap_url($base . '/privacy.html', '0.3', 'yearly');
$xml .= sitemap_url($base . '/terms.html', '0.3', 'yearly');

foreach (($cms['products'] ?? []) as $product) {
    if (($product['enabled'] ?? true) === false) {
        continue;
    }
    $id = trim((string)($product['id'] ?? ''));
    if ($id !== '') {
        $xml .= sitemap_url($base . '/product.html?id=' . rawurlencode($id), '0.8', 'weekly');
    }
}

foreach (($cms['blogs'] ?? []) as $index => $post) {
    if (($post['enabled'] ?? true) === false || !sitemap_blog_matches_products($post, $cms['products'] ?? [])) {
        continue;
    }
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
