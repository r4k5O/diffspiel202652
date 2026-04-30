import { findStudentByUsername, updateStudentSecret } from "./_data.js";
import { allowMethods, hashSecret, json, readBody, verifySecret } from "./_shared.js";

export default async function handler(req, res) {
  if (!allowMethods(req, res, ["POST"])) return;

  try {
    const { username, mode, knownSecret, newSecret } = await readBody(req);
    const cleanUsername = String(username || "").trim();
    const cleanMode = String(mode || "").trim();
    const cleanKnownSecret = String(knownSecret || "");
    const cleanNewSecret = String(newSecret || "");

    if (cleanUsername.length < 2) return json(res, 400, { error: "invalid_username" });
    if (!["password", "wordProtection"].includes(cleanMode)) return json(res, 400, { error: "invalid_mode" });
    if (cleanKnownSecret.length < 1) return json(res, 400, { error: "invalid_known_secret" });
    if (cleanNewSecret.length < 8) return json(res, 400, { error: "invalid_new_secret" });
    if (cleanKnownSecret === cleanNewSecret) return json(res, 400, { error: "new_secret_must_differ" });

    const student = await findStudentByUsername(cleanUsername);
    if (!student) return json(res, 401, { error: "invalid_recovery" });

    if (cleanMode === "password") {
      if (!verifySecret(cleanKnownSecret, student.word_protection_hash)) {
        return json(res, 401, { error: "invalid_recovery" });
      }
      await updateStudentSecret(student.id, "password_hash", hashSecret(cleanNewSecret));
      return json(res, 200, { ok: true, reset: "password" });
    }

    if (!verifySecret(cleanKnownSecret, student.password_hash)) {
      return json(res, 401, { error: "invalid_recovery" });
    }
    await updateStudentSecret(student.id, "word_protection_hash", hashSecret(cleanNewSecret));
    return json(res, 200, { ok: true, reset: "wordProtection" });
  } catch (error) {
    return json(res, 500, { error: "server_error", message: error.message });
  }
}
