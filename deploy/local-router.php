<?php
declare(strict_types=1);
// PHP's development server ignores .htaccess; mirror the public-path allowlist.
$path = rawurldecode(parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/');
$public = '~^/(?:$|(?:index|admin|blog|cart|login|privacy|product|profile|terms|verify)\.html|(?:admin|api-client|app|blog|cart|cms-focus|login|product|profile|profile-orders|storage|theme|verify)\.js|(?:styles|admin|cms-relations|admin-feedback|admin-responsive|verify)\.css|(?:api|sitemap)\.php|robots\.txt|(?:assets|uploads)/.+\.(?:webp|png|jpe?g|gif|svg|ico|avif|pdf|woff2?|ttf|otf|css|js)|\.well-known/acme-challenge/[A-Za-z0-9_-]+)$~i';
if (!preg_match($public, $path) || str_contains($path, '\\') || str_contains($path, "\0")
    || preg_match('~(?:^|/)\.(?!well-known(?:/|$))|\.(?:php[0-9]?|phtml|phar|cgi|pl|asp|aspx|jsp|exe|dll)[./]~i', $path)) {
    http_response_code(403);
    exit('Forbidden');
}
return false;
