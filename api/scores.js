import { allowMethods, getPool, json, readBody, requireStudent } from "./_shared.js";

export default async function handler(req, res) {
  if (!allowMethods(req, res, ["POST"])) return;

  try {
    const student = await requireStudent(req);
    if (!student) return json(res, 401, { error: "unauthorized" });

    const {
      score,
      level = 0,
      rankScore = score,
      mistakes = 0,
      elapsedSeconds = 0,
      livesRemaining = 0,
      completed = false,
    } = await readBody(req);
    const cleanScore = Number(score);
    const cleanLevel = Number(level) || 0;
    const cleanRankScore = Math.max(0, Math.round(Number(rankScore) || cleanScore || 0));
    const cleanMistakes = Math.max(0, Math.round(Number(mistakes) || 0));
    const cleanElapsedSeconds = Math.max(0, Math.round(Number(elapsedSeconds) || 0));
    const cleanLivesRemaining = Math.max(0, Math.round(Number(livesRemaining) || 0));

    if (!Number.isInteger(cleanScore) || cleanScore < 0) {
      return json(res, 400, { error: "invalid_score" });
    }

    const { rows } = await getPool().query(
      `INSERT INTO scores (student_id, score, level, rank_score, mistakes, elapsed_seconds, lives_remaining, completed)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, score, level, rank_score, mistakes, elapsed_seconds, lives_remaining, completed, created_at`,
      [
        student.id,
        cleanScore,
        cleanLevel,
        cleanRankScore,
        cleanMistakes,
        cleanElapsedSeconds,
        cleanLivesRemaining,
        Boolean(completed),
      ]
    );

    return json(res, 200, {
      id: rows[0].id,
      score: rows[0].score,
      level: rows[0].level,
      rankScore: rows[0].rank_score,
      mistakes: rows[0].mistakes,
      elapsedSeconds: rows[0].elapsed_seconds,
      livesRemaining: rows[0].lives_remaining,
      completed: rows[0].completed,
      createdAt: rows[0].created_at,
    });
  } catch (error) {
    return json(res, 500, { error: "server_error", message: error.message });
  }
}
