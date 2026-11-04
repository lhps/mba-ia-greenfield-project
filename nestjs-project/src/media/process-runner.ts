import { Injectable } from '@nestjs/common';
import { spawn } from 'node:child_process';

const STDERR_TAIL_CHARS = 2000;

export interface ProcessResult {
  stdout: string;
  stderr: string;
}

export class MediaProcessError extends Error {
  constructor(
    public readonly cmd: string,
    public readonly exitCode: number | null,
    public readonly stderrTail: string,
    reason: string,
  ) {
    super(`${cmd} ${reason}: ${stderrTail}`);
    this.name = 'MediaProcessError';
  }
}

/** Thin wrapper over child_process.spawn (no shell) with timeout and typed failures. */
@Injectable()
export class ProcessRunner {
  run(
    cmd: string,
    args: string[],
    options: { timeoutMs: number },
  ): Promise<ProcessResult> {
    return new Promise((resolve, reject) => {
      const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';
      let timedOut = false;

      const timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGKILL');
      }, options.timeoutMs);

      child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()));
      child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
      child.on('error', (error) => {
        clearTimeout(timer);
        reject(
          new MediaProcessError(cmd, null, error.message, 'failed to start'),
        );
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        const tail = stderr.slice(-STDERR_TAIL_CHARS);
        if (timedOut) {
          reject(
            new MediaProcessError(
              cmd,
              code,
              tail,
              `timed out after ${options.timeoutMs}ms`,
            ),
          );
        } else if (code !== 0) {
          reject(
            new MediaProcessError(cmd, code, tail, `exited with code ${code}`),
          );
        } else {
          resolve({ stdout, stderr });
        }
      });
    });
  }
}
