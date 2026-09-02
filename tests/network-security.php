<?php
declare(strict_types=1);

ini_set('session.save_path', sys_get_temp_dir());
$_SERVER['HTTP_HOST'] = 'localhost';
define('ONES_API_LIBRARY_ONLY', true);
require __DIR__ . '/../api.php';

$checks = 0;

function assert_network_test(bool $condition, string $message): void
{
    global $checks;
    if (!$condition) {
        fwrite(STDERR, 'FAILED: ' . $message . PHP_EOL);
        exit(1);
    }
    $checks++;
}

assert_network_test(ip_in_cidr('173.245.48.25', '173.245.48.0/20'), 'IPv4 adresa unutar CIDR raspona');
assert_network_test(!ip_in_cidr('173.245.64.1', '173.245.48.0/20'), 'IPv4 adresa izvan CIDR raspona');
assert_network_test(ip_in_cidr('2606:4700::1234', '2606:4700::/32'), 'IPv6 adresa unutar CIDR raspona');
assert_network_test(!ip_in_cidr('2607:4700::1', '2606:4700::/32'), 'IPv6 adresa izvan CIDR raspona');
assert_network_test(!ip_in_cidr('not-an-ip', '173.245.48.0/20'), 'neispravna IP adresa se odbija');

$trustedConfig = [
    'network' => [
        'trusted_proxies' => ['173.245.48.0/20', '2606:4700::/32'],
    ],
];

$_SERVER['REMOTE_ADDR'] = '203.0.113.10';
$_SERVER['HTTP_CF_CONNECTING_IP'] = '198.51.100.25';
$_SERVER['HTTP_X_FORWARDED_FOR'] = '198.51.100.30';
assert_network_test(client_ip($trustedConfig) === '203.0.113.10', 'nepouzdan izvor ne može lažirati klijentsku IP adresu');

$_SERVER['REMOTE_ADDR'] = '173.245.48.25';
assert_network_test(client_ip($trustedConfig) === '198.51.100.25', 'Cloudflare proxy može proslijediti validnu klijentsku IP adresu');

$_SERVER['HTTP_CF_CONNECTING_IP'] = 'invalid';
assert_network_test(client_ip($trustedConfig) === '173.245.48.25', 'neispravna Cloudflare IP vrijednost se zanemaruje');

$_SERVER['HTTPS'] = 'off';
$_SERVER['SERVER_PORT'] = '80';
$_SERVER['REMOTE_ADDR'] = '203.0.113.10';
$_SERVER['HTTP_X_FORWARDED_PROTO'] = 'https';
$_SERVER['HTTP_CF_VISITOR'] = '{"scheme":"https"}';
assert_network_test(!request_is_https($trustedConfig), 'nepouzdan izvor ne može lažirati HTTPS zaglavlje');

$_SERVER['REMOTE_ADDR'] = '173.245.48.25';
assert_network_test(request_is_https($trustedConfig), 'HTTPS zaglavlje se prihvata od pouzdanog proxyja');

$_SERVER['REMOTE_ADDR'] = '203.0.113.10';
$_SERVER['HTTPS'] = 'on';
unset($_SERVER['HTTP_X_FORWARDED_PROTO'], $_SERVER['HTTP_CF_VISITOR']);
assert_network_test(request_is_https($trustedConfig), 'direktna HTTPS veza se prepoznaje');

$_SERVER['HTTP_HOST'] = 'ones.ba:443';
assert_network_test(request_host() === 'ones.ba', 'port se uklanja iz Host zaglavlja');
$_SERVER['HTTP_HOST'] = '[::1]:8000';
assert_network_test(request_host() === '::1', 'IPv6 Host zaglavlje se normalizuje');

echo 'Network security checks passed: ' . $checks . PHP_EOL;
