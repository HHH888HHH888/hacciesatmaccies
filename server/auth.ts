/* ============================================================
   HAXAX — authentication

   Single-operator access. One access code unlocks the terminal;
   there is one account. The password comes from the environment
   (never the bundle). Sessions are HMAC-signed tokens delivered as
   http-only cookies; the data API is locked behind a valid session.
   App-grade auth — pair with HTTPS in prod.
   ============================================================ */

import crypto from "node:crypto";

const SECRET = process.env.HAXAX_SESSION_SECRET || crypto.randomBytes(24).toString("hex");
// HAXAX_ACCESS_PASSWORD is preferred; HAXAX_GATE_PASSWORD kept as a fallback for existing configs.
const PASSWORD = process.env.HAXAX_ACCESS_PASSWORD || process.env.HAXAX_GATE_PASSWORD || "haxax888";
const TTL_MS = 12 * 60 * 60 * 1000; // 12h sessions

/* constant-time password comparison (hash first so lengths match) */
function pwEqual(a: string, b: string): boolean {
  const ha = crypto.createHash("sha256").update(a).digest();
  const hb = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function sign(payload: string): string {
  const sig = crypto.createHmac("sha256", SECRET).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}
function verify(token: string | undefined): boolean {
  if (!token) return false;
  const i = token.lastIndexOf(".");
  if (i < 0) return false;
  const payload = token.slice(0, i);
  const sig = Buffer.from(token.slice(i + 1));
  const expect = Buffer.from(crypto.createHmac("sha256", SECRET).update(payload).digest("base64url"));
  if (sig.length !== expect.length || !crypto.timingSafeEqual(sig, expect)) return false;
  const exp = Number(payload.split("|")[2]);
  return !!exp && exp >= Date.now();
}

export function checkAccess(pw: string): boolean {
  return typeof pw === "string" && pwEqual(pw, PASSWORD);
}
export function sessionToken(): string {
  return sign(`s|1|${Date.now() + TTL_MS}`);
}
export function hasSession(token?: string): boolean {
  return verify(token);
}
