import { addScore } from "./_data.js";
import { allowMethods, json, readBody, requireStudent } from "./_shared.js";

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

    const row = await addScore({
      studentId: student.id,
      score: cleanScore,
      level: cleanLevel,
      rankScore: cleanRankScore,
      mistakes: cleanMistakes,
      elapsedSeconds: cleanElapsedSeconds,
      livesRemaining: cleanLivesRemaining,
      completed: Boolean(completed),
    });

    return json(res, 200, {
      id: row.id,
      score: row.score,
      level: row.level,
      rankScore: row.rank_score,
      mistakes: row.mistakes,
      elapsedSeconds: row.elapsed_seconds,
      livesRemaining: row.lives_remaining,
      completed: row.completed,
      createdAt: row.created_at,
    });
  } catch (error) {
    return json(res, 500, { error: "server_error", message: error.message });
  }
}
