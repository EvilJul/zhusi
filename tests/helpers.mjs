import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const cliPath = path.join(root, 'dist', 'cli', 'index.js');

export async function makeTempDir(prefix = 'zhusi-test-') {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

export async function cleanup(dir) {
  await rm(dir, { recursive: true, force: true, maxRetries: 3 });
}

export function runCli(args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [cliPath, ...args], {
      cwd: options.cwd ?? root,
      env: { ...process.env, ...options.env },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('close', (code) => resolve({ code, stdout, stderr }));
    if (options.stdin !== undefined) child.stdin.end(options.stdin);
  });
}

export const repoRoot = root;
