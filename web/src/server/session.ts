import { db, nowMs } from "./db";

const SESSION_COOKIE = "glmtts_session";

function parseCookies(cookieHeader: string | null): Record<string, string> {
  if (!cookieHeader) return {};
  const out: Record<string, string> = {};
  for (const part of cookieHeader.split(";")) {
    const [rawKey, ...rest] = part.trim().split("=");
    if (!rawKey) continue;
    const key = rawKey;
    const value = rest.join("=");
    if (!value) continue;
    out[key] = decodeURIComponent(value);
  }
  return out;
}

export type SessionInfo = {
  id: string;
  isNew: boolean;
};

export function getOrCreateSession(req: Request): SessionInfo {
  const cookies = parseCookies(req.headers.get("cookie"));
  const existing = cookies[SESSION_COOKIE];
  if (existing) {
    db.query("UPDATE sessions SET last_seen_at = $now WHERE id = $id").run({
      now: nowMs(),
      id: existing,
    });
    return { id: existing, isNew: false };
  }

  const id = crypto.randomUUID();
  const now = nowMs();
  db.query("INSERT INTO sessions (id, created_at, last_seen_at) VALUES ($id, $now, $now)").run({
    id,
    now,
  });

  return { id, isNew: true };
}

export function sessionSetCookieHeader(sessionId: string): string {
  // Same-origin frontend (Bun server serves the UI) so httpOnly is fine.
  return `${SESSION_COOKIE}=${encodeURIComponent(sessionId)}; Path=/; Max-Age=31536000; SameSite=Lax; HttpOnly`;
}
