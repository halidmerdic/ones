<?php
declare(strict_types=1);
// PHP's development server ignores .htaccess. Never serve local runtimes/configuration.
$path = rawurldecode(parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/');
if (preg_match('~(?:^|/)[.]|^/(?:data|vendor|deploy|tests)(?:/|$)|^/config(?:[.]local|[.]example)?[.]php$~i', $path)
    || preg_match('~[.](?:sqlite(?:-.*)?|ini|log|zip|sql|conf|json)$~i', $path)) {
    http_response_code(403);
    exit('Forbidden');
}
return false;
