import { allowMethods, getPool, json, verifyToken } from "./_shared.js";

function formatRow(row) {
  return {
    username: row.username,
    bestScore: Number(row.best_score),
    rankScore: Number(row.rank_score),
    mistakes: Number(row.mistakes),
    elapsedSeconds: Number(row.elapsed_seconds),
    livesRemaining: Number(row.lives_remaining),
    completed: row.completed,
    place: Number(row.place),
  };
}

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

export default async function handler(req, res) {
  if (!allowMethods(req, res, ["GET"])) return;

  try {
    const pool = getPool();
    const { rows } = await pool.query(
      `${rankingSql}
       SELECT *
       FROM ranked
       ORDER BY place ASC
       LIMIT 10`
    );

    let currentUser = null;
    const token = verifyToken(req);
    if (token?.sub) {
      const current = await pool.query(
        `${rankingSql}
         SELECT *
         FROM ranked
         WHERE student_id = $1
         LIMIT 1`,
        [token.sub]
      );
      if (current.rows[0]) currentUser = formatRow(current.rows[0]);
    }

    return json(res, 200, {
      items: rows.map(formatRow),
      currentUser,
    });
  } catch (error) {
    return json(res, 500, { error: "server_error", message: error.message });
  }
}
