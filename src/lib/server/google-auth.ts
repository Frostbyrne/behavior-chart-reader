import "server-only";
import { createHash } from "node:crypto";

/**
 * Who may spend AI credits: someone holding a Google access token that was
 * issued to this app's OAuth client for a verified address on the allowlist
 * (ALLOWED_EMAILS, or a whole domain via ALLOWED_EMAIL_DOMAINS). "*" lets any
 * verified Google account in; an empty allowlist lets nobody in. The token comes from the browser on every request;
 * nothing about the session is kept beyond this short in-memory check cache.
 */

export type User = { email: string };

export class AuthError extends Error {
  constructor(
    message: string,
    readonly status: 401 | 403,
  ) {
    super(message);
  }
}

const cache = new Map<string, { user: User; until: number }>();
const CACHE_MS = 5 * 60_000;

const list = (name: string) =>
  (process.env[name] ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

export function isAllowed(email: string): boolean {
  const domain = email.split("@")[1] ?? "";
  const emails = list("ALLOWED_EMAILS");
  return emails.includes("*") || emails.includes(email) || list("ALLOWED_EMAIL_DOMAINS").includes(domain);
}

export async function requireUser(request: Request): Promise<User> {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) throw new AuthError("Sign in with Google first.", 401);

  const key = createHash("sha256").update(token).digest("hex");
  const hit = cache.get(key);
  if (hit && hit.until > Date.now()) return hit.user;

  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  if (!clientId) throw new Error("NEXT_PUBLIC_GOOGLE_CLIENT_ID is not set");

  const res = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(token)}`,
    { cache: "no-store" },
  );
  if (!res.ok) throw new AuthError("Your Google sign-in expired. Sign in again.", 401);
  const info = (await res.json()) as {
    aud?: string;
    azp?: string;
    email?: string;
    email_verified?: string | boolean;
    expires_in?: string | number;
  };

  if (info.aud !== clientId && info.azp !== clientId) {
    throw new AuthError("This sign-in wasn't made for this app.", 401);
  }
  const email = (info.email ?? "").toLowerCase();
  const verified = info.email_verified === true || info.email_verified === "true";
  if (!email || !verified || !isAllowed(email)) {
    throw new AuthError(`${email || "This account"} isn't on this app's list of users. Ask whoever runs it to add you.`, 403);
  }

  const user = { email };
  const expiresMs = Number(info.expires_in ?? 0) * 1000;
  cache.set(key, { user, until: Date.now() + Math.min(CACHE_MS, expiresMs) });
  if (cache.size > 500) {
    const now = Date.now();
    for (const [k, v] of cache) if (v.until <= now) cache.delete(k);
  }
  return user;
}
