<?php
declare(strict_types=1);

final class LoginThrottled extends RuntimeException
{
    public int $retryAfter;
    public function __construct(int $retryAfter)
    {
        $this->retryAfter = max(1, $retryAfter);
        parent::__construct('Previše pokušaja prijave. Pokušajte ponovo za ' . $this->retryAfter . ' sekundi.');
    }
}

function initialize_login_limits(PDO $pdo): void
{
    $pdo->exec(database_driver($pdo) === 'mysql'
        ? 'CREATE TABLE IF NOT EXISTS login_limit_lock (id INT PRIMARY KEY) ENGINE=InnoDB'
        : 'CREATE TABLE IF NOT EXISTS login_limit_lock (id INTEGER PRIMARY KEY)');
    $pdo->exec(database_driver($pdo) === 'mysql'
        ? 'INSERT IGNORE INTO login_limit_lock (id) VALUES (1)'
        : 'INSERT OR IGNORE INTO login_limit_lock (id) VALUES (1)');
}

/** Reserve before password verification. Short DB lock covers every bucket together. */
function reserve_login_attempt(PDO $pdo, string $scope, string $ip, string $account, ?int $now = null): array
{
    if (!in_array($scope, ['admin', 'customer'], true) || $pdo->inTransaction()) {
        throw new LogicException('Invalid login reservation context');
    }
    $now = $now ?? time();
    $account = strtolower(trim($account));
    $buckets = [
        'system' => ['key' => hash('sha256', 'login-system'), 'max' => 120, 'window' => 60],
        'ip' => ['key' => hash('sha256', $ip), 'max' => 30, 'window' => 900],
        'pair' => ['key' => hash('sha256', $scope . '|' . $ip . '|' . $account), 'max' => 8, 'window' => 900],
        'account' => ['key' => hash('sha256', $scope . '|' . $account), 'max' => 0, 'window' => 900],
    ];
    $ticket = [];
    try {
        $pdo->beginTransaction();
        // InnoDB row lock / SQLite writer lock, released before any password hashing.
        $pdo->exec('UPDATE login_limit_lock SET id = id WHERE id = 1');
        $retryAfter = 0;
        foreach ($buckets as $kind => $bucket) {
            $stmt = $pdo->prepare('SELECT COUNT(*) AS attempts, MIN(created_at) AS first_at, MAX(created_at) AS last_at FROM request_limits WHERE action = :action AND identifier = :identifier AND created_at > :cutoff');
            $stmt->execute([':action' => 'login-' . $kind, ':identifier' => $bucket['key'], ':cutoff' => gmdate('c', $now - $bucket['window'])]);
            $state = $stmt->fetch(PDO::FETCH_ASSOC);
            $attempts = (int)$state['attempts'];
            if ($bucket['max'] && $attempts >= $bucket['max']) {
                $retryAfter = max($retryAfter, (int)strtotime($state['first_at']) + $bucket['window'] - $now);
            }
            if ($kind === 'account' && $attempts >= 5) {
                $delay = min(60, 2 ** min(6, $attempts - 4));
                $retryAfter = max($retryAfter, (int)strtotime($state['last_at']) + $delay - $now);
            }
        }
        if ($retryAfter > 0) throw new LoginThrottled($retryAfter);
        foreach ($buckets as $kind => $bucket) {
            $stmt = $pdo->prepare('INSERT INTO request_limits (action, identifier, created_at) VALUES (:action, :identifier, :created_at)');
            $stmt->execute([':action' => 'login-' . $kind, ':identifier' => $bucket['key'], ':created_at' => gmdate('c', $now)]);
            $ticket[$kind] = ['id' => (int)$pdo->lastInsertId(), 'key' => $bucket['key']];
        }
        $pdo->commit();
        return $ticket;
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $error;
    }
}

function require_login_attempt(PDO $pdo, string $scope, string $ip, string $account): array
{
    cleanup_request_limits($pdo);
    try {
        return reserve_login_attempt($pdo, $scope, $ip, $account);
    } catch (LoginThrottled $error) {
        header('Retry-After: ' . $error->retryAfter);
        respond(['ok' => false, 'code' => 'LOGIN_THROTTLED', 'retryAfter' => $error->retryAfter, 'message' => $error->getMessage()], 429);
    }
}

function complete_successful_login(PDO $pdo, array $ticket): void
{
    try {
        $pdo->beginTransaction();
        $pdo->exec('UPDATE login_limit_lock SET id = id WHERE id = 1');
        foreach ($ticket as $kind => $entry) {
            // Keep the system budget even on success: valid credentials cannot reset it.
            if ($kind === 'system') continue;
            // A valid credential resets prior account failures, never newer reservations.
            // Other users' IP failures must survive this successful login.
            $comparison = $kind === 'account' || $kind === 'pair' ? '<=' : '=';
            $stmt = $pdo->prepare('DELETE FROM request_limits WHERE action = :action AND identifier = :identifier AND id ' . $comparison . ' :id');
            $stmt->execute([':action' => 'login-' . $kind, ':identifier' => $entry['key'], ':id' => $entry['id']]);
        }
        $pdo->commit();
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $error;
    }
}
