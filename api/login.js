import { allowMethods, createToken, getPool, json, readBody, verifySecret } from "./_shared.js";

export default async function handler(req, res) {
  if (!allowMethods(req, res, ["POST"])) return;

  try {
    const { username, password, wordProtection, deviceIdentifier } = await readBody(req);
    const cleanUsername = String(username || "").trim();
    const pool = getPool();

    const found = await pool.query(
      "SELECT id, username, password_hash, word_protection_hash FROM students WHERE username = $1",
      [cleanUsername]
    );
    const student = found.rows[0];

    if (!student || !verifySecret(String(password || ""), student.password_hash)) {
      return json(res, 401, { error: "invalid_login" });
    }

    if (deviceIdentifier) {
      const device = await pool.query(
        "SELECT id FROM devices WHERE student_id = $1 AND device_identifier = $2 AND trusted = TRUE",
        [student.id, String(deviceIdentifier)]
      );

      if (!device.rows[0]) {
        if (!wordProtection) return json(res, 200, { requiresWordProtection: true });
        if (!verifySecret(String(wordProtection), student.word_protection_hash)) {
          return json(res, 401, { error: "invalid_login" });
        }

        await pool.query(
          `INSERT INTO devices (student_id, device_identifier, trusted)
           VALUES ($1, $2, TRUE)
           ON CONFLICT (student_id, device_identifier)
           DO UPDATE SET trusted = TRUE, last_used_at = NOW()`,
          [student.id, String(deviceIdentifier)]
        );
      } else {
        await pool.query("UPDATE devices SET last_used_at = NOW() WHERE id = $1", [device.rows[0].id]);
      }
    }

    return json(res, 200, {
      studentId: student.id,
      username: student.username,
      token: createToken(student),
      requiresWordProtection: false,
    });
  } catch (error) {
    return json(res, 500, { error: "server_error", message: error.message });
  }
}
