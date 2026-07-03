/* ============================================================
   HAXAX — authentication

   Server-side gate + two accounts (Admin / Guest). Passwords come
   from the environment (never the bundle). Sessions are HMAC-signed
   tokens delivered as http-only cookies; the data API is locked
   behind a valid session. App-grade auth — pair with HTTPS in prod.
   ============================================================ */

import crypto from "node:crypto";

const SECRET = process.env.HAXAX_SESSION_SECRET || crypto.randomBytes(24).toString("hex");
const GATE = process.env.HAXAX_GATE_PASSWORD || "haxax888";
const ACCOUNTS: Record<string, string> = {
  Admin: process.env.HAXAX_ADMIN_PASSWORD || "haig888",
  Guest: process.env.HAXAX_GUEST_PASSWORD || "haxax888",
};
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
interface Claim { kind: string; value: string; exp: number; }
function verify(token: string | undefined): Claim | null {
  if (!token) return null;
  const i = token.lastIndexOf(".");
  if (i < 0) return null;
  const payload = token.slice(0, i);
  const sig = Buffer.from(token.slice(i + 1));
  const expect = Buffer.from(crypto.createHmac("sha256", SECRET).update(payload).digest("base64url"));
  if (sig.length !== expect.length || !crypto.timingSafeEqual(sig, expect)) return null;
  const [kind, value, exp] = payload.split("|");
  const claim: Claim = { kind, value, exp: Number(exp) };
  if (!claim.exp || claim.exp < Date.now()) return null;
  return claim;
}

export const ACCOUNT_NAMES = Object.keys(ACCOUNTS);

export function checkGate(pw: string): boolean {
  return typeof pw === "string" && pwEqual(pw, GATE);
}
export function checkAccount(account: string, pw: string): boolean {
  const real = ACCOUNTS[account];
  return !!real && typeof pw === "string" && pwEqual(pw, real);
}
export function gateToken(): string {
  return sign(`gate|1|${Date.now() + TTL_MS}`);
}
export function sessionToken(account: string): string {
  return sign(`acct|${account}|${Date.now() + TTL_MS}`);
}
export function hasGate(token?: string): boolean {
  return verify(token)?.kind === "gate";
}
export function sessionAccount(token?: string): string | null {
  const c = verify(token);
  return c && c.kind === "acct" ? c.value : null;
}
