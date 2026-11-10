// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { beforeAll, describe, it, expect } from "vitest";

import { VideoPlayer } from "../video-player";

// Radix Slider measures its thumbs with ResizeObserver, which jsdom lacks.
beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

const src = "https://storage.test/videos/abcDEF12345.mp4";

describe("VideoPlayer", () => {
  it("renders a native video element with the given src", () => {
    const { container } = render(<VideoPlayer publicId="abcDEF12345" src={src} />);
    expect(container.querySelector("video")).toHaveAttribute("src", src);
  });

  it("exposes play and mute controls with accessible names", () => {
    render(<VideoPlayer publicId="abcDEF12345" src={src} />);
    expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mute" })).toBeInTheDocument();
  });

  it("renders exactly two sliders (progress and volume) and the timestamp", () => {
    render(<VideoPlayer publicId="abcDEF12345" src={src} />);
    expect(screen.getAllByRole("slider")).toHaveLength(2);
    expect(screen.getByText("0:00 / 0:00")).toBeInTheDocument();
  });

  it("renders only the in-scope controls", () => {
    render(<VideoPlayer publicId="abcDEF12345" src={src} />);
    expect(screen.getAllByRole("button")).toHaveLength(2);
  });
});
