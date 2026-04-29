import { allowMethods, getPool, json } from "./_shared.js";

export default async function handler(req, res) {
  if (!allowMethods(req, res, ["GET"])) return;

  try {
    const { rows } = await getPool().query(
      `SELECT students.username, MAX(scores.score) AS best_score
       FROM scores
       JOIN students ON students.id = scores.student_id
       GROUP BY students.id, students.username
       ORDER BY best_score DESC
       LIMIT 50`
    );

    return json(
      res,
      200,
      rows.map((row) => ({
        username: row.username,
        bestScore: Number(row.best_score),
      }))
    );
  } catch (error) {
    return json(res, 500, { error: "server_error", message: error.message });
  }
}
