import { http, HttpResponse } from "msw";

import type { ChannelProfile } from "@/lib/api/contracts";
import { env } from "@/lib/env";
import { FIXTURE_CHANNEL } from "@/mocks/factories/videos";

// The logged-in fixture user owns the "pixel_point" channel — the same channel as the
// default video fixture, so E2E logins see the owner-only Download button.
const channelProfile: ChannelProfile = {
  nickname: FIXTURE_CHANNEL.nickname,
  name: FIXTURE_CHANNEL.name,
  description: null,
  nickname_changed_at: null,
  next_nickname_change_at: null,
  created_at: "2026-10-01T09:00:00.000Z",
};

export const handlers = [
  // GET /channels/me
  http.get(`${env.API_URL}/channels/me`, ({ request }) => {
    if (!request.headers.get("authorization")) {
      return HttpResponse.json(
        { statusCode: 401, error: "UNAUTHORIZED", message: "Missing or invalid access token", code: null },
        { status: 401 }
      );
    }
    return HttpResponse.json<ChannelProfile>(channelProfile);
  }),
];
