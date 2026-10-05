<?php
declare(strict_types=1);

function cms_normalized_key(string $value): string
{
    $value = trim($value);
    return function_exists('mb_strtolower') ? mb_strtolower($value, 'UTF-8') : strtolower($value);
}

final class CmsValidationError extends InvalidArgumentException
{
    public function __construct(public readonly array $errors)
    {
        parent::__construct('CMS nije sačuvan. ' . ($errors[0] ?? 'Neispravni podaci.'));
    }
}

function cms_read_collections(array $cms): array
{
    // Recover old named/indexed list containers without dropping their entries.
    // New writes must pass strict shape validation instead of relying on this.
    foreach (['launchChecklist', 'categories', 'badges', 'products', 'comingSoon', 'parts', 'manuals', 'locations', 'blogs', 'faq'] as $key) {
        if (is_array($cms[$key] ?? null)) $cms[$key] = array_values($cms[$key]);
    }
    foreach (is_array($cms['products'] ?? null) ? $cms['products'] : [] as $i => $product) {
        if (is_array($product) && is_array($product['gallery'] ?? null)) $cms['products'][$i]['gallery'] = array_values($product['gallery']);
    }
    foreach (is_array($cms['categories'] ?? null) ? $cms['categories'] : [] as $i => $category) {
        if (!is_array($category) || !is_array($category['attributes'] ?? null)) continue;
        $attributes = array_values($category['attributes']);
        foreach ($attributes as &$attribute) if (is_array($attribute) && is_array($attribute['values'] ?? null)) $attribute['values'] = array_values($attribute['values']);
        unset($attribute);
        $cms['categories'][$i]['attributes'] = $attributes;
    }
    return $cms;
}

function cms_json_view(array $cms): stdClass
{
    // PHP represents an empty map as []; expose map fields as JSON objects so
    // named attribute edits are not lost when JavaScript serializes an Array.
    foreach (['contact', 'sections', 'settings'] as $key) if (is_array($cms[$key] ?? null)) $cms[$key] = (object)$cms[$key];
    foreach (is_array($cms['products'] ?? null) ? $cms['products'] : [] as $i => $product) {
        if (!is_array($product)) continue;
        foreach (['specs', 'attributes'] as $key) if (is_array($product[$key] ?? null)) $cms['products'][$i][$key] = (object)$product[$key];
    }
    return (object)$cms;
}

