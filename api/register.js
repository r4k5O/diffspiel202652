import { allowMethods, createToken, getPool, hashSecret, json, readBody } from "./_shared.js";

export default async function handler(req, res) {
  if (!allowMethods(req, res, ["POST"])) return;

  try {
    const { username, password, wordProtection, deviceIdentifier } = await readBody(req);
    const cleanUsername = String(username || "").trim();

    if (cleanUsername.length < 2) return json(res, 400, { error: "invalid_username" });
    if (String(password || "").length < 8) return json(res, 400, { error: "invalid_password" });
    if (!String(wordProtection || "").trim()) return json(res, 400, { error: "invalid_word_protection" });
    if (password === wordProtection) return json(res, 400, { error: "word_protection_must_differ" });

    const pool = getPool();
    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      const created = await client.query(
        `INSERT INTO students (username, password_hash, word_protection_hash)
         VALUES ($1, $2, $3)
         RETURNING id, username`,
        [cleanUsername, hashSecret(password), hashSecret(wordProtection)]
      );
      const student = created.rows[0];

      if (deviceIdentifier) {
        await client.query(
          `INSERT INTO devices (student_id, device_identifier, trusted)
           VALUES ($1, $2, TRUE)
           ON CONFLICT (student_id, device_identifier)
           DO UPDATE SET trusted = TRUE, last_used_at = NOW()`,
          [student.id, String(deviceIdentifier)]
        );
      }

      await client.query(
        `INSERT INTO game_progress (student_id, slot, progress_data, score)
         VALUES ($1, 'autosave', '{}'::jsonb, 0)
         ON CONFLICT (student_id, slot) DO NOTHING`,
        [student.id]
      );
      await client.query("COMMIT");

      return json(res, 200, { studentId: student.id, username: student.username, token: createToken(student) });
    } catch (error) {
      await client.query("ROLLBACK");
      if (error.code === "23505") return json(res, 409, { error: "username_exists" });
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    return json(res, 500, { error: "server_error", message: error.message });
  }
}
