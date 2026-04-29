# Host-SQL Setup fuer Vercel

Diese Version nutzt serverseitige Vercel API Functions unter `api/` und eine SQL-Datenbank ueber `DATABASE_URL`.

## 1. SQL-Datenbank verbinden

Auf Vercel eine SQL-Datenbank aus dem Marketplace verbinden, z. B. Neon, Supabase oder Turso/Postgres-kompatibel.

Die API liest diese Environment Variable:

```text
DATABASE_URL
```

Alternativ werden auch diese Namen akzeptiert:

```text
POSTGRES_URL
POSTGRES_PRISMA_URL
```

## 2. Schema anlegen

Das Schema liegt in:

```text
schema.sql
```

Es kann in der SQL-Konsole der verbundenen Datenbank ausgefuehrt werden.

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
