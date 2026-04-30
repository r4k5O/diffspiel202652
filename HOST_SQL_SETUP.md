# Host-SQL Setup fuer Vercel und andere Hosts

Diese Version nutzt serverseitige API Functions unter `api/` und eine SQL-Datenbank ueber `DATABASE_URL`.

Die App prueft zur Laufzeit:

- Ist `DATABASE_URL`, `POSTGRES_URL` oder `POSTGRES_PRISMA_URL` gesetzt, wird die persistente Server-Datenbank genutzt.
- Laeuft die App auf Vercel ohne Server-Datenbank, wird kein lokaler Browser-Fallback als Cloud-Speicher verwendet. Die UI zeigt dann einen Hinweis, dass eine persistente Datenbank verbunden werden muss.
- Laeuft die App ausserhalb von Vercel ohne Server-Datenbank, kann sie lokal im Browser speichern. Das ist praktisch zum Testen, aber nicht geraete- oder deploy-persistent.

## 1. SQL-Datenbank verbinden

Auf Vercel eine SQL-Datenbank aus dem Marketplace verbinden, z. B. Neon, Supabase oder eine andere Postgres-kompatible Integration.

Auf anderen Hosts funktioniert dieselbe App ebenfalls, wenn dort eine Postgres-kompatible Datenbank angebunden und die Connection URL als Environment Variable gesetzt wird.

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
