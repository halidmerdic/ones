<?php
declare(strict_types=1);

// Mirror onesPhone in api-client.js; parity fixtures cover both implementations.
// Normalizes contact notation, not ownership or availability on a messaging service.
function canonical_phone(string $value): string
{
    if (strlen($value) > 120 || preg_match('/[^0-9+()\/ .\t\x{00a0}\x{202f}-]/u', $value)) return '';
    $number = preg_replace('/[()\/ .\t\x{00a0}\x{202f}-]/u', '', $value) ?? '';
    if ($number === '' || !preg_match('/^\+?[0-9]+$/D', $number)) return '';
    if (str_starts_with($number, '00')) $number = '+' . substr($number, 2);
    elseif (str_starts_with($number, '0')) $number = '+387' . substr($number, 1);
    elseif (str_starts_with($number, '387')) $number = '+' . $number;
    // A written national trunk prefix is omitted from the international BiH number.
    if (str_starts_with($number, '+3870')) $number = '+387' . substr($number, 5);
    if (!preg_match('/^\+[1-9][0-9]{6,14}$/D', $number)) return '';
    if (str_starts_with($number, '+387') && !preg_match('/^\+387[1-9][0-9]{5,8}$/D', $number)) return '';
    return $number;
}
