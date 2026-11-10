import { NextResponse } from "next/server";

import type { ApiErrorEnvelope, PresignedUrl } from "@/lib/api/contracts";
import { sessionAuthHeader } from "@/lib/api/forwarding";
import { upstream } from "@/lib/api/upstream";
import { getSession } from "@/lib/auth/session";

// Fresh presigned stream URL after the current one expires mid-playback
// (per phase-05-video-watch-frontend/TD-04). Never cached: an expired URL must not be replayed.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getSession();

  const { data, error, response } = await upstream.GET("/videos/{id}/stream", {
    params: { path: { id } },
    headers: sessionAuthHeader(session),
  });

  if (error) {
    return NextResponse.json<ApiErrorEnvelope>(error as ApiErrorEnvelope, {
      status: response.status,
    });
  }

  return NextResponse.json<PresignedUrl>(data, {
    headers: { "Cache-Control": "no-store" },
  });
}
