import * as React from "react"
import { cn } from "@/lib/utils"

// No Figma asset for Download (button added by the inventory decision); Material "download" glyph.
function DownloadIcon({ className, ...props }: React.ComponentProps<"svg">) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={cn(className)}
      {...props}
    >
      <path d="M5 20h14v-2H5v2zm14-9h-4V3H9v8H5l7 7 7-7z" />
    </svg>
  )
}

export { DownloadIcon }
