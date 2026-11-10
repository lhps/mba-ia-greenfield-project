import { NextResponse } from "next/server";

import type { ApiErrorEnvelope } from "@/lib/api/contracts";
import { clientForwardingHeaders, sessionAuthHeader } from "@/lib/api/forwarding";
import { upstream } from "@/lib/api/upstream";
import { getSession } from "@/lib/auth/session";

// Records one view on the first play of a page load (per phase-05-video-watch/TD-01).
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getSession();

  const { error, response } = await upstream.POST("/videos/{id}/views", {
    params: { path: { id } },
    headers: { ...sessionAuthHeader(session), ...clientForwardingHeaders(request) },
  });

  if (error) {
    return NextResponse.json<ApiErrorEnvelope>(error as ApiErrorEnvelope, {
      status: response.status,
    });
  }

  return new Response(null, { status: 204 });
}
