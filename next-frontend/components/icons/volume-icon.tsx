import * as React from "react"
import { cn } from "@/lib/utils"

// Figma asset: "Sound button" (I152:2323;108:266).
function VolumeIcon({ className, ...props }: React.ComponentProps<"svg">) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 36 36"
      fill="currentColor"
      aria-hidden="true"
      className={cn(className)}
      {...props}
    >
      <path d="M7 21.4208H11.4444L17 27.122V8.87799L11.4444 14.5792H7V21.4208ZM19.2222 13.439V22.561C20.8667 21.7856 22 20.0182 22 18C22 16.016 20.8667 14.2828 19.2222 13.439ZM19.2222 10.3489C22.4333 11.3295 24.7778 14.3854 24.7778 18C24.7778 21.6146 22.4333 24.6705 19.2222 25.6511V28C23.6778 26.9624 27 22.8803 27 18C27 13.1197 23.6778 9.03763 19.2222 8V10.3489Z" />
    </svg>
  )
}

export { VolumeIcon }
