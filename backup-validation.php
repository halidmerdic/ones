<?php
declare(strict_types=1);

// Backup input is untrusted even when uploaded by an administrator. These
// schemas also prevent arbitrary table/column names reaching insert_rows().
function backup_is_list($value): bool
{
    return is_array($value) && ($value === [] || array_keys($value) === range(0, count($value) - 1));
}

function backup_invalid(string $path, string $message): void
{
    throw new InvalidArgumentException('Backup ' . $path . ': ' . $message);
}

function backup_integer($value, string $path, int $min = 1, int $max = 4294967295): int
{
    // Older PDO exports contain numeric strings. Never accept floats/bools.
    if (!(is_int($value) || (is_string($value) && preg_match('/^(0|[1-9][0-9]*)$/D', $value)))
        || (float)$value < $min || (float)$value > $max) {
        backup_invalid($path, 'nije ispravan cijeli broj.');
    }
    return (int)$value;
}

function backup_text($value, string $path, int $max, bool $required = false): string
{
    if (!is_string($value) || !preg_match('//u', $value)
        || cms_text_length($value) > $max || ($required && trim($value) === '')
        || preg_match('/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/', $value)) {
        backup_invalid($path, 'nije ispravan tekst.');
    }
    return $value;
}

function backup_date(string $value, string $path, bool $optional = false): void
{
    if ($optional && $value === '') {
        return;
    }
    if (!preg_match('/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?$/D', $value)) {
        backup_invalid($path, 'nije ispravno vrijeme.');
    }
    $date = date_parse($value);
    if ($date['error_count'] || $date['warning_count']) {
        backup_invalid($path, 'nije ispravan datum.');
    }
}

function backup_cms_shapes(array $cms): void
{
    foreach (['contact', 'sections', 'settings'] as $key) {
        if (!is_array($cms[$key] ?? null)) {
            backup_invalid('cms.' . $key, 'mora biti objekat.');
        }
        foreach ($cms[$key] as $value) {
            if (is_array($value) || is_object($value)) {
                backup_invalid('cms.' . $key, 'polje mora biti jednostavna vrijednost.');
            }
        }
    }
    foreach (['launchChecklist', 'categories', 'badges', 'products', 'comingSoon', 'parts', 'manuals', 'locations', 'blogs', 'faq'] as $key) {
        if (!backup_is_list($cms[$key] ?? null)) {
            backup_invalid('cms.' . $key, 'mora biti lista.');
        }
        $nestedFields = $key === 'products' ? ['gallery', 'specs', 'attributes'] : ($key === 'categories' ? ['attributes'] : []);
        foreach ($cms[$key] as $index => $item) {
            if (!is_array($item) || !$item) {
                backup_invalid('cms.' . $key . '.' . $index, 'mora biti objekat.');
            }
            foreach ($item as $field => $value) {
                if ((is_array($value) || is_object($value)) && !in_array($field, $nestedFields, true)) {
                    backup_invalid('cms.' . $key . '.' . $index . '.' . $field, 'pogrešan tip vrijednosti.');
                }
            }
        }
    }
    foreach ($cms['products'] as $i => $product) {
        if (is_array($product) && isset($product['gallery']) && !backup_is_list($product['gallery'])) {
            backup_invalid('cms.products.' . $i . '.gallery', 'mora biti lista.');
        }
    }
    foreach ($cms['categories'] as $i => $category) {
        if (!is_array($category) || !array_key_exists('attributes', $category)) {
            continue;
        }
        if (!backup_is_list($category['attributes'])) {
            backup_invalid('cms.categories.' . $i . '.attributes', 'mora biti lista.');
        }
        foreach ($category['attributes'] as $j => $attribute) {
            if (!is_array($attribute) || !backup_is_list($attribute['values'] ?? null)) {
                backup_invalid('cms.categories.' . $i . '.attributes.' . $j, 'vrijednosti moraju biti lista.');
            }
        }
    }
}

