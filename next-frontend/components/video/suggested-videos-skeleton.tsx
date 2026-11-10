import { cn } from "@/lib/utils"

// Suspense fallback for the suggestions sidebar (per phase-05-video-watch-frontend/TD-02).
function SuggestedVideosSkeleton({ count = 5, className }: { count?: number; className?: string }) {
  return (
    <div
      aria-hidden="true"
      data-slot="suggested-videos-skeleton"
      className={cn("flex flex-col gap-4", className)}
    >
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex gap-2.5">
          <div className="aspect-video min-w-0 flex-1 animate-pulse rounded-[var(--radius-2)] bg-muted" />
          <div className="flex w-45 shrink-0 flex-col gap-2">
            <div className="h-4 w-full animate-pulse rounded-[var(--radius-1)] bg-muted" />
            <div className="h-4 w-2/3 animate-pulse rounded-[var(--radius-1)] bg-muted" />
          </div>
        </div>
      ))}
    </div>
  )
}

export { SuggestedVideosSkeleton }
