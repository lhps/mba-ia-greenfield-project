import "server-only";

import type { SessionData } from "@/lib/auth/session";

// Optional bearer for upstream calls: present only for a logged-in session
// (per phase-02-auth-frontend/TD-02 — tokens live in the iron-session cookie).
export function sessionAuthHeader(
  session: Pick<SessionData, "isLoggedIn" | "accessToken">
): Record<string, string> {
  if (!session.isLoggedIn || !session.accessToken) return {};
  return { Authorization: `Bearer ${session.accessToken}` };
}

// The client address as seen by the Next server. Next fills `x-forwarded-for` from the
// socket only when the header is absent, so the last entry is the closest hop
// (a fronting proxy's view, or the socket address).
function clientAddress(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for");
  const last = forwarded
    ?.split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .at(-1);
  return last ?? headers.get("x-real-ip")?.trim() ?? null;
}

// User-Agent + X-Forwarded-For for the anonymous viewer key: the API trusts exactly one
// hop and reads the last X-Forwarded-For entry (per phase-05-video-watch/TD-01 revision).
export function clientForwardingHeaders(request: Request): Record<string, string> {
  const headers: Record<string, string> = {};
  const userAgent = request.headers.get("user-agent");
  if (userAgent) headers["User-Agent"] = userAgent;
  const address = clientAddress(request.headers);
  if (address) headers["X-Forwarded-For"] = address;
  return headers;
}
