import { NextResponse } from "next/server";

import type { ApiErrorEnvelope, PresignedUrl } from "@/lib/api/contracts";
import { sessionAuthHeader } from "@/lib/api/forwarding";
import { upstream } from "@/lib/api/upstream";
import { withRefresh } from "@/lib/auth/refresh";
import { getSession } from "@/lib/auth/session";

type DownloadResult = Awaited<ReturnType<typeof requestDownload>>;

async function requestDownload(id: string) {
  // Re-read the session on every attempt so the retry after a refresh carries the new token.
  const session = await getSession();
  return upstream.GET("/videos/{id}/download", {
    params: { path: { id } },
    headers: sessionAuthHeader(session),
  });
}

// Owner-only download URL (presigned GET with attachment disposition).
// Refresh-on-401 is allowed here: Route Handlers can write the session cookie
// (per phase-02-auth-frontend/TD-03).
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getSession();

  if (!session.isLoggedIn) {
    return NextResponse.json<ApiErrorEnvelope>(
      { statusCode: 401, error: "UNAUTHORIZED", message: "Login required", code: null },
      { status: 401 }
    );
  }

  let result: DownloadResult | undefined;
  const response = await withRefresh(async () => {
    result = await requestDownload(id);
    return result.response;
  });

  // withRefresh answered on its own (refresh failed) — pass its 401 envelope through.
  if (!result || response !== result.response) return response;

  if (result.error) {
    return NextResponse.json<ApiErrorEnvelope>(result.error as ApiErrorEnvelope, {
      status: result.response.status,
    });
  }

  return NextResponse.json<PresignedUrl>(result.data, {
    headers: { "Cache-Control": "no-store" },
  });
}
