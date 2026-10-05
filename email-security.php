<?php
declare(strict_types=1);

class EmailFlowError extends RuntimeException
{
    public int $status;
    public function __construct(string $message, int $status = 400) { parent::__construct($message); $this->status = $status; }
}

function initialize_email_security(PDO $pdo): void
{
    $suffix = database_driver($pdo) === 'mysql' ? ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin' : '';
    $pdo->exec('CREATE TABLE IF NOT EXISTS email_lock (id INTEGER PRIMARY KEY)' . $suffix);
    $pdo->exec((database_driver($pdo) === 'mysql' ? 'INSERT IGNORE' : 'INSERT OR IGNORE') . ' INTO email_lock (id) VALUES (1)');
    $pdo->exec('CREATE TABLE IF NOT EXISTS customer_email_state (user_id INTEGER PRIMARY KEY, email VARCHAR(190) NOT NULL, verified_at VARCHAR(64) NOT NULL)' . $suffix);
    // Tokens and pending identities are deliberately excluded from backups.
    $pdo->exec('CREATE TABLE IF NOT EXISTS email_challenges (token_hash VARCHAR(64) PRIMARY KEY, kind VARCHAR(16) NOT NULL, user_id INTEGER NOT NULL, email VARCHAR(190) NOT NULL, old_email VARCHAR(190) NOT NULL, name VARCHAR(120) NOT NULL, auth_version INTEGER NOT NULL, auth_epoch VARCHAR(64) NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, sent INTEGER NOT NULL DEFAULT 0)' . $suffix);
}

function email_transaction(PDO $pdo): void
{
    $pdo->beginTransaction();
    $pdo->exec('UPDATE email_lock SET id = id WHERE id = 1');
}

function email_is_verified(PDO $pdo, int $id, string $email): bool
{
    $stmt = $pdo->prepare('SELECT email FROM customer_email_state WHERE user_id = :id');
    $stmt->execute([':id' => $id]);
    $verified = $stmt->fetchColumn();
    return is_string($verified) && hash_equals($verified, $email);
}

function customer_email_details(PDO $pdo, int $id, string $email): array
{
    $pending = $pdo->prepare('SELECT c.email FROM email_challenges c JOIN users u ON u.id = c.user_id JOIN auth_state a ON a.id = 1 WHERE c.user_id = :id AND c.kind = "change" AND c.sent = 1 AND c.expires_at > :now AND c.auth_version = u.auth_version AND c.old_email = u.email AND c.auth_epoch = a.epoch ORDER BY c.created_at DESC LIMIT 1');
    $pending->execute([':id' => $id, ':now' => time()]);
    return ['emailVerified' => email_is_verified($pdo, $id, $email), 'pendingEmail' => $pending->fetchColumn() ?: ''];
}

function email_delivery_config(): array
{
    global $config, $isLocalHost;
    $mail = $config['mail'] ?? [];
    $host = (string)($mail['host'] ?? '');
    $url = rtrim((string)($mail['public_url'] ?? ''), '/');
    $parts = parse_url($url);
    $localSmtp = $isLocalHost && in_array($host, ['127.0.0.1', 'localhost', '::1'], true);
    $localUrl = $isLocalHost && in_array($parts['host'] ?? '', ['127.0.0.1', 'localhost', '::1'], true);
    $security = (string)($mail['encryption'] ?? 'tls');
    if (!is_array($parts) || !isset($parts['host']) || isset($parts['user']) || isset($parts['pass'])
        || isset($parts['query']) || isset($parts['fragment'])
        || (($parts['scheme'] ?? '') !== 'https' && !($localUrl && ($parts['scheme'] ?? '') === 'http'))
        || !preg_match('/\A[a-zA-Z0-9.:-]+\z/', $host)
        || !filter_var($mail['from_address'] ?? '', FILTER_VALIDATE_EMAIL)
        || !in_array($security, $localSmtp ? ['tls', 'ssl', 'none'] : ['tls', 'ssl'], true)
        || (int)($mail['port'] ?? 0) < 1 || (int)$mail['port'] > 65535
        || (!$localSmtp && (empty($mail['username']) || empty($mail['password'])))) {
        throw new EmailFlowError('Slanje potvrde emaila trenutno nije dostupno. Obratite se oneS timu ili pokušajte kasnije.', 503);
    }
    $mail['public_url'] = $url;
    $mail['encryption'] = $security;
    return $mail;
}

