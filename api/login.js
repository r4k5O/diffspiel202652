import { findStudentByUsername, findTrustedDevice, touchDevice, trustDevice } from "./_data.js";
import { allowMethods, createToken, json, readBody, verifySecret } from "./_shared.js";

export default async function handler(req, res) {
  if (!allowMethods(req, res, ["POST"])) return;

  try {
    const { username, password, wordProtection, deviceIdentifier } = await readBody(req);
    const cleanUsername = String(username || "").trim();
    const student = await findStudentByUsername(cleanUsername);

    if (!student || !verifySecret(String(password || ""), student.password_hash)) {
      return json(res, 401, { error: "invalid_login" });
    }

    if (deviceIdentifier) {
      const device = await findTrustedDevice(student.id, String(deviceIdentifier));

      if (!device) {
        if (!wordProtection) return json(res, 200, { requiresWordProtection: true });
        if (!verifySecret(String(wordProtection), student.word_protection_hash)) {
          return json(res, 401, { error: "invalid_login" });
        }

        await trustDevice(student.id, String(deviceIdentifier));
      } else {
        await touchDevice(device.id);
      }
    }

    return json(res, 200, {
      studentId: student.id,
      username: student.username,
      token: createToken(student),
      requiresWordProtection: false,
    });
  } catch (error) {
    return json(res, 500, { error: "server_error", message: error.message });
  }
}
