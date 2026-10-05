<?php
declare(strict_types=1);

// Catalogue first, then email/user/cart locks. Shared readers prevent a product
// from disappearing between validation and a cart/favorite/order write.
function lock_catalog(PDO $pdo, bool $exclusive = false): array
{
    if (!$pdo->inTransaction()) throw new LogicException('Catalogue lock requires a transaction.');
    $mysql = database_driver($pdo) === 'mysql';
    if (!$mysql) $pdo->exec('UPDATE cms_store SET revision = revision WHERE 0');
    $sql = 'SELECT value, revision FROM cms_store WHERE ' . quote_identifier($pdo, 'key') . ' = "cms"';
    if ($mysql) $sql .= $exclusive ? ' FOR UPDATE' : ' LOCK IN SHARE MODE';
    $row = $pdo->query($sql)->fetch(PDO::FETCH_ASSOC);
    if (!$row) throw new RuntimeException('CMS zapis nije pronađen u bazi.');
    return $row;
}

function cms_named_identity(string $collection, string $name, string $epoch): string
{
    return hash_hmac('sha256', 'ones:cms-' . $collection . ':' . $name, $epoch);
}

function admin_cms_response(PDO $pdo): array
{
    $owns = !$pdo->inTransaction();
    try {
        if ($owns) $pdo->beginTransaction();
        $row = lock_catalog($pdo);
        $result = ['cms'=>admin_cms_view($pdo), 'revision'=>(int)$row['revision']];
        if ($owns) $pdo->commit();
        return $result;
    } catch (Throwable $error) {
        if ($owns && $pdo->inTransaction()) $pdo->rollBack();
        throw $error;
    }
}

function cms_strip_identities(array $cms): array
{
    foreach (['products','categories','badges'] as $collection) {
        foreach ($cms[$collection] as &$item) unset($item['_identity']);
        unset($item);
    }
    return $cms;
}

function cms_reference_changes_errors($changes, bool $wire = false): array
{
    if ($wire ? !($changes instanceof stdClass) : !is_array($changes)) return ['referenceChanges: mora biti objekat.'];
    $changes = (array)$changes;
    if (array_diff(array_keys($changes), ['categories','badges'])) return ['referenceChanges: nepoznato polje.'];
    foreach (['categories','badges'] as $key) {
        $list = $changes[$key] ?? [];
        if (!is_array($list) || !array_is_list($list)) return ['referenceChanges.' . $key . ': mora biti lista.'];
        foreach ($list as $item) {
            if ($key === 'badges') {
                if (!is_string($item)) return ['referenceChanges.badges: očekivan naziv obrisane oznake.'];
            } else {
                if ($wire ? !($item instanceof stdClass) : !is_array($item)) return ['referenceChanges.categories: očekivan objekat.'];
                $item = (array)$item;
                if (array_diff(array_keys($item), ['from','to']) || !is_string($item['from'] ?? null) || !array_key_exists('to',$item) || ($item['to'] !== null && !is_string($item['to']))) {
                    return ['referenceChanges.categories: potrebni su from i zamjenski to (ili null za praznu kategoriju).'];
                }
            }
        }
    }
    return [];
}

// Bind mutable names to the previously loaded entity, not its list position.
// Reusing another old name in the same save is ambiguous and is rejected.
function cms_named_changes(PDO $pdo, array $current, array $incoming, string $collection): array
{
    $epoch = auth_epoch($pdo); $known = []; $seen = []; $moves = [];
    $oldNames = array_column($current[$collection], 'name');
    foreach ($oldNames as $name) $known[cms_named_identity($collection, $name, $epoch)] = $name;
    foreach ($incoming[$collection] as $i => $item) {
        $name = $item['name'] ?? null; $proof = $item['_identity'] ?? null;
        if (!is_string($name)) throw new CmsValidationError([$collection . '.' . $i . '.name: očekivan naziv.']);
        if (!array_key_exists('_identity', $item)) {
            if (in_array($name, $oldNames, true)) throw new CmsValidationError([$collection . '.' . $i . ': osvježite CMS prije spremanja.']);
            continue;
        }
        if (!is_string($proof) || !isset($known[$proof]) || isset($seen[$proof])) throw new CmsValidationError([$collection . '.' . $i . ': neispravan ili ponovljen identitet zapisa.']);
        $seen[$proof] = true; $from = $known[$proof];
        if ($name !== $from) {
            if (in_array($name, $oldNames, true) || ($collection === 'badges' && ($from === '-' || $name === '-'))) {
                throw new CmsValidationError([$collection . '.' . $i . '.name: naziv je zauzet ili rezervisan. Koristite slobodan naziv.']);
            }
            $moves[] = ['from'=>$from, 'to'=>$name];
        }
    }
    $removed = [];
    foreach ($known as $proof => $name) if (!isset($seen[$proof])) $removed[] = $name;
    return [$moves, $removed];
}

