import { getLeaderboard } from "./_data.js";
import { allowMethods, json, verifyToken } from "./_shared.js";

function formatRow(row) {
  return {
    username: row.username,
    bestScore: Number(row.best_score),
    rankScore: Number(row.rank_score),
    mistakes: Number(row.mistakes),
    elapsedSeconds: Number(row.elapsed_seconds),
    livesRemaining: Number(row.lives_remaining),
    completed: Boolean(row.completed),
    place: Number(row.place),
  };
}

export default async function handler(req, res) {
  if (!allowMethods(req, res, ["GET"])) return;

  try {
    const token = verifyToken(req);
    const leaderboard = await getLeaderboard(token?.sub || null);

    return json(res, 200, {
      items: leaderboard.items.map(formatRow),
      currentUser: leaderboard.currentUser ? formatRow(leaderboard.currentUser) : null,
    });
  } catch (error) {
    return json(res, 500, { error: "server_error", message: error.message });
  }
}
