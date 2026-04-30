import { getAutosaveProgress, getProgressUpdatedAt, saveProgress } from "./_data.js";
import { allowMethods, json, readBody, requireStudent } from "./_shared.js";

export default async function handler(req, res) {
  if (!allowMethods(req, res, ["GET", "PUT"])) return;

  try {
    const student = await requireStudent(req);
    if (!student) return json(res, 401, { error: "unauthorized" });

    if (req.method === "GET") {
      const row = await getAutosaveProgress(student.id);
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
      const existingUpdatedAt = await getProgressUpdatedAt(student.id, String(slot));
      const remoteTime = existingUpdatedAt ? new Date(existingUpdatedAt).getTime() : 0;
      const clientTime = new Date(updatedAt).getTime();
      if (remoteTime && clientTime && remoteTime > clientTime) {
        return json(res, 409, { error: "conflict", message: "Es existiert bereits ein neuerer Spielstand." });
      }
    }

    const row = await saveProgress({
      studentId: student.id,
      slot: String(slot),
      currentLevel: Number(currentLevel) || 0,
      progressData: progressData || {},
      score: Number(score) || 0,
    });
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
