import { http, HttpResponse } from "msw";

import type {
  ApiErrorEnvelope,
  PresignedUrl,
  VideoDetail,
  VideoSuggestions,
} from "@/lib/api/contracts";
import { env } from "@/lib/env";
import {
  buildDraftVideoDetail,
  buildPresignedUrl,
  buildSuggestionList,
  buildVideoDetail,
  FIXTURE_STORAGE_URL,
} from "@/mocks/factories/videos";

// Reserved trigger table by public_id (11 chars; shared with E2E — must not collide with auth triggers).
export const MISSING_VIDEO_ID = "missing0000"; // 404 VIDEO_NOT_FOUND on every endpoint
export const PROCESSING_VIDEO_ID = "processing0"; // processing draft; 409 on stream/views/download
export const FAILED_VIDEO_ID = "failed00000"; // failed draft; 409 on stream/views/download
export const NOT_OWNED_VIDEO_ID = "notowned000"; // download 403 VIDEO_ACCESS_DENIED
// Any other public_id → a ready, published video of the "pixel_point" channel.

function errorEnvelope(statusCode: number, error: string, message: string): ApiErrorEnvelope {
  return { statusCode, error, message, code: null };
}

const notFound = () =>
  HttpResponse.json(errorEnvelope(404, "VIDEO_NOT_FOUND", "Video not found"), { status: 404 });

const notReady = () =>
  HttpResponse.json(errorEnvelope(409, "VIDEO_NOT_READY", "Video is not ready for playback"), {
    status: 409,
  });

function isNotReady(id: string) {
  return id === PROCESSING_VIDEO_ID || id === FAILED_VIDEO_ID;
}

function detailFor(id: string): VideoDetail {
  if (id === PROCESSING_VIDEO_ID) return buildDraftVideoDetail(id, "processing");
  if (id === FAILED_VIDEO_ID) return buildDraftVideoDetail(id, "failed");
  return buildVideoDetail({
    public_id: id,
    thumbnail_url: `${FIXTURE_STORAGE_URL}/thumbnails/${id}.jpg`,
  });
}

export const handlers = [
  // GET /videos/{id}
  http.get(`${env.API_URL}/videos/:id`, ({ params }) => {
    const id = String(params.id);
    if (id === MISSING_VIDEO_ID) return notFound();
    return HttpResponse.json<VideoDetail>(detailFor(id));
  }),

  // GET /videos/{id}/suggestions
  http.get(`${env.API_URL}/videos/:id/suggestions`, ({ params }) => {
    if (String(params.id) === MISSING_VIDEO_ID) return notFound();
    return HttpResponse.json<VideoSuggestions>({ items: buildSuggestionList() });
  }),

  // GET /videos/{id}/stream
  http.get(`${env.API_URL}/videos/:id/stream`, ({ params }) => {
    const id = String(params.id);
    if (id === MISSING_VIDEO_ID) return notFound();
    if (isNotReady(id)) return notReady();
    return HttpResponse.json<PresignedUrl>(buildPresignedUrl(id, "videos"));
  }),

  // GET /videos/{id}/download — owner-only upstream; the fixture checks only the bearer.
  http.get(`${env.API_URL}/videos/:id/download`, ({ params, request }) => {
    const id = String(params.id);
    if (!request.headers.get("authorization")) {
      return HttpResponse.json(
        errorEnvelope(401, "UNAUTHORIZED", "Missing or invalid access token"),
        { status: 401 }
      );
    }
    if (id === MISSING_VIDEO_ID) return notFound();
    if (id === NOT_OWNED_VIDEO_ID) {
      return HttpResponse.json(
        errorEnvelope(403, "VIDEO_ACCESS_DENIED", "You do not own this video"),
        { status: 403 }
      );
    }
    if (isNotReady(id)) return notReady();
    return HttpResponse.json<PresignedUrl>(buildPresignedUrl(id, "downloads"));
  }),

  // POST /videos/{id}/views
  http.post(`${env.API_URL}/videos/:id/views`, ({ params }) => {
    const id = String(params.id);
    if (id === MISSING_VIDEO_ID) return notFound();
    if (isNotReady(id)) return notReady();
    return new HttpResponse(null, { status: 204 });
  }),
];
