import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, '..');
const backendSource = path.join(projectRoot, 'backend');
const runtimeDir = '/tmp/crypto-copilot-backend-run';

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', ...options });
    child.on('exit', code => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(' ')} exited with ${code}`));
    });
    child.on('error', reject);
  });
}

if (!existsSync(backendSource)) {
  console.error(`Backend folder not found: ${backendSource}`);
  process.exit(1);
}

await run('rm', ['-rf', runtimeDir]);
await run('rsync', ['-a', '--exclude', 'node_modules', '--exclude', 'dist', `${backendSource}/`, `${runtimeDir}/`]);
await run('npm', ['install', '--prefix', runtimeDir]);

const backend = spawn('npm', ['run', 'dev', '--prefix', runtimeDir], { stdio: 'inherit' });

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    backend.kill(signal);
    process.exit();
  });
}

backend.on('exit', code => process.exit(code ?? 0));