function deliver_identity_email(array $settings, string $recipient, string $subject, string $text): void
{
    require_once __DIR__ . '/vendor/phpmailer/src/Exception.php';
    require_once __DIR__ . '/vendor/phpmailer/src/SMTP.php';
    require_once __DIR__ . '/vendor/phpmailer/src/PHPMailer.php';
    try {
        $mailer = new PHPMailer\PHPMailer\PHPMailer(true);
        $mailer->isSMTP();
        $mailer->Host = $settings['host'];
        $mailer->Port = (int)$settings['port'];
        $mailer->SMTPAuth = !empty($settings['username']);
        $mailer->Username = (string)($settings['username'] ?? '');
        $mailer->Password = (string)($settings['password'] ?? '');
        $mailer->SMTPSecure = $settings['encryption'] === 'none' ? '' : $settings['encryption'];
        $mailer->SMTPAutoTLS = $settings['encryption'] !== 'none';
        $mailer->SMTPOptions = ['ssl' => ['verify_peer' => true, 'verify_peer_name' => true, 'allow_self_signed' => false]];
        $mailer->Timeout = 10;
        $mailer->getSMTPInstance()->Timelimit = 10;
        $mailer->CharSet = 'UTF-8';
        $mailer->Encoding = 'base64';
        $mailer->XMailer = '';
        $mailer->setFrom($settings['from_address'], 'oneS');
        $mailer->addAddress($recipient);
        $mailer->Subject = $subject;
        $mailer->Body = $text;
        $mailer->send();
    } catch (Throwable $error) {
        // Never disclose SMTP credentials, commands or verification links.
        throw new EmailFlowError('Poruka za potvrdu nije poslana. Pokušajte ponovo kasnije.', 503);
    }
}

function reserve_email_budget(PDO $pdo, string $email, string $ip, int $now): void
{
    $buckets = [['email-send-ip', hash('sha256', $ip), 6, 3600], ['email-send-address', hash('sha256', $email), 3, 3600], ['email-send-wait', hash('sha256', $email), 1, 60], ['email-send-global', 'all', 60, 3600]];
    foreach ($buckets as [$action, $id, $max, $window]) {
        $stmt = $pdo->prepare('SELECT COUNT(*) FROM request_limits WHERE action = :action AND identifier = :id AND created_at > :cutoff');
        $stmt->execute([':action' => $action, ':id' => $id, ':cutoff' => gmdate('c', $now - $window)]);
        if ((int)$stmt->fetchColumn() >= $max) throw new EmailFlowError('Previše zahtjeva za email potvrdu. Sačekajte najmanje minutu; najviše tri poruke po adresi u satu.', 429);
    }
    foreach ($buckets as [$action, $id]) {
        $stmt = $pdo->prepare('INSERT INTO request_limits (action, identifier, created_at) VALUES (:action, :id, :now)');
        $stmt->execute([':action' => $action, ':id' => $id, ':now' => gmdate('c', $now)]);
    }
}

function request_email_confirmation(PDO $pdo, string $kind, string $email, string $name, ?array $user, string $ip, string $epoch): void
{
    $settings = email_delivery_config();
    if (!in_array($kind, ['signup', 'verify', 'change'], true)) throw new LogicException('Invalid email confirmation kind');
    $token = bin2hex(random_bytes(32));
    $hash = hash('sha256', $token);
    $now = time();
    try {
        email_transaction($pdo);
        if (!hash_equals(auth_epoch($pdo), $epoch)) throw new EmailFlowError('Sesija je istekla. Osvježite stranicu.', 401);
        $pdo->prepare('DELETE FROM email_challenges WHERE expires_at <= :now')->execute([':now' => $now]);
        reserve_email_budget($pdo, $email, $ip, $now);
        if ($kind === 'signup') {
            $existing = $pdo->prepare('SELECT id FROM users WHERE email = :email');
            $existing->execute([':email' => $email]);
            if ($existing->fetchColumn()) { $pdo->commit(); return; }
        }
        $stmt = $pdo->prepare('INSERT INTO email_challenges (token_hash, kind, user_id, email, old_email, name, auth_version, auth_epoch, created_at, expires_at) VALUES (:hash, :kind, :id, :email, :old, :name, :version, :epoch, :now, :expires)');
        $stmt->execute([':hash' => $hash, ':kind' => $kind, ':id' => (int)($user['id'] ?? 0), ':email' => $email, ':old' => (string)($user['email'] ?? ''), ':name' => $name, ':version' => (int)($user['auth_version'] ?? 0), ':epoch' => $epoch, ':now' => $now, ':expires' => $now + 1800]);
        $pdo->commit();
        if ($kind === 'change') {
            deliver_identity_email($settings, $user['email'], 'oneS: zatražena promjena email adrese', "Zatražena je promjena email adrese vašeg oneS profila na " . $email . ". Stara adresa vrijedi dok nova ne bude potvrđena.\n\nAko ovo niste vi zatražili, prijavite se na " . $settings['public_url'] . "/profile.html i promijenite lozinku. Time se poništava i ova nepotvrđena promjena.");
        }
        $link = $settings['public_url'] . '/verify.html#token=' . $token . '&kind=' . $kind;
        deliver_identity_email($settings, $email, 'oneS: potvrdite email adresu', "Otvorite link i potvrdite adresu za svoj oneS profil:\n\n" . $link . "\n\nLink vrijedi 30 minuta i može se iskoristiti jednom. " . ($kind === 'signup' ? 'Lozinku birate tek na stranici za potvrdu.' : 'Potrebna je prijava na profil koji je zatražio potvrdu.') . "\nAko niste zatražili poruku, zanemarite je. Profil se neće aktivirati niti adresa promijeniti samo otvaranjem linka.");
        // Publish only after SMTP accepted all required messages. A failed send
        // cannot activate an identity, and does not refund the anti-abuse budget.
        $pdo->prepare('UPDATE email_challenges SET sent = 1 WHERE token_hash = :hash')->execute([':hash' => $hash]);
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        $pdo->prepare('DELETE FROM email_challenges WHERE token_hash = :hash')->execute([':hash' => $hash]);
        throw $error;
    }
}

