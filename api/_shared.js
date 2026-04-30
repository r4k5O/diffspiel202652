import crypto from "node:crypto";
import pg from "pg";
import { createClient } from "@libsql/client/http";

const { Pool } = pg;
const postgresUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL;
const libsqlUrl = process.env.TURSO_DATABASE_URL || process.env.LIBSQL_URL || process.env.SQLITE_URL;
const libsqlAuthToken = process.env.TURSO_AUTH_TOKEN || process.env.LIBSQL_AUTH_TOKEN;
const databaseType =
  libsqlUrl || postgresUrl?.startsWith("libsql:") || postgresUrl?.startsWith("https:")
    ? "libsql"
    : postgresUrl
      ? "postgres"
      : null;
const connectionString = databaseType === "libsql" ? libsqlUrl || postgresUrl : postgresUrl;
const databaseEnvName =
  databaseType === "libsql"
    ? process.env.TURSO_DATABASE_URL
      ? "TURSO_DATABASE_URL"
      : process.env.LIBSQL_URL
        ? "LIBSQL_URL"
        : process.env.SQLITE_URL
          ? "SQLITE_URL"
          : "DATABASE_URL"
    : process.env.DATABASE_URL
      ? "DATABASE_URL"
      : process.env.POSTGRES_URL
        ? "POSTGRES_URL"
        : process.env.POSTGRES_PRISMA_URL
          ? "POSTGRES_PRISMA_URL"
          : null;

let pool;
let libsqlClient;

export function hasDatabaseConnection() {
  return Boolean(connectionString);
}

export function getDatabaseType() {
  return databaseType;
}

export function getStorageStatus() {
  const isVercel = Boolean(process.env.VERCEL);
  return {
    hasDatabase: hasDatabaseConnection(),
    databaseEnvName,
    databaseType,
    isVercel,
    requiresServerStorage: isVercel && !hasDatabaseConnection(),
    message: hasDatabaseConnection()
      ? `Server-Datenbank aktiv (${databaseEnvName}, ${databaseType}).`
      : isVercel
        ? "Auf Vercel ist keine persistente Datenbank verbunden. Verbinde eine Marketplace-Storage-Integration oder setze DATABASE_URL/TURSO_DATABASE_URL."
        : "Keine Server-Datenbank konfiguriert. Diese Umgebung kann lokal im Browser speichern oder mit DATABASE_URL/TURSO_DATABASE_URL persistent werden.",
  };
}

export function getPool() {
  if (!connectionString) {
    throw new Error(getStorageStatus().message);
  }

  if (!pool) {
    pool = new Pool({
      connectionString,
      ssl: connectionString.includes("localhost") ? false : { rejectUnauthorized: false },
    });
  }

  return pool;
}

export function getLibsqlClient() {
  if (!connectionString) {
    throw new Error(getStorageStatus().message);
  }

  if (!libsqlClient) {
    libsqlClient = createClient({
      url: connectionString,
      authToken: libsqlAuthToken,
    });
  }

  return libsqlClient;
}

export function json(res, status, body) {
  res.status(status).setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

export async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

export function hashSecret(secret) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(secret, salt, 120000, 32, "sha256").toString("hex");
  return `${salt}:${hash}`;
}

export function verifySecret(secret, stored) {
  const [salt, hash] = String(stored || "").split(":");
  if (!salt || !hash) return false;
  const candidate = crypto.pbkdf2Sync(secret, salt, 120000, 32, "sha256").toString("hex");
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(candidate, "hex"));
}

function tokenSecret() {
  return process.env.AUTH_SECRET || connectionString || "diffspiel-local-secret";
}

export function createToken(student) {
  const payload = {
    sub: student.id,
    username: student.username,
    exp: Date.now() + 1000 * 60 * 60 * 24 * 14,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", tokenSecret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyToken(req) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = crypto.createHmac("sha256", tokenSecret()).update(body).digest("base64url");
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  if (!payload.exp || payload.exp < Date.now()) return null;
  return payload;
}

export async function requireStudent(req) {
  const token = verifyToken(req);
  if (!token) return null;
  const { getStudentById } = await import("./_data.js");
  return getStudentById(token.sub);
}

export function allowMethods(req, res, methods) {
  if (methods.includes(req.method)) return true;
  res.setHeader("Allow", methods.join(", "));
  json(res, 405, { error: "method_not_allowed" });
  return false;
}
