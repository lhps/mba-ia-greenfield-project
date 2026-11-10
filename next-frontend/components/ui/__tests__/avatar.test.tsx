// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";

import { Avatar, AvatarFallback } from "../avatar";

describe("Avatar", () => {
  it("renders the root with data-slot=avatar and the default size", () => {
    const { container } = render(
      <Avatar>
        <AvatarFallback>PP</AvatarFallback>
      </Avatar>
    );
    const root = container.querySelector("[data-slot='avatar']");
    expect(root).toBeInTheDocument();
    expect(root).toHaveAttribute("data-size", "default");
  });

  it("reflects the size prop in data-size", () => {
    const { container } = render(
      <Avatar size="lg">
        <AvatarFallback>PP</AvatarFallback>
      </Avatar>
    );
    expect(container.querySelector("[data-slot='avatar']")).toHaveAttribute(
      "data-size",
      "lg"
    );
  });

  it("shows the initials fallback when there is no image", () => {
    render(
      <Avatar>
        <AvatarFallback>PP</AvatarFallback>
      </Avatar>
    );
    const fallback = screen.getByText("PP");
    expect(fallback).toHaveAttribute("data-slot", "avatar-fallback");
  });
});
