---
kind: drift-report
phase: phase-05-video-watch-frontend
plan_mtime: "2026-11-10T09:23:11-03:00"
---

# phase-05-video-watch-frontend — Drift Report

## Screen: pagina-de-visualizacao-do-video — audited at SI-05.9.0 (2026-11-10)

**Quick scan:** 2 alinhado · 2 drift menor · 5 drift relevante · 0 ausente

- VideoPlayer (`video-player.tsx`) → `drift relevante` (8 changes)
- Slider (`slider.tsx`) → `drift relevante` (2 changes)
- VideoInfo (`video-info.tsx`) → `drift menor` (4 changes)
- Avatar (`avatar.tsx`) → `drift relevante`
- Button (`button.tsx`) → `alinhado`
- VideoDescription (`video-description.tsx`) → `drift relevante` (5 changes)
- Card (`card.tsx`) → `alinhado`
- SuggestedVideos (`suggested-videos.tsx`) → `drift menor`
- VideoCard (`video-card.tsx`) → `drift relevante` (5 changes)

### next-frontend/components/video/video-player.tsx — VideoPlayer

- **Status:** drift relevante
- **Decision:** `auto-Edit`
  - retune radius: base — rounded-[var(--radius-3)] → rounded-[var(--radius-4)]
  - retune shadow: base — none → shadow-card
  - retune background: base — bg-almost-black-1000 → bg-neutral-1000
  - retune controls background: base — bg-overlay strip → transparent (Figma controls sit directly on the video, I152:2323;108:248/259)
  - retune controls row: base — gap-1 px-3 → gap-4 px-5 (Figma 18px gap / 22px inset; nearest spacing tokens)
  - retune control size: base — IconButton size sm (size-8, svg size-4) → 36px controls (size-9, svg size-9)
  - retune timestamp typography: base — text-caption → text-overlay
  - +asset 'Play button' and 'Sound button' from Figma demand (replace `components/icons/play-icon.tsx` and `components/icons/volume-icon.tsx` paths with the Figma SVGs; pause / muted states keep the existing icons — not designed in Figma)
- **Prior:** _(none)_

### next-frontend/components/ui/slider.tsx — Slider

- **Status:** drift relevante
- **Decision:** `auto-Edit`
  - +variant 'timeline' from Figma demand — track 3px tall, track and range in white (`bg-neutral-100`), thumb 16px white circle (`size-4`, no border), used by the progress bar and the volume control on the dark player surface
  - +prop 'aria-label' forwarded to `SliderPrimitive.Thumb` (a11y demand from library-refs `radix-ui`: the thumb carries `role="slider"`; the wrapper currently puts `aria-label` on the Root, leaving the thumb unnamed)
- **Prior:** _(none)_

### next-frontend/components/video/video-info.tsx — VideoInfo

- **Status:** drift menor
- **Decision:** `auto-Edit`
  - retune title typography: base — text-h2 → text-h1 (Figma Inter/Heading/H1 24/32/700)
  - retune block gap: base — gap-3 → gap-3.5 (Figma 14px)
  - retune channel name typography: base — text-label-lg → text-h3 (Figma Inter/Heading/H3 18/28/600)
  - retune avatar size: base — Avatar size 'lg' → size 'md' per Figma 'md' 40px demand (depends on the Avatar row below)
- **Prior:** _(none)_

### next-frontend/components/ui/avatar.tsx — Avatar

- **Status:** drift relevante
- **Decision:** `auto-Edit`
  - +size 'md' from Figma demand — 40px (`size-10`; Figma Avatar sizes sm 32 / md 40 / lg 64 / xl 96 / 2xl 128 do not map to the shadcn default/sm/lg names)
- **Prior:** _(none)_

### next-frontend/components/ui/button.tsx — Button

- **Status:** alinhado
- **Decision:** `skip`
- **Prior:** _(none)_

### next-frontend/components/video/video-description.tsx — VideoDescription

- **Status:** drift relevante
- **Decision:** `auto-Edit`
  - retune background: base — bg-muted → Card default bg-card (Figma Card 158:4025 uses `--card` + `--border`)
  - retune padding: base — p-3 → p-3.5 (Figma 14px)
  - retune meta row typography: base — text-label-md → text-body-lg (Figma 16/24/400)
  - retune description typography: base — text-body-md → text-body-lg (Figma 16/24/400)
  - retune toggle typography: base — text-label-md → text-body-lg (Figma "Show More" 16/24/400)
- **Prior:** _(none)_

### next-frontend/components/ui/card.tsx — Card

- **Status:** alinhado
- **Decision:** `skip`
- **Prior:** _(none)_

### next-frontend/components/video/suggested-videos.tsx — SuggestedVideos

- **Status:** drift menor
- **Decision:** `auto-Edit`
  - retune list gap: base — gap-2 → gap-4 (Figma 16px between cards)
- **Prior:** _(none)_

### next-frontend/components/video/video-card.tsx — VideoCard

- **Status:** drift relevante
- **Decision:** `auto-Edit`
  - retune card gap: base — gap-2 → gap-2.5 (Figma 10px)
  - retune thumbnail width: base — w-40 fixed → flex-1 (Figma thumbnail fills the space left by the 180px text column)
  - retune duration badge colors: base — bg-overlay text-primary-foreground → bg-background text-foreground
  - retune title typography: base — text-label-md → text-body-md (Figma Inter/Body/MD 14/20/400)
  - retune meta typography: base — text-caption → text-body-md (Figma views • date line 14/20 muted)
- **Prior:** _(none)_
