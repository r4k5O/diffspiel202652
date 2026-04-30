import { allowMethods, getStorageStatus, json } from "./_shared.js";

export default async function handler(req, res) {
  if (!allowMethods(req, res, ["GET"])) return;
  return json(res, 200, getStorageStatus());
}
