"use client"

import * as React from "react"

import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"

type VideoDescriptionProps = {
  metaLabel: string
  description: string
  className?: string
}

// Description card (Figma 152:2487): meta row + text clamped to 3 lines; "Show more"/"Show less"
// only when the clamped text overflows (per phase-05-video-watch-frontend/TD-02 revision OQ-8).
function VideoDescription({ metaLabel, description, className }: VideoDescriptionProps) {
  const textRef = React.useRef<HTMLParagraphElement>(null)
  const textId = React.useId()
  const [expanded, setExpanded] = React.useState(false)
  const [overflows, setOverflows] = React.useState(false)

  React.useLayoutEffect(() => {
    const el = textRef.current
    if (!el || expanded) return

    const measure = () => setOverflows(el.scrollHeight > el.clientHeight)
    measure()

    if (typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [description, expanded])

  return (
    <Card className={cn("gap-2 p-3.5", className)}>
      <p className="text-body-lg text-foreground">{metaLabel}</p>
      {description ? (
        <p
          ref={textRef}
          id={textId}
          className={cn(
            "text-body-lg whitespace-pre-line text-foreground",
            !expanded && "line-clamp-3"
          )}
        >
          {description}
        </p>
      ) : null}
      {description && (overflows || expanded) ? (
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={textId}
          onClick={() => setExpanded((value) => !value)}
          className="self-start text-body-lg text-foreground outline-none hover:underline focus-visible:underline"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      ) : null}
    </Card>
  )
}

export { VideoDescription }
export type { VideoDescriptionProps }
