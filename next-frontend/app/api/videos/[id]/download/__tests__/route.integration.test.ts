import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { http, HttpResponse } from "msw";

import { env } from "@/lib/env";
import { buildPresignedUrl } from "@/mocks/factories/videos";
import {
  MISSING_VIDEO_ID,
  NOT_OWNED_VIDEO_ID,
  PROCESSING_VIDEO_ID,
} from "@/mocks/handlers/videos";
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
  ({ GET } = await import("@/app/api/videos/[id]/download/route"));
});

const { setSession } = await import("@/lib/auth/session");

function call(id: string) {
  const request = new Request(`http://localhost/api/videos/${id}/download`);
  return GET(request, { params: Promise.resolve({ id }) });
}

async function loginAsOwner() {
  await setSession({
    accessToken: "old-at",
    refreshToken: "old-rt",
    userId: "u1",
    email: "owner@example.com",
    channelSlug: "pixel_point",
  });
}

beforeEach(() => {
  cookieMap.clear();
});

describe("GET /api/videos/[id]/download", () => {
  it("returns 401 UNAUTHORIZED without a session and never calls upstream", async () => {
    let upstreamCalls = 0;
    server.use(
      http.get(`${env.API_URL}/videos/:id/download`, () => {
        upstreamCalls++;
        return HttpResponse.json(buildPresignedUrl("abcDEF12345", "downloads"));
      })
    );

    const res = await call("abcDEF12345");
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ statusCode: 401, error: "UNAUTHORIZED" });
    expect(upstreamCalls).toBe(0);
  });

  it("returns the upstream download URL for the owner with the bearer", async () => {
    await loginAsOwner();
    let authorization: string | null = null;
    server.use(
      http.get(`${env.API_URL}/videos/:id/download`, ({ request }) => {
        authorization = request.headers.get("authorization");
        return HttpResponse.json(buildPresignedUrl("abcDEF12345", "downloads"));
      })
    );

    const res = await call("abcDEF12345");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual(buildPresignedUrl("abcDEF12345", "downloads"));
    expect(authorization).toBe("Bearer old-at");
  });

  it("refreshes once on an upstream 401 and retries with the new token", async () => {
    await loginAsOwner();
    let refreshCalls = 0;
    const seenTokens: (string | null)[] = [];
    server.use(
      http.get(`${env.API_URL}/videos/:id/download`, ({ request }) => {
        const authorization = request.headers.get("authorization");
        seenTokens.push(authorization);
        return authorization === "Bearer new-at"
          ? HttpResponse.json(buildPresignedUrl("abcDEF12345", "downloads"))
          : HttpResponse.json(
              { statusCode: 401, error: "UNAUTHORIZED", message: "Token expired", code: null },
              { status: 401 }
            );
      }),
      http.post(`${env.API_URL}/auth/refresh`, () => {
        refreshCalls++;
        return HttpResponse.json({ access_token: "new-at", refresh_token: "new-rt" });
      })
    );

    const res = await call("abcDEF12345");
    expect(res.status).toBe(200);
    expect(refreshCalls).toBe(1);
    expect(seenTokens).toEqual(["Bearer old-at", "Bearer new-at"]);
  });

  it("returns 401 when the refresh fails", async () => {
    await loginAsOwner();
    server.use(
      http.get(`${env.API_URL}/videos/:id/download`, () =>
        HttpResponse.json(
          { statusCode: 401, error: "UNAUTHORIZED", message: "Token expired", code: null },
          { status: 401 }
        )
      ),
      http.post(`${env.API_URL}/auth/refresh`, () =>
        HttpResponse.json(
          { statusCode: 401, error: "INVALID_REFRESH_TOKEN", message: "Invalid", code: null },
          { status: 401 }
        )
      )
    );

    const res = await call("abcDEF12345");
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ statusCode: 401, error: "UNAUTHORIZED" });
  });

  it.each([
    [NOT_OWNED_VIDEO_ID, 403, "VIDEO_ACCESS_DENIED"],
    [MISSING_VIDEO_ID, 404, "VIDEO_NOT_FOUND"],
    [PROCESSING_VIDEO_ID, 409, "VIDEO_NOT_READY"],
  ])("passes through %s → %i %s", async (id, status, error) => {
    await loginAsOwner();
    const res = await call(id);
    expect(res.status).toBe(status);
    expect(await res.json()).toMatchObject({ statusCode: status, error });
  });
});
