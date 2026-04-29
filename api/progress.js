import { allowMethods, getPool, json, readBody, requireStudent } from "./_shared.js";

export default async function handler(req, res) {
  if (!allowMethods(req, res, ["GET", "PUT"])) return;

  try {
    const student = await requireStudent(req);
    if (!student) return json(res, 401, { error: "unauthorized" });

    const pool = getPool();

    if (req.method === "GET") {
      const { rows } = await pool.query(
        `SELECT slot, current_level, progress_data, score, updated_at
         FROM game_progress
         WHERE student_id = $1 AND slot = 'autosave'
         LIMIT 1`,
        [student.id]
      );

      const row = rows[0];
      if (!row) {
        return json(res, 200, {
          slot: "autosave",
          currentLevel: 0,
          progressData: null,
          score: 0,
          updatedAt: null,
        });
      }

      return json(res, 200, {
        slot: row.slot,
        currentLevel: row.current_level,
        progressData: row.progress_data,
        score: row.score,
        updatedAt: row.updated_at,
      });
    }

    const { slot = "autosave", currentLevel = 0, progressData = {}, score = 0, updatedAt } = await readBody(req);

    if (updatedAt) {
      const existing = await pool.query(
        "SELECT updated_at FROM game_progress WHERE student_id = $1 AND slot = $2",
        [student.id, String(slot)]
      );
      const remoteTime = existing.rows[0]?.updated_at ? new Date(existing.rows[0].updated_at).getTime() : 0;
      const clientTime = new Date(updatedAt).getTime();
      if (remoteTime && clientTime && remoteTime > clientTime) {
        return json(res, 409, { error: "conflict", message: "Es existiert bereits ein neuerer Spielstand." });
      }
    }

    const saved = await pool.query(
      `INSERT INTO game_progress (student_id, slot, current_level, progress_data, score, updated_at)
       VALUES ($1, $2, $3, $4::jsonb, $5, NOW())
       ON CONFLICT (student_id, slot)
       DO UPDATE SET
         current_level = EXCLUDED.current_level,
         progress_data = EXCLUDED.progress_data,
         score = EXCLUDED.score,
         updated_at = NOW()
       RETURNING slot, current_level, progress_data, score, updated_at`,
      [student.id, String(slot), Number(currentLevel) || 0, JSON.stringify(progressData || {}), Number(score) || 0]
    );

    const row = saved.rows[0];
    return json(res, 200, {
      slot: row.slot,
      currentLevel: row.current_level,
      progressData: row.progress_data,
      score: row.score,
      updatedAt: row.updated_at,
    });
  } catch (error) {
    return json(res, 500, { error: "server_error", message: error.message });
  }
}
