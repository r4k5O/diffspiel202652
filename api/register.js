import { createStudent } from "./_data.js";
import { allowMethods, createToken, hashSecret, json, readBody } from "./_shared.js";

export default async function handler(req, res) {
  if (!allowMethods(req, res, ["POST"])) return;

  try {
    const { username, password, wordProtection, deviceIdentifier } = await readBody(req);
    const cleanUsername = String(username || "").trim();

    if (cleanUsername.length < 2) return json(res, 400, { error: "invalid_username" });
    if (String(password || "").length < 8) return json(res, 400, { error: "invalid_password" });
    if (!String(wordProtection || "").trim()) return json(res, 400, { error: "invalid_word_protection" });
    if (password === wordProtection) return json(res, 400, { error: "word_protection_must_differ" });

    try {
      const student = await createStudent({
        username: cleanUsername,
        passwordHash: hashSecret(password),
        wordProtectionHash: hashSecret(wordProtection),
        deviceIdentifier: deviceIdentifier ? String(deviceIdentifier) : null,
      });

      return json(res, 200, { studentId: student.id, username: student.username, token: createToken(student) });
    } catch (error) {
      if (error.isUnique || error.code === "23505") return json(res, 409, { error: "username_exists" });
      throw error;
    }
  } catch (error) {
    return json(res, 500, { error: "server_error", message: error.message });
  }
}
