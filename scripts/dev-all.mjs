import { spawn } from 'node:child_process';

const children = [
  spawn('npm', ['run', 'dev:backend'], { stdio: 'inherit' }),
  spawn('npm', ['run', 'dev:web'], { stdio: 'inherit' }),
];

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    for (const child of children) child.kill(signal);
    process.exit();
  });
}

for (const child of children) {
  child.on('exit', code => {
    if (code && code !== 0) {
      for (const other of children) {
        if (other !== child) other.kill('SIGTERM');
      }
      process.exit(code);
    }
  });
}
