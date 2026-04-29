import { allowMethods, getPool, json, readBody, requireStudent } from "./_shared.js";

export default async function handler(req, res) {
  if (!allowMethods(req, res, ["POST"])) return;

  try {
    const student = await requireStudent(req);
    if (!student) return json(res, 401, { error: "unauthorized" });

    const { score, level = 0 } = await readBody(req);
    const cleanScore = Number(score);
    const cleanLevel = Number(level) || 0;

    if (!Number.isInteger(cleanScore) || cleanScore < 0) {
      return json(res, 400, { error: "invalid_score" });
    }

    const { rows } = await getPool().query(
      `INSERT INTO scores (student_id, score, level)
       VALUES ($1, $2, $3)
       RETURNING id, score, level, created_at`,
      [student.id, cleanScore, cleanLevel]
    );

    return json(res, 200, {
      id: rows[0].id,
      score: rows[0].score,
      level: rows[0].level,
      createdAt: rows[0].created_at,
    });
  } catch (error) {
    return json(res, 500, { error: "server_error", message: error.message });
  }
}