function confirm_customer_email(PDO $pdo, string $token, string $password, ?int $signedInUser): array
{
    if (!preg_match('/\A[a-f0-9]{64}\z/', $token)) throw new EmailFlowError('Link za potvrdu nije ispravan ili je istekao.');
    try {
        email_transaction($pdo);
        $stmt = $pdo->prepare('SELECT * FROM email_challenges WHERE token_hash = :hash AND sent = 1');
        $stmt->execute([':hash' => hash('sha256', $token)]);
        $challenge = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$challenge || (int)$challenge['expires_at'] <= time() || !hash_equals(auth_epoch($pdo), $challenge['auth_epoch'])) throw new EmailFlowError('Link za potvrdu nije ispravan ili je istekao.');
        if ($challenge['kind'] === 'signup') {
            $error = password_validation_error($password);
            if ($error) throw new EmailFlowError($error);
            // The password is chosen by the mailbox owner, never by the sender
            // of a registration request (prevents account pre-hijacking).
            $insert = $pdo->prepare('INSERT INTO users (name, email, password_hash, role, created_at, privacy_accepted_at) VALUES (:name, :email, :hash, "customer", :now, :consent)');
            $insert->execute([':name' => $challenge['name'], ':email' => $challenge['email'], ':hash' => hash_password($password), ':now' => gmdate('c'), ':consent' => gmdate('c', (int)$challenge['created_at'])]);
            $id = (int)$pdo->lastInsertId();
            $user = ['id' => $id, 'name' => $challenge['name'], 'email' => $challenge['email'], 'auth_version' => 0];
        } else {
            if (!$signedInUser || $signedInUser !== (int)$challenge['user_id']) throw new EmailFlowError('Prijavite se na profil koji je zatražio potvrdu, pa ponovo kliknite Potvrdi.', 401);
            $sql = 'SELECT id, name, email, auth_version FROM users WHERE id = :id AND role = "customer"';
            if (database_driver($pdo) === 'mysql') $sql .= ' FOR UPDATE';
            $stmt = $pdo->prepare($sql);
            $stmt->execute([':id' => $signedInUser]);
            $user = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$user || !hash_equals($challenge['old_email'], $user['email']) || (int)$user['auth_version'] !== (int)$challenge['auth_version']) throw new EmailFlowError('Podaci profila su promijenjeni. Zatražite novu potvrdu.');
            $id = (int)$user['id'];
            $update = $pdo->prepare('UPDATE users SET email = :email, auth_version = auth_version + 1 WHERE id = :id');
            $update->execute([':email' => $challenge['email'], ':id' => $id]);
            $user['email'] = $challenge['email'];
            $user['auth_version'] = (int)$user['auth_version'] + 1;
        }
        $pdo->prepare('DELETE FROM customer_email_state WHERE user_id = :id')->execute([':id' => $id]);
        $stmt = $pdo->prepare('INSERT INTO customer_email_state (user_id, email, verified_at) VALUES (:id, :email, :now)');
        $stmt->execute([':id' => $id, ':email' => $challenge['email'], ':now' => gmdate('c')]);
        $pdo->prepare('DELETE FROM email_challenges WHERE email = :email OR user_id = :id')->execute([':email' => $challenge['email'], ':id' => $id]);
        $pdo->commit();
        return $user;
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        if ($error instanceof PDOException && is_unique_constraint_violation($error)) throw new EmailFlowError('Ova adresa već pripada profilu. Prijavite se ili zatražite novu potvrdu.', 409);
        throw $error;
    }
}
