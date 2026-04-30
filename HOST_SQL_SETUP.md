# Host-SQL Setup fuer Vercel und andere Hosts

Diese Version nutzt serverseitige API Functions unter `api/` und kann mit Postgres oder Turso/libSQL laufen.

Die App prueft zur Laufzeit:

- Ist `DATABASE_URL`, `POSTGRES_URL` oder `POSTGRES_PRISMA_URL` gesetzt, wird die persistente Server-Datenbank genutzt.
- Ist `TURSO_DATABASE_URL` plus `TURSO_AUTH_TOKEN` oder `LIBSQL_URL` plus `LIBSQL_AUTH_TOKEN` gesetzt, wird Turso/libSQL genutzt.
- Laeuft die App auf Vercel ohne Server-Datenbank, wird kein lokaler Browser-Fallback als Cloud-Speicher verwendet. Die UI zeigt dann einen Hinweis, dass eine persistente Datenbank verbunden werden muss.
- Laeuft die App ausserhalb von Vercel ohne Server-Datenbank, kann sie lokal im Browser speichern. Das ist praktisch zum Testen, aber nicht geraete- oder deploy-persistent.

## 1. Datenbank verbinden

Auf Vercel eine Datenbank aus dem Marketplace verbinden, z. B. Neon/Supabase fuer Postgres oder Turso fuer SQLite/libSQL.

Auf anderen Hosts funktioniert dieselbe App ebenfalls, wenn dort eine Postgres-kompatible Datenbank oder Turso/libSQL angebunden und die Connection URL als Environment Variable gesetzt wird.

Die API liest fuer Postgres diese Environment Variable:

```text
DATABASE_URL
```

Alternativ werden auch diese Namen akzeptiert:

```text
POSTGRES_URL
POSTGRES_PRISMA_URL
```

Fuer Turso/libSQL liest die API:

```text
TURSO_DATABASE_URL
TURSO_AUTH_TOKEN
```

Alternativ:

```text
LIBSQL_URL
LIBSQL_AUTH_TOKEN
```

## 2. Schema anlegen

Das Schema liegt in:

```text
schema.sql
```

Fuer Postgres kann `schema.sql` in der SQL-Konsole der verbundenen Datenbank ausgefuehrt werden.

Fuer Turso/libSQL sollte der geschuetzte Setup-Endpunkt genutzt werden, weil die App intern das passende SQLite/libSQL-Schema anlegt.

Alternativ gibt es den geschuetzten Endpunkt:

```http
POST /api/setup-db
X-Setup-Secret: <SETUP_SECRET>
```

Dafuer muss auf Vercel zusaetzlich `SETUP_SECRET` gesetzt werden.

## 3. Danach neu deployen

Nach dem Setzen von `DATABASE_URL` und dem Anlegen des Schemas die App erneut deployen.

Dann funktionieren:

- `/api/register`
- `/api/login`
- `/api/progress`
- `/api/scores`
- `/api/leaderboard`
