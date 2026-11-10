import { describe, expect, it } from "vitest";

import {
  formatCompactCount,
  formatDuration,
  formatRelativeDate,
  formatViews,
} from "../format";

const now = new Date("2026-11-10T12:00:00.000Z");
const ago = (seconds: number) => new Date(now.getTime() - seconds * 1000).toISOString();

describe("formatRelativeDate", () => {
  it.each([
    [30, "30 seconds ago"],
    [5 * 60, "5 minutes ago"],
    [3 * 3600, "3 hours ago"],
    [2 * 86400, "2 days ago"],
    [21 * 86400, "3 weeks ago"],
    [90 * 86400, "3 months ago"],
    [800 * 86400, "2 years ago"],
  ])("formats %i seconds ago as %s", (seconds, expected) => {
    expect(formatRelativeDate(ago(seconds), now)).toBe(expected);
  });

  it("uses singular units", () => {
    expect(formatRelativeDate(ago(86400), now)).toBe("1 day ago");
  });

  it("returns an empty string for a missing or invalid date", () => {
    expect(formatRelativeDate(null, now)).toBe("");
    expect(formatRelativeDate(undefined, now)).toBe("");
    expect(formatRelativeDate("not-a-date", now)).toBe("");
  });
});

describe("formatCompactCount", () => {
  it.each([
    [999, "999"],
    [1000, "1K"],
    [1200, "1.2K"],
    [10000, "10K"],
    [1_200_000, "1.2M"],
  ])("formats %i as %s", (value, expected) => {
    expect(formatCompactCount(value)).toBe(expected);
  });
});

describe("formatViews", () => {
  it("pluralizes and compacts", () => {
    expect(formatViews(10000)).toBe("10K views");
    expect(formatViews(0)).toBe("0 views");
  });

  it("uses the singular for one view", () => {
    expect(formatViews(1)).toBe("1 view");
  });
});

describe("formatDuration", () => {
  it("formats minutes and seconds", () => {
    expect(formatDuration(751)).toBe("12:31");
    expect(formatDuration(5)).toBe("0:05");
  });

  it("includes hours when needed", () => {
    expect(formatDuration(3725)).toBe("1:02:05");
  });

  it("returns an empty string when the duration is unknown", () => {
    expect(formatDuration(null)).toBe("");
    expect(formatDuration(undefined)).toBe("");
  });
});
