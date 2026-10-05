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

// A sale lasts through its calendar day in the store's zone, including DST.
function pricing_clock(?DateTimeImmutable $now = null): array
{
    $now = ($now ?? new DateTimeImmutable('now'))->setTimezone(new DateTimeZone('Europe/Sarajevo'));
    return [
        'date' => $now->format('Y-m-d'),
        'zone' => 'Europe/Sarajevo',
        'asOf' => (float)$now->format('U.u'),
        'refreshAfterMs' => max(1, (int)ceil(((float)$now->modify('tomorrow')->format('U.u') - (float)$now->format('U.u')) * 1000)),
    ];
}

function business_date_active($value, ?string $today = null): bool
{
    if ($value === null || $value === '') return true;
    if (!is_string($value) || !preg_match('/\A([0-9]{4})-([0-9]{2})-([0-9]{2})\z/', $value, $parts)
        || !checkdate((int)$parts[2], (int)$parts[3], (int)$parts[1])) return false;
    return $value >= ($today ?? pricing_clock()['date']);
}

function effective_product_price(array $product, ?string $today = null): array
{
    $today ??= pricing_clock()['date'];
    foreach (['salePrice' => 'sale', 'discountPrice' => 'discount', 'mpcPrice' => 'regular', 'price' => 'regular'] as $field => $type) {
        if ($field === 'salePrice' && (empty($product['saleUntil']) || !business_date_active($product['saleUntil'], $today))) continue;
        $cents = price_cents($product[$field] ?? null) ?? 0;
        if ($cents > 0) return ['label' => format_price_cents($cents), 'type' => $type, 'date' => $today];
    }
    return ['label' => 'Cijena na upit', 'type' => 'inquiry', 'date' => $today];
}
