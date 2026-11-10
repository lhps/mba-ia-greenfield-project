import * as React from "react"
import { cn } from "@/lib/utils"

// Figma asset: "Play button" (I152:2323;108:262).
function PlayIcon({ className, ...props }: React.ComponentProps<"svg">) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 36 36"
      fill="currentColor"
      aria-hidden="true"
      className={cn(className)}
      {...props}
    >
      <path d="M10 29L19 23.75V13.25L10 8V29ZM19 23.75L28 18.5L19 13.25V23.75Z" />
    </svg>
  )
}

export { PlayIcon }
