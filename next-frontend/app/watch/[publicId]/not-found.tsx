import Link from "next/link"

import { buttonVariants } from "@/components/ui/button"

// Unknown public_id or a draft the caller cannot read (per phase-05-video-watch-frontend/TD-01 revision).
export default function VideoNotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 bg-background px-6 py-20 text-center">
      <h1 className="text-h1 text-foreground">This video isn&apos;t available</h1>
      <Link href="/" className={buttonVariants({ variant: "secondary", size: "md" })}>
        Go to home
      </Link>
    </main>
  )
}