function normalize_backup_payload($backup): array
{
    if (!is_array($backup) || !in_array($backup['version'] ?? null, [1, 2, 3], true)) {
        backup_invalid('version', 'podržani su samo formati 1, 2 i 3.');
    }
    $legacy = $backup['version'] === 1;
    $allowedTop = ['version', 'createdAt', 'containsSensitiveData', 'cms', 'cmsRevision', 'tables'];
    if (array_diff(array_keys($backup), $allowedTop)) {
        backup_invalid('struktura', 'sadrži nepoznata polja.');
    }
    backup_date(backup_text($backup['createdAt'] ?? null, 'createdAt', 64, true), 'createdAt');
    if (isset($backup['containsSensitiveData']) && !is_bool($backup['containsSensitiveData'])) {
        backup_invalid('containsSensitiveData', 'mora biti logička vrijednost.');
    }
    if (!$legacy || array_key_exists('cmsRevision', $backup)) {
        $backup['cmsRevision'] = backup_integer($backup['cmsRevision'] ?? null, 'cmsRevision');
    }
    if (!is_array($backup['cms'] ?? null) || !is_array($backup['tables'] ?? null)) {
        backup_invalid('struktura', 'CMS i tabele su obavezni.');
    }
    if ($legacy) {
        $defaults = default_cms();
        foreach (['contact', 'sections'] as $key) {
            if (!is_array($backup['cms'][$key] ?? null)) {
                backup_invalid('cms.' . $key, 'mora biti objekat.');
            }
            $backup['cms'][$key] = array_replace($defaults[$key], $backup['cms'][$key]);
        }
        if (!array_key_exists('settings', $backup['cms'])) {
            $backup['cms']['settings'] = $defaults['settings'];
        }
        if (backup_is_list($backup['cms']['blogs'] ?? null)) {
            $blogIds = [];
            foreach ($backup['cms']['blogs'] as $blog) {
                if (is_array($blog) && is_string($blog['id'] ?? null)) {
                    $blogIds[cms_normalized_key($blog['id'])] = true;
                }
            }
            foreach ($backup['cms']['blogs'] as $index => $blog) {
                if (is_array($blog) && !array_key_exists('id', $blog) && is_string($blog['title'] ?? null)) {
                    $id = 'legacy-blog-' . substr(hash('sha256', $blog['title'] . ':' . $index), 0, 16);
                    while (isset($blogIds[$id])) $id .= '-1';
                    $backup['cms']['blogs'][$index]['id'] = $id;
                    $blogIds[$id] = true;
                }
            }
        }
        // v1 had free-text badges and no badge registry. Preserve their labels.
        if (!array_key_exists('badges', $backup['cms'])) {
            $badges = $defaults['badges'];
            $names = array_map(static fn(array $badge): string => cms_normalized_key($badge['name']), $badges);
            foreach (['products', 'categories'] as $key) {
                foreach (is_array($backup['cms'][$key] ?? null) ? $backup['cms'][$key] : [] as $item) {
                    $name = is_array($item) && is_string($item['badge'] ?? null) ? trim($item['badge']) : '';
                    if ($name !== '' && !in_array(cms_normalized_key($name), $names, true)) {
                        $badges[] = ['name' => $name, 'enabled' => true];
                        $names[] = cms_normalized_key($name);
                    }
                }
            }
            $backup['cms']['badges'] = $badges;
        }
    }
    backup_cms_shapes($backup['cms']);
    $cmsErrors = cms_validate_payload($backup['cms']);
    if ($cmsErrors) {
        backup_invalid('CMS', $cmsErrors[0]);
    }

    $schemas = [
        'users' => ['id' => 0, 'name' => 190, 'email' => 190, 'password_hash' => 255, 'role' => 40, 'created_at' => 64, 'phone' => 80, 'privacy_accepted_at' => 64, 'auth_version' => 0],
        'carts' => ['id' => 0, 'user_id' => 0, 'status' => 40, 'created_at' => 64, 'updated_at' => 64, 'revision' => 0],
        'cart_items' => ['id' => 0, 'cart_id' => 0, 'product_id' => 190, 'quantity' => 0, 'created_at' => 64],
        'product_favorites' => ['id' => 0, 'user_id' => 0, 'product_id' => 190, 'created_at' => 64],
        'orders' => ['id' => 0, 'user_id' => 0, 'customer_name' => 190, 'customer_email' => 190, 'phone' => 80, 'note' => 10000, 'status' => 40, 'items_json' => 1000000, 'created_at' => 64, 'updated_at' => 64, 'admin_note' => 1000],
    ];
    if (array_diff(array_keys($backup['tables']), array_keys($schemas))) {
        backup_invalid('tables', 'sadrži nepoznate tabele.');
    }
    // Explicit v1 migration: only columns introduced after that format default.
    if ($legacy && !array_key_exists('product_favorites', $backup['tables'])) {
        $backup['tables']['product_favorites'] = [];
    }
    $ids = [];
    foreach ($schemas as $table => $schema) {
        if (!backup_is_list($backup['tables'][$table] ?? null)) {
            backup_invalid($table, 'mora biti lista redova.');
        }
        $ids[$table] = [];
        foreach ($backup['tables'][$table] as $index => $row) {
            $path = $table . '.' . $index;
            if ($table === 'carts' && $backup['version'] < 3 && is_array($row)) $row += ['revision' => 1];
            if (!is_array($row) || !$row || array_diff(array_keys($row), array_keys($schema))) {
                backup_invalid($path, 'red je prazan ili sadrži nepoznate kolone.');
            }
            if ($legacy && $table === 'users') {
                $row += ['phone' => '', 'privacy_accepted_at' => '', 'auth_version' => 0];
            } elseif ($legacy && $table === 'orders') {
                $row += ['admin_note' => ''];
            }
            foreach ($schema as $column => $limit) {
                $field = $path . '.' . $column;
                if (!array_key_exists($column, $row)) {
                    backup_invalid($field, 'obavezno polje nedostaje.');
                }
                $row[$column] = $limit === 0
                    ? backup_integer($row[$column], $field, $column === 'auth_version' ? 0 : 1, $column === 'quantity' ? 99 : 4294967295)
                    : backup_text($row[$column], $field, $limit);
                if (in_array($column, ['created_at', 'updated_at', 'privacy_accepted_at'], true)) {
                    backup_date($row[$column], $field, $column === 'privacy_accepted_at');
                }
            }
            if (isset($ids[$table][$row['id']])) {
                backup_invalid($path . '.id', 'ID je ponovljen.');
            }
            $ids[$table][$row['id']] = true;
            $backup['tables'][$table][$index] = $row;
        }
    }
    $emails = [];
    $hasAdmin = false;
    foreach ($backup['tables']['users'] as $row) {
        $email = cms_normalized_key($row['email']);
        if (trim($row['name']) === '' || !filter_var($row['email'], FILTER_VALIDATE_EMAIL)
            || $email !== $row['email'] || isset($emails[$email])
            || !in_array($row['role'], ['admin', 'customer'], true)) {
            backup_invalid('users', 'ime, email, uloga ili jedinstvenost naloga nisu ispravni.');
        }
        $emails[$email] = true;
        $info = password_get_info($row['password_hash']);
        if (($info['algoName'] ?? 'unknown') === 'unknown'
            || (($info['algoName'] ?? '') === 'bcrypt' && !preg_match('~^\$2[aby]\$(?:0[4-9]|[12][0-9]|3[01])\$[./A-Za-z0-9]{53}$~D', $row['password_hash']))) {
            backup_invalid('users.password_hash', 'potrebna je potpuna sigurnosna kopija s važećim hashom lozinke.');
        }
        if ($row['role'] === 'admin' && $email === 'admin@ones.local') {
            $hasAdmin = true;
        }
        if ($row['role'] === 'admin' && empty($GLOBALS['isLocalHost']) && admin_hash_uses_demo_password($row['password_hash'])) {
            backup_invalid('users.password_hash', 'produkcijski backup ne smije sadržavati demonstracijsku admin lozinku. Promijenite je lokalno i napravite novi backup.');
        }
    }
    if (!$hasAdmin) {
        backup_invalid('users', 'nedostaje administrator admin@ones.local s važećom lozinkom.');
    }
    $pairs = [];
    foreach (['carts', 'orders', 'product_favorites'] as $table) {
        foreach ($backup['tables'][$table] as $row) {
            if (!isset($ids['users'][$row['user_id']])) {
                backup_invalid($table . '.user_id', 'korisnik ne postoji u backupu.');
            }
            if ($table === 'carts' && !in_array($row['status'], ['active', 'submitted'], true)) {
                backup_invalid('carts.status', 'nepoznat status.');
            }
            if ($table === 'product_favorites') {
                $pair = $row['user_id'] . ':' . $row['product_id'];
                if ($row['product_id'] === '' || isset($pairs[$pair])) {
                    backup_invalid('product_favorites', 'prazan proizvod ili ponovljen favorit.');
                }
                $pairs[$pair] = true;
            }
        }
    }
    $pairs = [];
    foreach ($backup['tables']['cart_items'] as $row) {
        if (!isset($ids['carts'][$row['cart_id']]) || $row['product_id'] === '') {
            backup_invalid('cart_items', 'korpa ne postoji ili je proizvod prazan.');
        }
        $pair = $row['cart_id'] . ':' . $row['product_id'];
        if (!$legacy && isset($pairs[$pair])) {
            backup_invalid('cart_items', 'proizvod je ponovljen u istoj korpi.');
        }
        $pairs[$pair] = true;
    }
    // Old carts/favorites and order snapshots can legitimately reference a
    // removed catalogue product. Keep these records; never silently drop them.
    foreach ($backup['tables']['orders'] as $row) {
        if (!in_array($row['status'], ['Novo', 'U obradi', 'Kontaktiran', 'Završeno', 'Otkazano'], true)
            || trim($row['customer_name']) === '' || !filter_var($row['customer_email'], FILTER_VALIDATE_EMAIL)) {
            backup_invalid('orders', 'neispravan status ili identitet kupca.');
        }
        try {
            $items = json_decode($row['items_json'], true, 64, JSON_THROW_ON_ERROR);
        } catch (JsonException $error) {
            backup_invalid('orders.items_json', 'nije ispravan JSON.');
        }
        if (!backup_is_list($items) || !$items) {
            backup_invalid('orders.items_json', 'mora sadržavati listu artikala.');
        }
        foreach ($items as $item) {
            if (!is_array($item) || array_diff(array_keys($item), ['productId', 'name', 'quantity', 'price'])) {
                backup_invalid('orders.items_json', 'neispravan artikal.');
            }
            backup_text($item['productId'] ?? null, 'order.productId', 190, true);
            backup_text($item['name'] ?? null, 'order.name', 250, true);
            backup_text($item['price'] ?? null, 'order.price', 80);
            backup_integer($item['quantity'] ?? null, 'order.quantity', 1, 99);
        }
    }
    if ($legacy) {
        $backup['tables']['cart_items'] = consolidate_cart_item_rows($backup['tables']['cart_items']);
    }
    try {
        [$carts, $items] = normalize_active_carts($backup['tables']['carts'], $backup['tables']['cart_items']);
        if ($backup['version'] === 3 && count($carts) !== count($backup['tables']['carts'])) backup_invalid('carts', 'ponovljena aktivna korpa.');
        $backup['tables']['carts'] = $carts;
        $backup['tables']['cart_items'] = $items;
    } catch (RuntimeException $error) {
        backup_invalid('carts', $error->getMessage());
    }
    return $backup;
}
