import { EventEmitter } from 'node:events';
import { MediaProcessError, ProcessRunner } from './process-runner';

jest.mock('node:child_process', () => ({ spawn: jest.fn() }));
import { spawn } from 'node:child_process';

class FakeChild extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  kill = jest.fn(() => this.emit('close', null));
}

describe('ProcessRunner', () => {
  const runner = new ProcessRunner();
  let child: FakeChild;

  beforeEach(() => {
    jest.useRealTimers();
    child = new FakeChild();
    (spawn as jest.Mock).mockReturnValue(child);
  });

  it('should resolve with stdout/stderr on exit 0 and spawn without a shell', async () => {
    const promise = runner.run('ffprobe', ['-v', 'error'], { timeoutMs: 1000 });
    child.stdout.emit('data', Buffer.from('{"ok":true}'));
    child.emit('close', 0);

    await expect(promise).resolves.toEqual({
      stdout: '{"ok":true}',
      stderr: '',
    });
    expect(spawn).toHaveBeenCalledWith('ffprobe', ['-v', 'error'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  });

  it('should reject with MediaProcessError carrying the exit code and stderr tail', async () => {
    const promise = runner.run('ffmpeg', [], { timeoutMs: 1000 });
    child.stderr.emit('data', Buffer.from('Invalid data found'));
    child.emit('close', 1);

    await expect(promise).rejects.toMatchObject({
      name: 'MediaProcessError',
      cmd: 'ffmpeg',
      exitCode: 1,
      stderrTail: 'Invalid data found',
    });
  });

  it('should kill the process and reject on timeout', async () => {
    jest.useFakeTimers();
    const promise = runner.run('ffmpeg', [], { timeoutMs: 50 });
    jest.advanceTimersByTime(50);

    await expect(promise).rejects.toBeInstanceOf(MediaProcessError);
    expect(child.kill).toHaveBeenCalledWith('SIGKILL');
  });
});
