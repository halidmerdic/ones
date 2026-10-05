<?php
declare(strict_types=1);
$_SERVER['HTTP_HOST'] = 'localhost';
define('ONES_API_LIBRARY_ONLY', true);
require __DIR__ . '/../api.php';
if (($argv[1] ?? '') === '--json') {
    $inputs = json_decode(stream_get_contents(STDIN), true, 512, JSON_THROW_ON_ERROR);
    echo json_encode(['passwords' => array_map('password_validation_error', $inputs['passwords']), 'prices' => array_map('price_cents', $inputs['prices'])], JSON_UNESCAPED_UNICODE);
    exit;
}
$checks = 0;
function input_check(bool $condition): void { global $checks; if (!$condition) throw new RuntimeException('Input policy check failed: ' . ($checks + 1)); $checks++; }
input_check(password_validation_error(str_repeat('č', 8)) !== null);
input_check(password_validation_error('😀😁😂😃😄😅😆😉') !== null);
input_check(password_validation_error('čćšđžČĆŠĐŽ12345') === null);
input_check(password_validation_error(str_repeat('č', 15)) !== null);
input_check(password_validation_error("12345678901234\0") !== null);
input_check(password_validation_error("12345678901234\xC3") !== null);
input_check(!verify_user_password("before\0after", ['password_hash' => hash_password('before')]));
input_check(password_validation_error(str_repeat('a', 70) . 'č') === null);
input_check(password_validation_error(str_repeat('a', 71) . 'č') !== null);
input_check(password_verify('čćšđžČĆŠĐŽ12345', hash_password('čćšđžČĆŠĐŽ12345')));
// Existing short Unicode passwords remain usable until the user changes them.
input_check(verify_user_password('čćšđž123', ['password_hash' => hash_password('čćšđž123')]));
foreach (['1e3', '-100', '+10', '1.000,00', '1,234', '12 KM', '1.2.3', '0x10', true, [], 1.0000000000000002] as $invalid) {
    input_check(price_cents($invalid) === null);
    $errors = [];
    cms_validate_price($errors, ['price' => $invalid], 'price', 'product');
    input_check(count($errors) === 1);
}
input_check(price_cents('1000,20') === 100020);
input_check(price_cents('0.01') === 1);
input_check(price_cents('1000000000.00') === 100000000000);
input_check(price_cents('1000000000.01') === null);
input_check(format_price('1000,20') === '1000.2');
input_check(product_price_label(['price' => '1e3']) === 'Cijena na upit');
input_check(product_price_label(['price' => '-100', 'discountPrice' => '12,34']) === '12.34');
input_check(format_price_cents(10 * 3) === '0.3');
echo "Input policy checks passed: $checks\n";
