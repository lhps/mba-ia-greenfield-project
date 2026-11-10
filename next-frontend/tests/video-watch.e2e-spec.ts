import type { Page } from "@playwright/test"

import { expect, test } from "./fixtures"

// 1 spec (specs/watch.plan.md) → 1 file with one describe (feature = target_file stem) + N test()
// blocks. Upstream is faked server-side by mocks/ MSW via instrumentation.ts; per-scenario outcomes
// use reserved public_id triggers (missing0000 → 404, processing0 → processing, failed00000 →
// failed; any other id → published video of channel "pixel_point"). The default login fixture
// owns "pixel_point" (GET /channels/me). No page.route() of /api/** — real Route Handlers run.

const VIDEO_ID = "abcDEF12345"

async function loginAsOwner(page: Page) {
  await page.goto("/login")
  await page.getByLabel("Email address").fill("owner@example.com")
  await page.getByLabel("Password", { exact: true }).fill("secret123")
  const loginResponse = page.waitForResponse(
    (r) => r.url().includes("/api/auth/login") && r.request().method() === "POST"
  )
  await page.getByRole("button", { name: "Sign in" }).click()
  expect((await loginResponse).status()).toBe(200)
}

test.describe("video-watch", () => {
  // 1. Exibir o vídeo, suas informações e as sugestões na página de visualização

  test("1.1 watch-anonimo-video-publicado", async ({ page }) => {
    await page.goto(`/watch/${VIDEO_ID}`)

    // Player with the in-scope controls.
    await expect(page.locator("video")).toBeVisible()
    await expect(page.getByRole("button", { name: "Play" })).toBeVisible()
    await expect(page.getByRole("button", { name: "Mute" })).toBeVisible()
    await expect(page.getByRole("slider", { name: "Seek" })).toBeAttached()
    await expect(page.getByRole("slider", { name: "Volume" })).toBeAttached()

    // Info block: title heading + channel link.
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Building a video watch page")
    await expect(page.getByRole("link", { name: "Pixel Point" })).toHaveAttribute(
      "href",
      "/channels/pixel_point"
    )

    // Meta row in English, e.g. "10K views • 3 weeks ago".
    await expect(page.getByText(/^10K views • .+ ago$/)).toBeVisible()

    // Description collapsed with "Show more".
    await expect(page.getByRole("button", { name: "Show more" })).toHaveAttribute(
      "aria-expanded",
      "false"
    )

    // Sidebar: suggestion cards linking to /watch/{public_id} with a duration badge.
    const suggestions = page.getByRole("region", { name: "Suggested videos" })
    const firstCard = suggestions.getByRole("link").first()
    await expect(firstCard).toHaveAttribute("href", /^\/watch\/suggest\d{4}$/)
    await expect(firstCard.getByText(/^\d+:\d{2}$/)).toBeVisible()

    // Anonymous visitor never sees the owner-only Download button.
    await expect(page.getByRole("button", { name: "Download" })).toHaveCount(0)
  })

  test("1.2 watch-dono-baixa-video", async ({ page }) => {
    await loginAsOwner(page)

    await page.goto(`/watch/${VIDEO_ID}`)
    const download = page.getByRole("button", { name: "Download" })
    await expect(download).toBeVisible()

    const downloadResponse = page.waitForResponse(
      (r) => r.url().includes(`/api/videos/${VIDEO_ID}/download`) && r.request().method() === "GET"
    )
    // The browser is sent to the presigned attachment URL returned by the BFF.
    const fileRequest = page.waitForRequest((r) =>
      r.url().startsWith(`https://storage.test/downloads/${VIDEO_ID}.mp4`)
    )
    await download.click()

    expect((await downloadResponse).status()).toBe(200)
    await fileRequest
  })

  test("1.3 watch-video-indisponivel", async ({ page }) => {
    await page.goto("/watch/missing0000")

    await expect(page.getByRole("heading", { name: "This video isn't available" })).toBeVisible()
    await expect(page.locator("video")).toHaveCount(0)
    await expect(page.getByRole("region", { name: "Suggested videos" })).toHaveCount(0)

    await page.getByRole("link", { name: "Go to home" }).click()
    await expect(page).toHaveURL(/\/$/)
  })

  test("1.4 watch-placeholder-video-nao-pronto", async ({ page }) => {
    await loginAsOwner(page)

    const playbackCalls: string[] = []
    page.on("request", (r) => {
      if (/\/api\/videos\/(processing0|failed00000)\/(stream|views)/.test(r.url())) {
        playbackCalls.push(r.url())
      }
    })

    await page.goto("/watch/processing0")
    await expect(page.getByRole("status")).toHaveText("Processing…")
    await expect(page.locator("video")).toHaveCount(0)
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
    await expect(page.getByRole("region", { name: "Suggested videos" })).toBeVisible()

    await page.goto("/watch/failed00000")
    await expect(page.getByRole("status")).toHaveText("Processing failed")
    await expect(page.locator("video")).toHaveCount(0)

    expect(playbackCalls).toEqual([])
  })
})
