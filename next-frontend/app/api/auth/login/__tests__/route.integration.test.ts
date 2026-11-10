import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { server } from "@/mocks/server";
import { http, HttpResponse } from "msw";
import { env } from "@/lib/env";

// Cookie store mock for iron-session (same pattern as session.test.ts).
const cookieMap = new Map<string, string>();

vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({
    get: (name: string) =>
      cookieMap.has(name) ? { name, value: cookieMap.get(name)! } : undefined,
    set: (name: string, value: string) => { cookieMap.set(name, value); },
    delete: (name: string) => { cookieMap.delete(name); },
  }),
}));

let POST: (req: Request) => Promise<Response>;

beforeAll(async () => {
  ({ POST } = await import("@/app/api/auth/login/route"));
});

const { getSession } = await import("@/lib/auth/session");

beforeEach(() => {
  cookieMap.clear();
});

function makeRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/login", () => {
  it("returns 200 with empty body (no tokens) and sets iron-session cookie on success", async () => {
    const res = await POST(makeRequest({ email: "alice@example.com", password: "pw" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).not.toHaveProperty("access_token");
    expect(body).not.toHaveProperty("refresh_token");
    // iron-session cookie must be set
    expect(cookieMap.has("streamtube_session")).toBe(true);
  });

  it("returns 401 without setting cookie for invalid credentials (reserved trigger uses badrequest@ — upstream override for 401)", async () => {
    server.use(
      http.post(`${env.API_URL}/auth/login`, () =>
        HttpResponse.json(
          { statusCode: 401, error: "INVALID_CREDENTIALS", message: "Invalid email or password" },
          { status: 401 }
        )
      )
    );
    const res = await POST(makeRequest({ email: "bad@example.com", password: "wrong" }));
    expect(res.status).toBe(401);
    expect(cookieMap.has("streamtube_session")).toBe(false);
    const body = await res.json();
    expect(body).toMatchObject({ statusCode: 401, error: "INVALID_CREDENTIALS" });
  });

  it("returns 403 without setting cookie for unconfirmed email", async () => {
    server.use(
      http.post(`${env.API_URL}/auth/login`, () =>
        HttpResponse.json(
          { statusCode: 403, error: "EMAIL_NOT_CONFIRMED", message: "Email not confirmed" },
          { status: 403 }
        )
      )
    );
    const res = await POST(makeRequest({ email: "unconfirmed@example.com", password: "pw" }));
    expect(res.status).toBe(403);
    expect(cookieMap.has("streamtube_session")).toBe(false);
    const body = await res.json();
    expect(body).toMatchObject({ statusCode: 403 });
  });

  it("returns 400 without setting cookie for validation failure (reserved trigger)", async () => {
    const res = await POST(makeRequest({ email: "badrequest@example.com", password: "" }));
    expect(res.status).toBe(400);
    expect(cookieMap.has("streamtube_session")).toBe(false);
  });

  describe("session channelSlug", () => {
    it("seals the channel nickname from GET /channels/me into the session", async () => {
      let authorization: string | null = null;
      server.use(
        http.get(`${env.API_URL}/channels/me`, ({ request }) => {
          authorization = request.headers.get("authorization");
          return HttpResponse.json({
            nickname: "pixel_point",
            name: "Pixel Point",
            description: null,
            nickname_changed_at: null,
            next_nickname_change_at: null,
            created_at: "2026-10-01T09:00:00.000Z",
          });
        })
      );

      const res = await POST(makeRequest({ email: "alice@example.com", password: "pw" }));
      expect(res.status).toBe(200);
      expect(authorization).toBe("Bearer fixture-access-token");

      const session = await getSession();
      expect(session.isLoggedIn).toBe(true);
      expect(session.channelSlug).toBe("pixel_point");
    });

    it("still logs in with an empty channelSlug when GET /channels/me fails", async () => {
      server.use(
        http.get(`${env.API_URL}/channels/me`, () =>
          HttpResponse.json(
            { statusCode: 500, error: "INTERNAL_ERROR", message: "boom", code: null },
            { status: 500 }
          )
        )
      );

      const res = await POST(makeRequest({ email: "alice@example.com", password: "pw" }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({});

      const session = await getSession();
      expect(session.isLoggedIn).toBe(true);
      expect(session.channelSlug).toBe("");
    });

    it("still logs in when GET /channels/me cannot be reached", async () => {
      server.use(http.get(`${env.API_URL}/channels/me`, () => HttpResponse.error()));

      const res = await POST(makeRequest({ email: "alice@example.com", password: "pw" }));
      expect(res.status).toBe(200);
      expect((await getSession()).channelSlug).toBe("");
    });
  });
});