// Validate containers before scalar validation can cast them or the UI can
// call Array methods. Wire mode preserves the JSON distinction between []/{}.
function cms_shape_errors($cms, bool $wire = false): array
{
    $errors = [];
    $object = static fn($value): bool => $wire
        ? $value instanceof stdClass
        : is_array($value) && !array_is_list($value);
    $list = static fn($value): bool => is_array($value) && array_is_list($value);
    $scalarFields = static function (array $item, string $path, array $nested = []) use (&$errors): void {
        foreach ($item as $key => $value) {
            if ((is_array($value) || is_object($value)) && !in_array($key, $nested, true)) {
                cms_add_error($errors, $path . '.' . $key, 'mora biti jednostavna vrijednost.');
            }
        }
    };
    if (!$object($cms)) return ['cms: mora biti objekat.'];
    $cms = (array)$cms;
    foreach (['contact', 'sections', 'settings'] as $key) {
        if (!$object($cms[$key] ?? null)) cms_add_error($errors, $key, 'mora biti objekat.');
        else $scalarFields((array)$cms[$key], $key);
    }
    foreach (['launchChecklist', 'categories', 'badges', 'products', 'comingSoon', 'parts', 'manuals', 'locations', 'blogs', 'faq'] as $key) {
        if (!$list($cms[$key] ?? null)) {
            cms_add_error($errors, $key, 'mora biti JSON lista sa uzastopnim indeksima.');
            continue;
        }
        foreach ($cms[$key] as $i => $item) {
            $path = $key . '.' . $i;
            if (!$object($item)) { cms_add_error($errors, $path, 'mora biti objekat.'); continue; }
            $item = (array)$item;
            $scalarFields($item, $path, $key === 'products' ? ['gallery', 'specs', 'attributes'] : ($key === 'categories' ? ['attributes'] : []));
            if ($key === 'products') {
                if (array_key_exists('gallery', $item)) {
                    if (!$list($item['gallery'])) cms_add_error($errors, $path . '.gallery', 'mora biti JSON lista slika.');
                    else foreach ($item['gallery'] as $j => $image) if (!is_string($image)) cms_add_error($errors, $path . '.gallery.' . $j, 'mora biti tekst.');
                }
                foreach (['specs', 'attributes'] as $map) {
                    if (!array_key_exists($map, $item)) continue;
                    // Empty PHP maps were exported as [] by earlier versions.
                    if (!$object($item[$map]) && $item[$map] !== []) {
                        cms_add_error($errors, $path . '.' . $map, 'mora biti mapa naziva i vrijednosti.');
                        continue;
                    }
                    foreach ((array)$item[$map] as $name => $value) {
                        if (!is_string($name) || (!is_string($value) && !is_int($value) && !is_float($value))) {
                            cms_add_error($errors, $path . '.' . $map, 'nazivi moraju biti tekst, a vrijednosti tekst ili broj.');
                        }
                    }
                }
            }
            if ($key === 'categories' && array_key_exists('attributes', $item)) {
                if (!$list($item['attributes'])) { cms_add_error($errors, $path . '.attributes', 'mora biti JSON lista atributa.'); continue; }
                foreach ($item['attributes'] as $j => $attribute) {
                    $attributePath = $path . '.attributes.' . $j;
                    if (!$object($attribute)) { cms_add_error($errors, $attributePath, 'mora biti objekat.'); continue; }
                    $attribute = (array)$attribute;
                    $scalarFields($attribute, $attributePath, ['values']);
                    if (!$list($attribute['values'] ?? null)) cms_add_error($errors, $attributePath . '.values', 'mora biti JSON lista.');
                    else foreach ($attribute['values'] as $k => $value) if (!is_string($value)) cms_add_error($errors, $attributePath . '.values.' . $k, 'mora biti tekst.');
                }
            }
        }
    }
    return $errors;
}

// Resolve only unambiguous legacy references, never rename entity identifiers.
// A save still requires exact spelling, matching public visibility and links.
function cms_canonical_references(array $cms): array
{
    $maps = [];
    foreach (['categories' => 'name', 'badges' => 'name', 'products' => 'id'] as $collection => $field) {
        $maps[$collection] = [];
        foreach (is_array($cms[$collection] ?? null) ? $cms[$collection] : [] as $item) {
            if (!is_array($item) || !is_string($item[$field] ?? null)) continue;
            $key = cms_normalized_key($item[$field]);
            $maps[$collection][$key] = array_key_exists($key, $maps[$collection]) ? null : $item[$field];
        }
    }
    $relations = [
        'products' => ['category' => 'categories', 'badge' => 'badges'],
        'categories' => ['badge' => 'badges'],
        'badges' => ['applyCategory' => 'categories'],
        'manuals' => ['relatedProductId' => 'products', 'category' => 'categories'],
    ];
    foreach ($relations as $collection => $fields) {
        foreach (is_array($cms[$collection] ?? null) ? $cms[$collection] : [] as $i => $item) {
            if (!is_array($item)) continue;
            foreach ($fields as $field => $target) {
                if (!is_string($item[$field] ?? null)) continue;
                $key = cms_normalized_key($item[$field]);
                if ($key === '' || ($target === 'badges' && $key === '-')) {
                    $cms[$collection][$i][$field] = $key;
                } elseif (isset($maps[$target][$key])) {
                    $cms[$collection][$i][$field] = $maps[$target][$key];
                }
            }
        }
    }
    return $cms;
}

