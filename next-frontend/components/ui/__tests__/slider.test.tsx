// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { Slider } from "../slider";

// Radix Slider measures its thumbs with ResizeObserver, which jsdom lacks.
beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

describe("Slider", () => {
  it("renders the root with data-slot=slider and one thumb per value", () => {
    const { container } = render(<Slider defaultValue={[40]} />);
    expect(container.querySelector("[data-slot='slider']")).toBeInTheDocument();
    expect(screen.getAllByRole("slider")).toHaveLength(1);
  });

  it("exposes the current value through aria-valuenow and the bounds", () => {
    render(<Slider value={[25]} min={0} max={50} />);
    const thumb = screen.getByRole("slider");
    expect(thumb).toHaveAttribute("aria-valuenow", "25");
    expect(thumb).toHaveAttribute("aria-valuemin", "0");
    expect(thumb).toHaveAttribute("aria-valuemax", "50");
  });

  it("calls onValueChange when an arrow key moves the thumb", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Slider defaultValue={[10]} step={1} onValueChange={onValueChange} />);
    screen.getByRole("slider").focus();
    await user.keyboard("{ArrowRight}");
    expect(onValueChange).toHaveBeenCalledWith([11]);
  });

  it("marks the root as disabled when disabled", () => {
    const { container } = render(<Slider defaultValue={[10]} disabled />);
    expect(container.querySelector("[data-slot='slider']")).toHaveAttribute(
      "data-disabled"
    );
  });
});
