// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { http, HttpResponse } from "msw"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { server } from "@/mocks/server"

import { DownloadButton } from "../download-button"

const ID = "abcDEF12345"
const URL_ = "https://storage.test/downloads/abcDEF12345.mp4?sig=fixture"

// window.location.assign is not implemented by jsdom; replace it to observe the navigation.
const assign = vi.fn()
const originalLocation = window.location

beforeEach(() => {
  assign.mockClear()
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...originalLocation, assign },
  })
})

afterEach(() => {
  Object.defineProperty(window, "location", { configurable: true, value: originalLocation })
})

function envelope(statusCode: number, error: string) {
  return HttpResponse.json({ statusCode, error, message: error, code: null }, { status: statusCode })
}

describe("<DownloadButton />", () => {
  it("navigates to the returned download URL", async () => {
    const user = userEvent.setup()
    server.use(
      http.get(`/api/videos/${ID}/download`, () =>
        HttpResponse.json({ url: URL_, expires_at: "2026-12-31T23:59:59.000Z" })
      )
    )
    render(<DownloadButton publicId={ID} />)

    await user.click(screen.getByRole("button", { name: "Download" }))

    await waitFor(() => expect(assign).toHaveBeenCalledWith(URL_))
    expect(screen.queryByRole("alert")).toBeNull()
  })

  it("disables the button while the request is pending", async () => {
    const user = userEvent.setup()
    let release: () => void = () => {}
    server.use(
      http.get(`/api/videos/${ID}/download`, async () => {
        await new Promise<void>((resolve) => {
          release = resolve
        })
        return HttpResponse.json({ url: URL_, expires_at: "2026-12-31T23:59:59.000Z" })
      })
    )
    render(<DownloadButton publicId={ID} />)
    const button = screen.getByRole("button", { name: "Download" })

    await user.click(button)
    expect(button).toBeDisabled()

    release()
    await waitFor(() => expect(button).toBeEnabled())
  })

  it.each([
    [401, "UNAUTHORIZED", "Session expired — log in again"],
    [403, "VIDEO_ACCESS_DENIED", "You can't download this video"],
    [404, "VIDEO_NOT_FOUND", "This video isn't available"],
    [409, "VIDEO_NOT_READY", "This video isn't ready yet"],
  ])("shows an inline message for %i %s", async (status, error, message) => {
    const user = userEvent.setup()
    server.use(http.get(`/api/videos/${ID}/download`, () => envelope(status, error)))
    render(<DownloadButton publicId={ID} />)

    await user.click(screen.getByRole("button", { name: "Download" }))

    expect(await screen.findByRole("alert")).toHaveTextContent(message)
    expect(assign).not.toHaveBeenCalled()
  })
})
