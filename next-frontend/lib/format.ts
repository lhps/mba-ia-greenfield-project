// English display formatting for the watch page and suggestion cards
// (per phase-05-video-watch-frontend/TD-02 revision OQ-9 — native Intl, no dependency).

const relativeTime = new Intl.RelativeTimeFormat("en", { numeric: "always" })
const compactNumber = new Intl.NumberFormat("en", {
  notation: "compact",
  maximumFractionDigits: 1,
})

const MINUTE = 60
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const WEEK = 7 * DAY
const MONTH = 30 * DAY
const YEAR = 365 * DAY

// "3 weeks ago"; empty string when the date is missing or invalid.
export function formatRelativeDate(
  iso: string | null | undefined,
  now: Date = new Date()
): string {
  if (!iso) return ""
  const time = new Date(iso).getTime()
  if (Number.isNaN(time)) return ""

  const seconds = Math.max(0, Math.round((now.getTime() - time) / 1000))
  if (seconds < MINUTE) return relativeTime.format(-seconds, "second")
  if (seconds < HOUR) return relativeTime.format(-Math.floor(seconds / MINUTE), "minute")
  if (seconds < DAY) return relativeTime.format(-Math.floor(seconds / HOUR), "hour")
  if (seconds < WEEK) return relativeTime.format(-Math.floor(seconds / DAY), "day")
  if (seconds < MONTH) return relativeTime.format(-Math.floor(seconds / WEEK), "week")
  if (seconds < YEAR) return relativeTime.format(-Math.floor(seconds / MONTH), "month")
  return relativeTime.format(-Math.floor(seconds / YEAR), "year")
}

// "10K", "1.2M".
export function formatCompactCount(value: number): string {
  return compactNumber.format(value)
}

// "10K views"; "1 view".
export function formatViews(count: number): string {
  return count === 1 ? "1 view" : `${formatCompactCount(count)} views`
}

// "12:31" / "1:02:05"; empty string when the duration is unknown.
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return ""
  const total = Math.max(0, Math.floor(seconds))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const ss = s.toString().padStart(2, "0")
  return h > 0 ? `${h}:${m.toString().padStart(2, "0")}:${ss}` : `${m}:${ss}`
}
