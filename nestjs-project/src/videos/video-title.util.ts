export const VIDEO_TITLE_MAX_LENGTH = 100;

/**
 * Default draft title: the file name without its last extension, truncated to
 * 100 chars. Falls back to the whole file name when stripping leaves nothing
 * (e.g. `.mp4`). Mirrors the backfill in the AddVideoChannelManagement migration.
 */
export function deriveTitleFromFileName(fileName: string): string {
  const stripped = fileName.replace(/\.[^.]*$/, '');
  const base = stripped === '' ? fileName : stripped;
  return base.slice(0, VIDEO_TITLE_MAX_LENGTH);
}