function cms_reference_errors(array $cms): array
{
    $errors = [];
    $canonical = cms_canonical_references($cms);
    $targets = [
        'category' => array_column($cms['categories'], 'name'),
        'applyCategory' => array_column($cms['categories'], 'name'),
        'badge' => array_column($cms['badges'], 'name'),
        'relatedProductId' => array_column($cms['products'], 'id'),
    ];
    foreach (['products' => ['category', 'badge'], 'categories' => ['badge'], 'badges' => ['applyCategory'], 'manuals' => ['relatedProductId', 'category']] as $collection => $fields) {
        foreach ($cms[$collection] as $i => $item) {
            foreach ($fields as $field) {
                if (!isset($item[$field]) || !is_string($item[$field])) continue;
                $value = $item[$field];
                if ($value !== '' && !($field === 'badge' && $value === '-') && !in_array($value, $targets[$field], true)) {
                    cms_add_error($errors, $collection . '.' . $i . '.' . $field, 'mora tačno pokazivati na postojeći zapis.');
                } elseif ($value !== $canonical[$collection][$i][$field]) {
                    cms_add_error($errors, $collection . '.' . $i . '.' . $field, 'mora tačno odgovarati zapisu: ' . $canonical[$collection][$i][$field]);
                }
            }
        }
    }
    return $errors;
}

function cms_product_identity(string $id, string $epoch): string
{
    return hash_hmac('sha256', 'ones:cms-product:' . $id, $epoch);
}

function admin_cms_view(PDO $pdo): array
{
    $cms = get_cms($pdo);
    $epoch = auth_epoch($pdo);
    foreach ($cms['products'] as &$product) {
        if (is_array($product) && is_string($product['id'] ?? null)) $product['_identity'] = cms_product_identity($product['id'], $epoch);
    }
    unset($product);
    return $cms;
}

// Full-CMS saves need identity evidence to distinguish editing from creation,
// and explicit deletions to avoid treating a renamed ID as delete + add.
// Proofs are transport-only; public data and backups contain no such metadata.
function cms_check_product_identities(PDO $pdo, array $current, array $incoming, array $deletedIds): array
{
    $errors = [];
    if (!array_is_list($deletedIds)) throw new CmsValidationError(['deletedProductIds: mora biti lista.']);
    $existing = array_column($current['products'] ?? [], 'id');
    $incomingIds = array_column($incoming['products'], 'id');
    foreach ($deletedIds as $id) {
        if (!is_string($id) || !in_array($id, $existing, true) || in_array($id, $incomingIds, true)) {
            throw new CmsValidationError(['deletedProductIds: neispravan zahtjev za uklanjanje proizvoda.']);
        }
    }
    if (count($deletedIds) !== count(array_unique($deletedIds))) throw new CmsValidationError(['deletedProductIds: ponovljen ID.']);
    foreach ($existing as $id) {
        if (!in_array($id, $incomingIds, true) && !in_array($id, $deletedIds, true)) {
            cms_add_error($errors, 'products', 'ID postojećeg proizvoda se ne može preimenovati. Koristite naziv proizvoda ili izričito brisanje.');
        }
    }
    $epoch = auth_epoch($pdo);
    foreach ($incoming['products'] as $i => $product) {
        $proof = $product['_identity'] ?? null;
        if (in_array($product['id'], $existing, true)) {
            if (!is_string($proof) || !hash_equals(cms_product_identity($product['id'], $epoch), $proof)) {
                cms_add_error($errors, 'products.' . $i . '.id', 'ID proizvoda je nepromjenjiv. Osvježite CMS prije spremanja.');
            }
        } elseif (array_key_exists('_identity', $product)) {
            cms_add_error($errors, 'products.' . $i . '.id', 'postojeći proizvod ne može dobiti novi ID.');
        }
        unset($incoming['products'][$i]['_identity']);
    }
    if ($errors) throw new CmsValidationError($errors);
    return $incoming;
}
