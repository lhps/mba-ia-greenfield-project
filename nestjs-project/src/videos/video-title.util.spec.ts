import {
  deriveTitleFromFileName,
  VIDEO_TITLE_MAX_LENGTH,
} from './video-title.util';

describe('deriveTitleFromFileName', () => {
  it('should strip the extension', () => {
    expect(deriveTitleFromFileName('Minha viagem.mp4')).toBe('Minha viagem');
  });

  it('should strip only the last extension', () => {
    expect(deriveTitleFromFileName('clip.final.v2.webm')).toBe('clip.final.v2');
  });

  it('should keep a file name without extension as is', () => {
    expect(deriveTitleFromFileName('README')).toBe('README');
  });

  it('should use the whole file name for a dotfile whose stripped result is empty', () => {
    expect(deriveTitleFromFileName('.mp4')).toBe('.mp4');
  });

  it('should truncate the title to 100 characters', () => {
    const fileName = `${'a'.repeat(150)}.mp4`;

    const title = deriveTitleFromFileName(fileName);

    expect(title).toHaveLength(VIDEO_TITLE_MAX_LENGTH);
    expect(title).toBe('a'.repeat(VIDEO_TITLE_MAX_LENGTH));
  });

  it('should truncate a long dotfile-only name to 100 characters', () => {
    const fileName = `.${'b'.repeat(120)}`;

    expect(deriveTitleFromFileName(fileName)).toBe(
      fileName.slice(0, VIDEO_TITLE_MAX_LENGTH),
    );
  });
});
