<?php
declare(strict_types=1);

return [
    'database' => [
        // Use "sqlite" locally, or "mysql" on hosting such as InfinityFree/cPanel.
        'driver' => 'sqlite',

        // SQLite is used only when driver is "sqlite".
        'sqlite_path' => __DIR__ . '/data/ones.sqlite',

        // MySQL is used only when driver is "mysql".
        'host' => 'sqlXXX.infinityfree.com',
        'port' => '3306',
        'name' => 'if0_XXXXXXX_ones',
        'user' => 'if0_XXXXXXX',
        'password' => 'OVDJE_UNESI_LOZINKU',
    ],
];