function cms_resolve_relations(PDO $pdo, array $current, array $incoming, array $deletedIds, array $changes): array
{
    $errors = cms_reference_changes_errors($changes);
    if ($errors) throw new CmsValidationError($errors);
    [$categoryMoves, $removedCategories] = cms_named_changes($pdo,$current,$incoming,'categories');
    [$badgeMoves, $removedBadges] = cms_named_changes($pdo,$current,$incoming,'badges');
    $categoryTargets = array_column($incoming['categories'],'name');
    $declaredCategories = [];
    foreach ($changes['categories'] ?? [] as $change) {
        if (!in_array($change['from'],$removedCategories,true) || in_array($change['from'],$declaredCategories,true)
            || ($change['to'] !== null && !in_array($change['to'],$categoryTargets,true))) {
            throw new CmsValidationError(['referenceChanges.categories: neispravna ili ponovljena zamjena kategorije.']);
        }
        $declaredCategories[] = $change['from']; $categoryMoves[] = $change;
    }
    $declaredBadges = $changes['badges'] ?? [];
    if (count($declaredBadges) !== count(array_unique($declaredBadges)) || in_array('-',$removedBadges,true)) throw new CmsValidationError(['referenceChanges.badges: ponovljena ili rezervisana oznaka.']);
    if (array_diff($removedCategories,$declaredCategories) || array_diff($removedBadges,$declaredBadges) || array_diff($declaredBadges,$removedBadges)) {
        throw new CmsValidationError(['referenceChanges: brisanje kategorije ili oznake mora biti izričito navedeno.']);
    }
    // Delete linked manual entries, never detach them into public general files.
    $incoming['manuals'] = array_values(array_filter($incoming['manuals'], static fn($m) => !in_array($m['relatedProductId'] ?? '',$deletedIds,true)));
    foreach ($removedBadges as $name) $badgeMoves[] = ['from'=>$name,'to'=>'-'];
    foreach (['products'=>['category'],'manuals'=>['category'],'badges'=>['applyCategory']] as $collection=>$fields) {
        foreach ($incoming[$collection] as &$item) foreach ($fields as $field) foreach ($categoryMoves as $move) {
            if (($item[$field] ?? '') !== $move['from']) continue;
            if ($move['to'] === null) throw new CmsValidationError(['referenceChanges.categories: kategorija ima vezani sadržaj. Odaberite zamjensku kategoriju.']);
            $item[$field] = $move['to']; break;
        }
        unset($item);
    }
    foreach (['products','categories'] as $collection) {
        foreach ($incoming[$collection] as &$item) foreach ($badgeMoves as $move) {
            if (($item['badge'] ?? '') !== $move['from']) continue;
            $item['badge'] = $move['to'];
            if ($move['to'] === '-') $item['badgeUntil'] = '';
            break;
        }
        unset($item);
    }
    return cms_strip_identities($incoming);
}

function cms_remove_product_dependencies(PDO $pdo, array $deletedIds): void
{
    if (!$deletedIds) return;
    $marks = implode(',',array_fill(0,count($deletedIds),'?'));
    $stmt = $pdo->prepare('SELECT DISTINCT c.id,c.user_id FROM carts c JOIN cart_items i ON i.cart_id=c.id WHERE c.status="active" AND i.product_id IN (' . $marks . ') ORDER BY c.user_id,c.id');
    $stmt->execute($deletedIds); $carts = $stmt->fetchAll(PDO::FETCH_ASSOC);
    foreach ($carts as $cart) {
        lock_cart_owner($pdo,(int)$cart['user_id']);
        lock_expected_cart($pdo,(int)$cart['user_id'],(int)$cart['id'],null);
        $delete = $pdo->prepare('DELETE FROM cart_items WHERE cart_id=? AND product_id IN (' . $marks . ')');
        $delete->execute([(int)$cart['id'],...$deletedIds]);
        if ($delete->rowCount()) bump_cart_revision($pdo,(int)$cart['id']);
    }
    $pdo->prepare('DELETE FROM product_favorites WHERE product_id IN (' . $marks . ')')->execute($deletedIds);
    // Submitted carts and immutable order snapshots are historical records.
}

function toggle_favorite(PDO $pdo, int $userId, string $productId): array
{
    return cart_transaction($pdo,$userId,static function () use ($pdo,$userId,$productId): array {
        if (!isset(products_by_id($pdo)[$productId])) throw new CartConflict('Proizvod više nije dostupan. Osvježite ponudu.');
        $stmt=$pdo->prepare('SELECT id FROM product_favorites WHERE user_id=? AND product_id=?');$stmt->execute([$userId,$productId]);
        $id=$stmt->fetchColumn();
        if ($id) $pdo->prepare('DELETE FROM product_favorites WHERE id=? AND user_id=?')->execute([$id,$userId]);
        else $pdo->prepare('INSERT INTO product_favorites (user_id,product_id,created_at) VALUES (?,?,?)')->execute([$userId,$productId,date('c')]);
        return ['favorited'=>!$id,'favorites'=>favorites_payload($pdo,$userId)];
    });
}
