import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { http, HttpResponse } from "msw";

import { env } from "@/lib/env";
import { buildPresignedUrl } from "@/mocks/factories/videos";
import { MISSING_VIDEO_ID, PROCESSING_VIDEO_ID } from "@/mocks/handlers/videos";
import { server } from "@/mocks/server";

const cookieMap = new Map<string, string>();

vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({
    get: (name: string) =>
      cookieMap.has(name) ? { name, value: cookieMap.get(name)! } : undefined,
    set: (name: string, value: string) => { cookieMap.set(name, value); },
    delete: (name: string) => { cookieMap.delete(name); },
  }),
}));

type RouteContext = { params: Promise<{ id: string }> };
let GET: (request: Request, context: RouteContext) => Promise<Response>;

beforeAll(async () => {
  ({ GET } = await import("@/app/api/videos/[id]/stream/route"));
});

const { setSession } = await import("@/lib/auth/session");

function call(id: string) {
  const request = new Request(`http://localhost/api/videos/${id}/stream`);
  return GET(request, { params: Promise.resolve({ id }) });
}

function captureUpstreamHeaders() {
  const captured: { headers?: Headers } = {};
  server.use(
    http.get(`${env.API_URL}/videos/:id/stream`, ({ request, params }) => {
      captured.headers = request.headers;
      return HttpResponse.json(buildPresignedUrl(String(params.id)));
    })
  );
  return captured;
}

beforeEach(() => {
  cookieMap.clear();
});

describe("GET /api/videos/[id]/stream", () => {
  it("returns the upstream { url, expires_at } uncached", async () => {
    const res = await call("abcDEF12345");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual(buildPresignedUrl("abcDEF12345"));
  });

  it("sends the bearer only when the session is logged in", async () => {
    const anonymous = captureUpstreamHeaders();
    await call("abcDEF12345");
    expect(anonymous.headers?.get("authorization")).toBeNull();

    await setSession({
      accessToken: "active-at",
      refreshToken: "active-rt",
      userId: "u1",
      email: "alice@example.com",
      channelSlug: "pixel_point",
    });
    const loggedIn = captureUpstreamHeaders();
    await call("abcDEF12345");
    expect(loggedIn.headers?.get("authorization")).toBe("Bearer active-at");
  });

  it("passes through 404 VIDEO_NOT_FOUND", async () => {
    const res = await call(MISSING_VIDEO_ID);
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ statusCode: 404, error: "VIDEO_NOT_FOUND" });
  });

  it("passes through 409 VIDEO_NOT_READY", async () => {
    const res = await call(PROCESSING_VIDEO_ID);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ statusCode: 409, error: "VIDEO_NOT_READY" });
  });
});
