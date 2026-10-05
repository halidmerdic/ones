<?php
declare(strict_types=1);

const ONES_SCHEMA_VERSION = 2;

final class DatabaseMigrationRequired extends RuntimeException
{
    public function __construct()
    {
        parent::__construct('Baza zahtijeva nadogradnju. Administrator treba završiti pripremu aplikacije.');
    }
}

function require_database_schema(PDO $pdo): void
{
    try {
        $version = $pdo->query('SELECT version FROM schema_version WHERE id = 1')->fetchColumn();
    } catch (PDOException $error) {
        throw new DatabaseMigrationRequired();
    }
    if ((int)$version !== ONES_SCHEMA_VERSION) throw new DatabaseMigrationRequired();
}
