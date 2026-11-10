// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { VideoDescription } from "../video-description";

// jsdom does no layout: scrollHeight/clientHeight are 0. Stub them to simulate clamped text.
function stubTextHeights(scrollHeight: number, clientHeight: number) {
  Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
    configurable: true,
    get: () => scrollHeight,
  });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get: () => clientHeight,
  });
}

afterEach(() => {
  stubTextHeights(0, 0);
});

const longText = "Line one\nLine two\nLine three\nLine four\nLine five";

describe("VideoDescription", () => {
  it("renders the meta row and the description inside a card", () => {
    stubTextHeights(60, 60);
    const { container } = render(
      <VideoDescription metaLabel="10K views • 3 weeks ago" description="Short text" />
    );
    expect(container.querySelector("[data-slot='card']")).toBeInTheDocument();
    expect(screen.getByText("10K views • 3 weeks ago")).toBeInTheDocument();
    expect(screen.getByText("Short text")).toBeInTheDocument();
  });

  it("shows no toggle when the text fits in 3 lines", () => {
    stubTextHeights(60, 60);
    render(<VideoDescription metaLabel="1 view • 1 day ago" description="Short text" />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("shows no toggle for an empty description", () => {
    stubTextHeights(0, 0);
    render(<VideoDescription metaLabel="1 view • 1 day ago" description="" />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("shows 'Show more' collapsed when the text overflows", () => {
    stubTextHeights(100, 60);
    render(<VideoDescription metaLabel="10K views • 3 weeks ago" description={longText} />);
    const toggle = screen.getByRole("button", { name: "Show more" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("toggles between 'Show more' and 'Show less' with aria-expanded", async () => {
    const user = userEvent.setup();
    stubTextHeights(100, 60);
    render(<VideoDescription metaLabel="10K views • 3 weeks ago" description={longText} />);

    await user.click(screen.getByRole("button", { name: "Show more" }));
    const expanded = screen.getByRole("button", { name: "Show less" });
    expect(expanded).toHaveAttribute("aria-expanded", "true");

    await user.click(expanded);
    expect(screen.getByRole("button", { name: "Show more" })).toHaveAttribute(
      "aria-expanded",
      "false"
    );
  });
});
