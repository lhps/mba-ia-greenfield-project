import { cn } from "@/lib/utils"

type VideoStatusPlaceholderProps = {
  status: "processing" | "failed"
  className?: string
}

// Shown instead of the player for the owner's draft that is not ready yet: no stream fetch,
// no view call (per phase-05-video-watch-frontend/TD-03 revision).
function VideoStatusPlaceholder({ status, className }: VideoStatusPlaceholderProps) {
  return (
    <div
      role="status"
      data-slot="video-status-placeholder"
      data-status={status}
      className={cn(
        "flex aspect-video w-full items-center justify-center rounded-[var(--radius-4)] bg-neutral-1000 shadow-card",
        className
      )}
    >
      <p className="text-label-lg text-primary-foreground">
        {status === "processing" ? "Processing…" : "Processing failed"}
      </p>
    </div>
  )
}

export { VideoStatusPlaceholder }
export type { VideoStatusPlaceholderProps }
