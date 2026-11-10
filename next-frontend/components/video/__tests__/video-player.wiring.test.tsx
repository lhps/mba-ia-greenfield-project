// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { http, HttpResponse } from "msw"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { server } from "@/mocks/server"

import { VideoPlayer } from "../video-player"

const ID = "abcDEF12345"
const SRC = "https://storage.test/videos/abcDEF12345.mp4?sig=old"
const FRESH = "https://storage.test/videos/abcDEF12345.mp4?sig=new"

// jsdom implements no media playback: stub play/pause and make currentTime writable.
beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(function (this: HTMLMediaElement) {
    this.dispatchEvent(new Event("play"))
    return Promise.resolve()
  })
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(function (this: HTMLMediaElement) {
    this.dispatchEvent(new Event("pause"))
  })
})

function videoElement(container: HTMLElement) {
  const video = container.querySelector("video")
  if (!video) throw new Error("video element missing")
  let time = 0
  Object.defineProperty(video, "currentTime", {
    configurable: true,
    get: () => time,
    set: (value: number) => {
      time = value
    },
  })
  return video
}

describe("<VideoPlayer /> wiring", () => {
  it("toggles play/pause and mute on the media element", async () => {
    const user = userEvent.setup()
    server.use(http.post(`/api/videos/${ID}/views`, () => new HttpResponse(null, { status: 204 })))
    const { container } = render(<VideoPlayer publicId={ID} src={SRC} />)
    const video = videoElement(container)

    await user.click(screen.getByRole("button", { name: "Play" }))
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled()
    expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Mute" }))
    expect(video.muted).toBe(true)
  })

  it("records exactly one view on the first play of the page load", async () => {
    let views = 0
    server.use(
      http.post(`/api/videos/${ID}/views`, () => {
        views++
        return new HttpResponse(null, { status: 204 })
      })
    )
    const { container } = render(<VideoPlayer publicId={ID} src={SRC} />)
    const video = videoElement(container)

    fireEvent.play(video)
    fireEvent.pause(video)
    fireEvent.play(video)

    await waitFor(() => expect(views).toBe(1))
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(views).toBe(1)
  })

  it("fetches a fresh URL on a media error and resumes from the saved position", async () => {
    let streamCalls = 0
    server.use(
      http.get(`/api/videos/${ID}/stream`, () => {
        streamCalls++
        return HttpResponse.json({ url: FRESH, expires_at: "2026-12-31T23:59:59.000Z" })
      })
    )
    const { container } = render(<VideoPlayer publicId={ID} src={SRC} />)
    const video = videoElement(container)
    video.currentTime = 42

    fireEvent.error(video)

    await waitFor(() => expect(video).toHaveAttribute("src", FRESH))
    expect(streamCalls).toBe(1)

    video.currentTime = 0
    fireEvent.loadedMetadata(video)
    expect(video.currentTime).toBe(42)
  })

  it("shows 'Video unavailable' when the refresh fails", async () => {
    server.use(
      http.get(`/api/videos/${ID}/stream`, () =>
        HttpResponse.json(
          { statusCode: 404, error: "VIDEO_NOT_FOUND", message: "Video not found", code: null },
          { status: 404 }
        )
      )
    )
    const { container } = render(<VideoPlayer publicId={ID} src={SRC} />)
    fireEvent.error(videoElement(container))

    expect(await screen.findByRole("alert")).toHaveTextContent("Video unavailable")
  })

  it("refreshes only once: a second media error shows 'Video unavailable'", async () => {
    let streamCalls = 0
    server.use(
      http.get(`/api/videos/${ID}/stream`, () => {
        streamCalls++
        return HttpResponse.json({ url: FRESH, expires_at: "2026-12-31T23:59:59.000Z" })
      })
    )
    const { container } = render(<VideoPlayer publicId={ID} src={SRC} />)
    const video = videoElement(container)

    fireEvent.error(video)
    await waitFor(() => expect(video).toHaveAttribute("src", FRESH))
    fireEvent.error(video)

    expect(await screen.findByRole("alert")).toHaveTextContent("Video unavailable")
    expect(streamCalls).toBe(1)
  })

  it("fetches the stream URL on mount when the server render had none", async () => {
    server.use(
      http.get(`/api/videos/${ID}/stream`, () =>
        HttpResponse.json({ url: FRESH, expires_at: "2026-12-31T23:59:59.000Z" })
      )
    )
    const { container } = render(<VideoPlayer publicId={ID} src={null} />)
    await waitFor(() => expect(container.querySelector("video")).toHaveAttribute("src", FRESH))
  })
})
