import { NextResponse } from "next/server";

import type {
  ApiErrorEnvelope,
  ChannelProfile,
  LoginDto,
  LoginTokenPair,
} from "@/lib/api/contracts";
import { upstream } from "@/lib/api/upstream";
import { setSession } from "@/lib/auth/session";

async function readChannelSlug(accessToken: string): Promise<string> {
  if (!accessToken) return "";
  try {
    const { data } = await upstream.GET("/channels/me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return (data as ChannelProfile | undefined)?.nickname ?? "";
  } catch {
    return "";
  }
}

export async function POST(request: Request) {
  const body = (await request.json()) as LoginDto;

  const { data, error, response } = await upstream.POST("/auth/login", {
    body: body as never,
  });
  if (error) {
    return NextResponse.json<ApiErrorEnvelope>(error as ApiErrorEnvelope, {
      status: response.status,
    });
  }

  const tokens = data as LoginTokenPair;

  // The session carries the caller's channel handle so pages can recognise the owner
  // (per phase-02-auth-frontend/TD-02; phase-05-video-watch/TD-03 Note). A failed channel
  // read never fails the login — the slug just stays empty.
  const channelSlug = await readChannelSlug(tokens.access_token ?? "");

  // Seal tokens into the iron-session cookie — tokens never cross to the browser.
  await setSession({
    accessToken: tokens.access_token ?? "",
    refreshToken: tokens.refresh_token ?? "",
    userId: "",
    email: (body as Record<string, string>).email ?? "",
    channelSlug,
  });

  // FE-facing body omits access_token / refresh_token (per API Contract).
  return NextResponse.json({}, { status: 200 });
}
