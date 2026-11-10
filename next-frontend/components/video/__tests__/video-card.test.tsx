// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";

import { VideoCard } from "../video-card";

const props = {
  publicId: "abcDEF12345",
  title: "Learn React in 30 minutes",
  thumbnailUrl: "https://storage.test/thumbnails/abcDEF12345.jpg",
  durationLabel: "12:31",
  metaLabel: "10K views • 3 weeks ago",
};

describe("VideoCard", () => {
  it("links to the watch page of the video", () => {
    render(<VideoCard {...props} />);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/watch/abcDEF12345");
  });

  it("renders title, duration badge and meta line", () => {
    render(<VideoCard {...props} />);
    expect(screen.getByRole("heading", { name: props.title })).toBeInTheDocument();
    expect(screen.getByText("12:31")).toBeInTheDocument();
    expect(screen.getByText("10K views • 3 weeks ago")).toBeInTheDocument();
  });

  it("renders without a thumbnail image when thumbnailUrl is null", () => {
    const { container } = render(<VideoCard {...props} thumbnailUrl={null} />);
    expect(container.querySelector("img")).toBeNull();
  });
});
