---
libs:
  "radix-ui":
    version: "^1.4.3"
    context7_id: "/websites/radix-ui_primitives"
    fetched_at: "2026-11-09T18:17:58-03:00"
sources_mtime:
  docs/decisions/technical-decisions-phase-05-video-watch-frontend.md: "2026-11-09T18:17:32-03:00"
  docs/phases/phase-05-video-watch/library-refs.md: "2026-11-06T18:52:00-03:00"
---

# Library References — phase-05-video-watch-frontend

## radix-ui

Used by phase-05-video-watch-frontend/TD-03: the player's progress bar and volume slider. `next-frontend` already has the unified `radix-ui` package (`^1.4.3`), so nothing new gets installed. Wrap it once as `components/ui/slider.tsx` (shadcn style). The timeline and the volume control both use that wrapper.

### Import

Import from the unified package as a namespace, not from the legacy per-primitive `@radix-ui/react-slider` package:

```tsx
import { Slider } from "radix-ui";

<Slider.Root defaultValue={[50]} step={10}>
  <Slider.Track>
    <Slider.Range />
  </Slider.Track>
  <Slider.Thumb />
</Slider.Root>
```

### Slider.Root props relevant here

| Prop | Type | Default | Player usage |
| --- | --- | --- | --- |
| `value` | `number[]` | — | Controlled: `[currentTime]` for the timeline, `[volume]` for volume |
| `onValueChange` | `(value: number[]) => void` | — | While dragging: update the displayed time or the live volume |
| `onValueCommit` | `(value: number[]) => void` | — | On release: seek (`video.currentTime = v[0]`) |
| `min` / `max` | `number` | `0` / `100` | Timeline `max = duration` (seconds). Volume `max = 1` |
| `step` | `number` | `1` | Timeline `step = 1` (or 0.1). Volume `step = 0.05` |
| `disabled` | `boolean` | `false` | Disable the timeline until `loadedmetadata` gives a finite `duration` |
| `orientation` | `"horizontal" \| "vertical"` | `"horizontal"` | Both horizontal (the volume slider is revealed inline on hover/focus) |

Data attributes for styling (no class assertions in tests): `[data-disabled]` (present when disabled), `[data-orientation]`.

### Parts

- `Slider.Track`: the bar. It contains `Slider.Range`.
- `Slider.Range`: the filled part, which must live inside `Slider.Track`. The Figma "loaded" (buffered) layer is not a Radix part. Render it as a sibling element inside the Track, absolutely positioned, with its width taken from `video.buffered`.
- `Slider.Thumb`: the draggable handle. It renders with `role="slider"` and the ARIA value attributes, and has built-in arrow/Home/End/PageUp/PageDown keyboard handling. Give each thumb an accessible name (`aria-label="Seek"` / `aria-label="Volume"`), and for the timeline set `aria-valuetext` to the formatted time (e.g. "0:20 of 4:56").

### Notes for the player hook

- Drive the slider from the `<video>` element's events: `timeupdate` for `currentTime`, `loadedmetadata`/`durationchange` for `duration`, `progress` for `buffered`, and `volumechange` for `volume`/`muted`. Keep the media element as the source of truth.
- While the user is dragging the timeline (`onValueChange` fired, `onValueCommit` not yet), ignore `timeupdate` writes so the thumb does not jump back.
