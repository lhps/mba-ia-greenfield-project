import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { http, HttpResponse } from "msw";

import { env } from "@/lib/env";
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
let POST: (request: Request, context: RouteContext) => Promise<Response>;

beforeAll(async () => {
  ({ POST } = await import("@/app/api/videos/[id]/views/route"));
});

const { setSession } = await import("@/lib/auth/session");

function call(id: string, headers: Record<string, string> = {}) {
  const request = new Request(`http://localhost/api/videos/${id}/views`, {
    method: "POST",
    headers,
  });
  return POST(request, { params: Promise.resolve({ id }) });
}

// Records the headers the BFF sends upstream for the next views call.
function captureUpstreamHeaders() {
  const captured: { headers?: Headers } = {};
  server.use(
    http.post(`${env.API_URL}/videos/:id/views`, ({ request }) => {
      captured.headers = request.headers;
      return new HttpResponse(null, { status: 204 });
    })
  );
  return captured;
}

beforeEach(() => {
  cookieMap.clear();
});

describe("POST /api/videos/[id]/views", () => {
  it("returns 204 with no body for a ready video", async () => {
    const res = await call("abcDEF12345");
    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");
  });

  it("forwards the browser user agent and the client address upstream", async () => {
    const captured = captureUpstreamHeaders();
    await call("abcDEF12345", {
      "user-agent": "UA-1",
      "x-forwarded-for": "203.0.113.7",
    });
    expect(captured.headers?.get("user-agent")).toBe("UA-1");
    expect(captured.headers?.get("x-forwarded-for")?.split(",").at(-1)?.trim()).toBe(
      "203.0.113.7"
    );
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
