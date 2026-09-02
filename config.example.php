<?php
declare(strict_types=1);

return [
    'database' => [
        // Use "sqlite" locally, or "mysql" on the Hetzner production server.
        'driver' => 'sqlite',

        // SQLite is used only when driver is "sqlite".
        'sqlite_path' => __DIR__ . '/data/ones.sqlite',

        // MySQL is used only when driver is "mysql".
        'host' => '127.0.0.1',
        'port' => '3306',
        'name' => 'ones_db',
        'user' => 'ones_user',
        'password' => 'OVDJE_UNESI_LOZINKU',
    ],
    'network' => [
        // Production requests with any other Host header are rejected.
        'allowed_hosts' => ['ones.ba', 'www.ones.ba'],

        // Current Cloudflare proxy ranges. Keep these synchronized with
        // https://www.cloudflare.com/ips-v4 and https://www.cloudflare.com/ips-v6.
        'trusted_proxies' => [
            '173.245.48.0/20',
            '103.21.244.0/22',
            '103.22.200.0/22',
            '103.31.4.0/22',
            '141.101.64.0/18',
            '108.162.192.0/18',
            '190.93.240.0/20',
            '188.114.96.0/20',
            '197.234.240.0/22',
            '198.41.128.0/17',
            '162.158.0.0/15',
            '104.16.0.0/13',
            '104.24.0.0/14',
            '172.64.0.0/13',
            '131.0.72.0/22',
            '2400:cb00::/32',
            '2606:4700::/32',
            '2803:f800::/32',
            '2405:b500::/32',
            '2405:8100::/32',
            '2a06:98c0::/29',
            '2c0f:f248::/32',
        ],
    ],
    'security' => [
        // Required only when production has no admin user. Use at least 15 characters.
        'initial_admin_password' => 'PROMIJENI-U-JAKU-LOZINKU',
    ],
];
