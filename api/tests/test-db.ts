// Base des tests : serveur PGlite lancé par le globalSetup. Les tests vident les tables : jamais Neon.
// Port à part de ceux de Dépenses partagées (5434, 5435), pour pouvoir lancer les deux suites en même temps.
export const TEST_DB_PORT = 5436;
export const TEST_DATABASE_URL = `postgresql://postgres:postgres@127.0.0.1:${TEST_DB_PORT}/postgres?sslmode=disable`;
