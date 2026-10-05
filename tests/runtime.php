<?php
declare(strict_types=1);
$errors = [];
if (PHP_VERSION_ID < 80500) $errors[] = 'Projekt zahtijeva PHP 8.5 ili noviji; pronađen ' . PHP_VERSION;
foreach (['dom', 'fileinfo', 'gd', 'mbstring', 'openssl', 'PDO', 'pdo_mysql', 'pdo_sqlite', 'session'] as $extension) {
    if (!extension_loaded($extension)) $errors[] = 'Nedostaje ekstenzija ' . $extension;
}
if ($errors) {
    fwrite(STDERR, implode(PHP_EOL, $errors) . PHP_EOL);
    exit(1);
}
echo 'PHP runtime check passed: ' . PHP_VERSION . PHP_EOL;
