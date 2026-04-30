import { allowMethods, getPool, json } from "./_shared.js";

export default async function handler(req, res) {
  if (!allowMethods(req, res, ["GET"])) return;

  try {
    const { rows } = await getPool().query(
      `WITH best AS (
         SELECT DISTINCT ON (students.id)
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
       )
       SELECT *
       FROM best
       ORDER BY rank_score DESC, best_score DESC, completed DESC, mistakes ASC, elapsed_seconds ASC
       LIMIT 50`
    );

    return json(
      res,
      200,
      rows.map((row) => ({
        username: row.username,
        bestScore: Number(row.best_score),
        rankScore: Number(row.rank_score),
        mistakes: Number(row.mistakes),
        elapsedSeconds: Number(row.elapsed_seconds),
        livesRemaining: Number(row.lives_remaining),
        completed: row.completed,
      }))
    );
  } catch (error) {
    return json(res, 500, { error: "server_error", message: error.message });
  }
}
