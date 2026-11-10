import { describe, expect, it } from "vitest";

import { clientForwardingHeaders, sessionAuthHeader } from "../forwarding";

function request(headers: Record<string, string>) {
  return new Request("http://localhost/api/videos/abcDEF12345/views", {
    method: "POST",
    headers,
  });
}

describe("sessionAuthHeader", () => {
  it("returns a bearer header for a logged-in session", () => {
    expect(sessionAuthHeader({ isLoggedIn: true, accessToken: "token-1" })).toEqual({
      Authorization: "Bearer token-1",
    });
  });

  it("returns no header for an anonymous session", () => {
    expect(sessionAuthHeader({ isLoggedIn: false, accessToken: "" })).toEqual({});
  });

  it("returns no header when the session has no access token", () => {
    expect(sessionAuthHeader({ isLoggedIn: true, accessToken: "" })).toEqual({});
  });
});

describe("clientForwardingHeaders", () => {
  it("copies the user agent and forwards the client address", () => {
    const headers = clientForwardingHeaders(
      request({ "user-agent": "UA-1", "x-forwarded-for": "203.0.113.7" })
    );
    expect(headers).toEqual({ "User-Agent": "UA-1", "X-Forwarded-For": "203.0.113.7" });
  });

  it("uses the last x-forwarded-for entry as the client address", () => {
    const headers = clientForwardingHeaders(
      request({ "x-forwarded-for": "10.0.0.1, 198.51.100.2 , 203.0.113.7" })
    );
    expect(headers["X-Forwarded-For"]).toBe("203.0.113.7");
  });

  it("falls back to x-real-ip when x-forwarded-for is absent", () => {
    const headers = clientForwardingHeaders(request({ "x-real-ip": "203.0.113.9" }));
    expect(headers["X-Forwarded-For"]).toBe("203.0.113.9");
  });

  it("omits headers it has no source for", () => {
    expect(clientForwardingHeaders(request({}))).toEqual({});
  });

  it("does not emit an empty X-Forwarded-For for a blank header", () => {
    const headers = clientForwardingHeaders(request({ "x-forwarded-for": " , " }));
    expect(headers).not.toHaveProperty("X-Forwarded-For");
  });
});
