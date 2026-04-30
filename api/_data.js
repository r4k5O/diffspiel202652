import crypto from "node:crypto";
import { getDatabaseType, getLibsqlClient, getPool } from "./_shared.js";

function boolValue(value) {
  return value === true || value === 1;
}

function normalizeJson(value) {
  if (!value || typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function nowIso() {
  return new Date().toISOString();
}

function isUniqueError(error) {
  return error?.code === "23505" || String(error?.message || "").includes("UNIQUE constraint failed");
}

async function pgQuery(sql, params = []) {
  const { rows } = await getPool().query(sql, params);
  return rows;
}

async function sqliteExecute(sql, args = []) {
  const result = await getLibsqlClient().execute({ sql, args });
  return result.rows;
}

export async function initializeSchema() {
  if (getDatabaseType() === "postgres") {
    await getPool().query(`
      CREATE EXTENSION IF NOT EXISTS pgcrypto;

      CREATE TABLE IF NOT EXISTS students (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        word_protection_hash TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS devices (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
        device_identifier TEXT NOT NULL,
        trusted BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (student_id, device_identifier)
      );

      CREATE TABLE IF NOT EXISTS game_progress (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
        slot TEXT NOT NULL DEFAULT 'autosave',
        current_level INTEGER NOT NULL DEFAULT 0,
        progress_data JSONB NOT NULL DEFAULT '{}'::jsonb,
        score INTEGER NOT NULL DEFAULT 0,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (student_id, slot)
      );

      CREATE TABLE IF NOT EXISTS scores (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
        score INTEGER NOT NULL,
        level INTEGER NOT NULL DEFAULT 0,
        rank_score INTEGER NOT NULL DEFAULT 0,
        mistakes INTEGER NOT NULL DEFAULT 0,
        elapsed_seconds INTEGER NOT NULL DEFAULT 0,
        lives_remaining INTEGER NOT NULL DEFAULT 0,
        completed BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      ALTER TABLE scores ADD COLUMN IF NOT EXISTS rank_score INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE scores ADD COLUMN IF NOT EXISTS mistakes INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE scores ADD COLUMN IF NOT EXISTS elapsed_seconds INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE scores ADD COLUMN IF NOT EXISTS lives_remaining INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE scores ADD COLUMN IF NOT EXISTS completed BOOLEAN NOT NULL DEFAULT FALSE;

      CREATE INDEX IF NOT EXISTS scores_student_score_idx ON scores (student_id, score DESC);
      CREATE INDEX IF NOT EXISTS scores_student_rank_score_idx ON scores (student_id, rank_score DESC, score DESC);
      CREATE INDEX IF NOT EXISTS game_progress_student_slot_idx ON game_progress (student_id, slot);
    `);
    return;
  }

  const statements = [
    `CREATE TABLE IF NOT EXISTS students (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      word_protection_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS devices (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      device_identifier TEXT NOT NULL,
      trusted INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_used_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (student_id, device_identifier)
    )`,
    `CREATE TABLE IF NOT EXISTS game_progress (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      slot TEXT NOT NULL DEFAULT 'autosave',
      current_level INTEGER NOT NULL DEFAULT 0,
      progress_data TEXT NOT NULL DEFAULT '{}',
      score INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (student_id, slot)
    )`,
    `CREATE TABLE IF NOT EXISTS scores (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      score INTEGER NOT NULL,
      level INTEGER NOT NULL DEFAULT 0,
      rank_score INTEGER NOT NULL DEFAULT 0,
      mistakes INTEGER NOT NULL DEFAULT 0,
      elapsed_seconds INTEGER NOT NULL DEFAULT 0,
      lives_remaining INTEGER NOT NULL DEFAULT 0,
      completed INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    "CREATE INDEX IF NOT EXISTS scores_student_score_idx ON scores (student_id, score DESC)",
    "CREATE INDEX IF NOT EXISTS scores_student_rank_score_idx ON scores (student_id, rank_score DESC, score DESC)",
    "CREATE INDEX IF NOT EXISTS game_progress_student_slot_idx ON game_progress (student_id, slot)",
  ];

  for (const sql of statements) await sqliteExecute(sql);
  const optionalScoreColumns = [
    "ALTER TABLE scores ADD COLUMN rank_score INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE scores ADD COLUMN mistakes INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE scores ADD COLUMN elapsed_seconds INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE scores ADD COLUMN lives_remaining INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE scores ADD COLUMN completed INTEGER NOT NULL DEFAULT 0",
  ];
  for (const sql of optionalScoreColumns) {
    try {
      await sqliteExecute(sql);
    } catch {
      // SQLite/libSQL cannot add a column only if it does not exist, so existing columns are fine.
    }
  }
}

export async function getStudentById(id) {
  const rows =
    getDatabaseType() === "postgres"
      ? await pgQuery("SELECT id, username FROM students WHERE id = $1", [id])
      : await sqliteExecute("SELECT id, username FROM students WHERE id = ?", [id]);
  return rows[0] || null;
}

export async function findStudentByUsername(username) {
  const rows =
    getDatabaseType() === "postgres"
      ? await pgQuery("SELECT id, username, password_hash, word_protection_hash FROM students WHERE username = $1", [username])
      : await sqliteExecute("SELECT id, username, password_hash, word_protection_hash FROM students WHERE username = ?", [username]);
  return rows[0] || null;
}

export async function createStudent({ username, passwordHash, wordProtectionHash, deviceIdentifier }) {
  try {
    if (getDatabaseType() === "postgres") {
      const rows = await pgQuery(
        `INSERT INTO students (username, password_hash, word_protection_hash)
         VALUES ($1, $2, $3)
         RETURNING id, username`,
        [username, passwordHash, wordProtectionHash]
      );
      const student = rows[0];
      if (deviceIdentifier) await trustDevice(student.id, deviceIdentifier);
      await createInitialProgress(student.id);
      return student;
    }

    const student = { id: crypto.randomUUID(), username };
    await sqliteExecute(
      "INSERT INTO students (id, username, password_hash, word_protection_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      [student.id, username, passwordHash, wordProtectionHash, nowIso(), nowIso()]
    );
    if (deviceIdentifier) await trustDevice(student.id, deviceIdentifier);
    await createInitialProgress(student.id);
    return student;
  } catch (error) {
    if (isUniqueError(error)) error.isUnique = true;
    throw error;
  }
}

async function createInitialProgress(studentId) {
  if (getDatabaseType() === "postgres") {
    await pgQuery(
      `INSERT INTO game_progress (student_id, slot, progress_data, score)
       VALUES ($1, 'autosave', '{}'::jsonb, 0)
       ON CONFLICT (student_id, slot) DO NOTHING`,
      [studentId]
    );
    return;
  }
  await sqliteExecute(
    `INSERT INTO game_progress (id, student_id, slot, progress_data, score, updated_at)
     VALUES (?, ?, 'autosave', '{}', 0, ?)
     ON CONFLICT (student_id, slot) DO NOTHING`,
    [crypto.randomUUID(), studentId, nowIso()]
  );
}

export async function findTrustedDevice(studentId, deviceIdentifier) {
  const rows =
    getDatabaseType() === "postgres"
      ? await pgQuery("SELECT id FROM devices WHERE student_id = $1 AND device_identifier = $2 AND trusted = TRUE", [
          studentId,
          deviceIdentifier,
        ])
      : await sqliteExecute("SELECT id FROM devices WHERE student_id = ? AND device_identifier = ? AND trusted = 1", [
          studentId,
          deviceIdentifier,
        ]);
  return rows[0] || null;
}

export async function trustDevice(studentId, deviceIdentifier) {
  if (getDatabaseType() === "postgres") {
    await pgQuery(
      `INSERT INTO devices (student_id, device_identifier, trusted)
       VALUES ($1, $2, TRUE)
       ON CONFLICT (student_id, device_identifier)
       DO UPDATE SET trusted = TRUE, last_used_at = NOW()`,
      [studentId, deviceIdentifier]
    );
    return;
  }
  await sqliteExecute(
    `INSERT INTO devices (id, student_id, device_identifier, trusted, created_at, last_used_at)
     VALUES (?, ?, ?, 1, ?, ?)
     ON CONFLICT (student_id, device_identifier)
     DO UPDATE SET trusted = 1, last_used_at = excluded.last_used_at`,
    [crypto.randomUUID(), studentId, deviceIdentifier, nowIso(), nowIso()]
  );
}

export async function touchDevice(deviceId) {
  if (getDatabaseType() === "postgres") {
    await pgQuery("UPDATE devices SET last_used_at = NOW() WHERE id = $1", [deviceId]);
    return;
  }
  await sqliteExecute("UPDATE devices SET last_used_at = ? WHERE id = ?", [nowIso(), deviceId]);
}

export async function getAutosaveProgress(studentId) {
  const rows =
    getDatabaseType() === "postgres"
      ? await pgQuery(
          `SELECT slot, current_level, progress_data, score, updated_at
           FROM game_progress
           WHERE student_id = $1 AND slot = 'autosave'
           LIMIT 1`,
          [studentId]
        )
      : await sqliteExecute(
          `SELECT slot, current_level, progress_data, score, updated_at
           FROM game_progress
           WHERE student_id = ? AND slot = 'autosave'
           LIMIT 1`,
          [studentId]
        );
  const row = rows[0];
  if (!row) return null;
  return { ...row, progress_data: normalizeJson(row.progress_data) };
}

export async function saveProgress({ studentId, slot, currentLevel, progressData, score }) {
  if (getDatabaseType() === "postgres") {
    const rows = await pgQuery(
      `INSERT INTO game_progress (student_id, slot, current_level, progress_data, score, updated_at)
       VALUES ($1, $2, $3, $4::jsonb, $5, NOW())
       ON CONFLICT (student_id, slot)
       DO UPDATE SET
         current_level = EXCLUDED.current_level,
         progress_data = EXCLUDED.progress_data,
         score = EXCLUDED.score,
         updated_at = NOW()
       RETURNING slot, current_level, progress_data, score, updated_at`,
      [studentId, slot, currentLevel, JSON.stringify(progressData || {}), score]
    );
    return rows[0];
  }

  const savedAt = nowIso();
  const rows = await sqliteExecute(
    `INSERT INTO game_progress (id, student_id, slot, current_level, progress_data, score, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (student_id, slot)
     DO UPDATE SET
       current_level = excluded.current_level,
       progress_data = excluded.progress_data,
       score = excluded.score,
       updated_at = excluded.updated_at
     RETURNING slot, current_level, progress_data, score, updated_at`,
    [crypto.randomUUID(), studentId, slot, currentLevel, JSON.stringify(progressData || {}), score, savedAt]
  );
  const row = rows[0];
  return { ...row, progress_data: normalizeJson(row.progress_data) };
}

export async function getProgressUpdatedAt(studentId, slot) {
  const rows =
    getDatabaseType() === "postgres"
      ? await pgQuery("SELECT updated_at FROM game_progress WHERE student_id = $1 AND slot = $2", [studentId, slot])
      : await sqliteExecute("SELECT updated_at FROM game_progress WHERE student_id = ? AND slot = ?", [studentId, slot]);
  return rows[0]?.updated_at || null;
}

export async function addScore({
  studentId,
  score,
  level,
  rankScore,
  mistakes,
  elapsedSeconds,
  livesRemaining,
  completed,
}) {
  if (getDatabaseType() === "postgres") {
    const rows = await pgQuery(
      `INSERT INTO scores (student_id, score, level, rank_score, mistakes, elapsed_seconds, lives_remaining, completed)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, score, level, rank_score, mistakes, elapsed_seconds, lives_remaining, completed, created_at`,
      [studentId, score, level, rankScore, mistakes, elapsedSeconds, livesRemaining, completed]
    );
    return rows[0];
  }

  const rows = await sqliteExecute(
    `INSERT INTO scores (id, student_id, score, level, rank_score, mistakes, elapsed_seconds, lives_remaining, completed, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     RETURNING id, score, level, rank_score, mistakes, elapsed_seconds, lives_remaining, completed, created_at`,
    [
      crypto.randomUUID(),
      studentId,
      score,
      level,
      rankScore,
      mistakes,
      elapsedSeconds,
      livesRemaining,
      completed ? 1 : 0,
      nowIso(),
    ]
  );
  const row = rows[0];
  return { ...row, completed: boolValue(row.completed) };
}

export async function getLeaderboard(studentId = null) {
  if (getDatabaseType() === "postgres") {
    const rankingSql = `
      WITH best AS (
        SELECT DISTINCT ON (students.id)
          students.id AS student_id,
          students.username,
          scores.score AS best_score,
          GREATEST(scores.rank_score, scores.score) AS rank_score,
          scores.mistakes,
          scores.elapsed_seconds,
          scores.lives_remaining,
          scores.completed,
          scores.created_at
        FROM scores
        JOIN students ON students.id = scores.student_id
        ORDER BY students.id, GREATEST(scores.rank_score, scores.score) DESC, scores.score DESC, scores.created_at ASC
      ),
      ranked AS (
        SELECT *,
          ROW_NUMBER() OVER (
            ORDER BY rank_score DESC, best_score DESC, completed DESC, mistakes ASC, elapsed_seconds ASC
          ) AS place
        FROM best
      )`;
    const items = await pgQuery(`${rankingSql} SELECT * FROM ranked ORDER BY place ASC LIMIT 10`);
    const own = studentId
      ? await pgQuery(`${rankingSql} SELECT * FROM ranked WHERE student_id = $1 LIMIT 1`, [studentId])
      : [];
    return { items, currentUser: own[0] || null };
  }

  const rankingSql = `
    WITH ranked_scores AS (
      SELECT
        students.id AS student_id,
        students.username,
        scores.score AS best_score,
        MAX(scores.rank_score, scores.score) AS rank_score,
        scores.mistakes,
        scores.elapsed_seconds,
        scores.lives_remaining,
        scores.completed,
        scores.created_at,
        ROW_NUMBER() OVER (
          PARTITION BY students.id
          ORDER BY MAX(scores.rank_score, scores.score) DESC, scores.score DESC, scores.created_at ASC
        ) AS student_row
      FROM scores
      JOIN students ON students.id = scores.student_id
    ),
    best AS (
      SELECT * FROM ranked_scores WHERE student_row = 1
    ),
    ranked AS (
      SELECT *,
        ROW_NUMBER() OVER (
          ORDER BY rank_score DESC, best_score DESC, completed DESC, mistakes ASC, elapsed_seconds ASC
        ) AS place
      FROM best
    )`;
  const items = await sqliteExecute(`${rankingSql} SELECT * FROM ranked ORDER BY place ASC LIMIT 10`);
  const own = studentId ? await sqliteExecute(`${rankingSql} SELECT * FROM ranked WHERE student_id = ? LIMIT 1`, [studentId]) : [];
  return {
    items: items.map((row) => ({ ...row, completed: boolValue(row.completed) })),
    currentUser: own[0] ? { ...own[0], completed: boolValue(own[0].completed) } : null,
  };
}
