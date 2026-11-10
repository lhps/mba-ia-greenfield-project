// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";

import { SuggestedVideos } from "../suggested-videos";

function item(n: number) {
  return {
    publicId: `video${n.toString().padStart(6, "0")}`,
    title: `Suggestion ${n}`,
    thumbnailUrl: null,
    durationLabel: "4:56",
    metaLabel: "1.2K views • 2 days ago",
  };
}

describe("SuggestedVideos", () => {
  it("renders one card per item", () => {
    render(<SuggestedVideos items={[item(1), item(2), item(3)]} />);
    expect(screen.getAllByRole("link")).toHaveLength(3);
  });

  it("renders no cards for an empty list", () => {
    render(<SuggestedVideos items={[]} />);
    expect(screen.getByRole("region", { name: "Suggested videos" })).toBeInTheDocument();
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });
});
