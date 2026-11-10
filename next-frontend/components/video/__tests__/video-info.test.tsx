// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";

import { VideoInfo } from "../video-info";

const channel = { nickname: "pixel_point", name: "Pixel Point" };

describe("VideoInfo", () => {
  it("renders the title as the page heading", () => {
    render(<VideoInfo title="Learn React" channel={channel} />);
    expect(screen.getByRole("heading", { level: 1, name: "Learn React" })).toBeInTheDocument();
  });

  it("links the channel name to the public channel page", () => {
    render(<VideoInfo title="Learn React" channel={channel} />);
    expect(screen.getByRole("link", { name: "Pixel Point" })).toHaveAttribute(
      "href",
      "/channels/pixel_point"
    );
  });

  it("shows the channel initials in the avatar", () => {
    render(<VideoInfo title="Learn React" channel={channel} />);
    expect(screen.getByText("PP")).toBeInTheDocument();
  });

  it("renders the actions slot when provided", () => {
    render(
      <VideoInfo title="Learn React" channel={channel} actions={<button>Download</button>} />
    );
    expect(screen.getByRole("button", { name: "Download" })).toBeInTheDocument();
  });
});
