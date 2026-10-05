<?php
declare(strict_types=1);
require __DIR__ . '/../phone.php';
$cases = json_decode(file_get_contents(__DIR__ . '/phone-cases.json'), true, 512, JSON_THROW_ON_ERROR);
$values = [];
$checks = 0;
foreach ($cases as [$input, $expected]) {
    $actual = canonical_phone($input);
    if ($actual !== $expected) throw new RuntimeException('Unexpected phone normalization: ' . json_encode($input));
    if ($actual !== '' && canonical_phone($actual) !== $actual) throw new RuntimeException('Canonical phone is not idempotent');
    $values[] = $actual;
    $checks++;
}
echo in_array('--json', $argv, true) ? json_encode($values) : "Phone normalization: $checks checks\n";
