import { initializeSchema } from "./_data.js";
import { allowMethods, json } from "./_shared.js";

export default async function handler(req, res) {
  if (!allowMethods(req, res, ["POST"])) return;

  const setupSecret = process.env.SETUP_SECRET;
  const providedSecret = req.headers["x-setup-secret"];

  if (!setupSecret || providedSecret !== setupSecret) {
    return json(res, 403, { error: "forbidden" });
  }

  try {
    await initializeSchema();
    return json(res, 200, { ok: true });
  } catch (error) {
    return json(res, 500, { error: "server_error", message: error.message });
  }
}
