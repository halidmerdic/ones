<?php
declare(strict_types=1);

// Decimal units (dot or comma), at most two fractional digits. No currency
// suffix, grouping, sign or exponent. Empty means no price. Keep JS in sync.
function price_cents($value): ?int
{
    if ($value === null || $value === '') return 0;
    if (is_float($value)) {
        if (!is_finite($value)) return null;
        $value = $value == 0 ? '0' : json_encode($value, JSON_PRESERVE_ZERO_FRACTION);
    } elseif (is_int($value)) {
        $value = (string)$value;
    }
    if (!is_string($value)) return null;
    $value = trim($value, " \t\r\n");
    if ($value === '') return 0;
    if (!preg_match('/\A([0-9]{1,10})(?:[.,]([0-9]{1,2}))?\z/', $value, $match)) return null;
    $cents = (int)$match[1] * 100 + (int)str_pad($match[2] ?? '', 2, '0');
    return $cents <= 100000000000 ? $cents : null;
}

function format_price_cents(int $cents): string
{
    $fraction = $cents % 100;
    return (string)intdiv($cents, 100) . ($fraction ? '.' . rtrim(str_pad((string)$fraction, 2, '0', STR_PAD_LEFT), '0') : '');
}
