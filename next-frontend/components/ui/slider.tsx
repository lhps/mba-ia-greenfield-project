"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { Slider as SliderPrimitive } from "radix-ui"

type SliderVariant = "default" | "timeline"

// "timeline" = Figma player timeline (I152:2323;108:249): 3px white track/range, 16px white thumb.
const trackVariants: Record<SliderVariant, string> = {
  default: "bg-muted data-horizontal:h-1",
  timeline: "bg-neutral-100 data-horizontal:h-0.75",
}
const rangeVariants: Record<SliderVariant, string> = {
  default: "bg-primary",
  timeline: "bg-neutral-100",
}
const thumbVariants: Record<SliderVariant, string> = {
  default: "size-3 border border-ring bg-white",
  timeline: "size-4 bg-neutral-100",
}

function Slider({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  variant = "default",
  "aria-label": ariaLabel,
  ...props
}: React.ComponentProps<typeof SliderPrimitive.Root> & { variant?: SliderVariant }) {
  const _values = React.useMemo(
    () =>
      Array.isArray(value)
        ? value
        : Array.isArray(defaultValue)
          ? defaultValue
          : [min, max],
    [value, defaultValue, min, max]
  )

  return (
    <SliderPrimitive.Root
      data-slot="slider"
      data-variant={variant}
      defaultValue={defaultValue}
      value={value}
      min={min}
      max={max}
      className={cn(
        "relative flex w-full touch-none items-center select-none data-disabled:opacity-50 data-vertical:h-full data-vertical:min-h-40 data-vertical:w-auto data-vertical:flex-col",
        className
      )}
      {...props}
    >
      <SliderPrimitive.Track
        data-slot="slider-track"
        className={cn(
          "relative grow overflow-hidden rounded-full data-horizontal:w-full data-vertical:h-full data-vertical:w-1",
          trackVariants[variant]
        )}
      >
        <SliderPrimitive.Range
          data-slot="slider-range"
          className={cn(
            "absolute select-none data-horizontal:h-full data-vertical:w-full",
            rangeVariants[variant]
          )}
        />
      </SliderPrimitive.Track>
      {Array.from({ length: _values.length }, (_, index) => (
        <SliderPrimitive.Thumb
          data-slot="slider-thumb"
          key={index}
          // role="slider" lives on the thumb, so the accessible name goes here (library-refs radix-ui).
          aria-label={ariaLabel}
          className={cn(
            "relative block shrink-0 rounded-full ring-ring/50 transition-[color,box-shadow] select-none after:absolute after:-inset-2 hover:ring-3 focus-visible:ring-3 focus-visible:outline-hidden active:ring-3 disabled:pointer-events-none disabled:opacity-50",
            thumbVariants[variant]
          )}
        />
      ))}
    </SliderPrimitive.Root>
  )
}

export { Slider }
