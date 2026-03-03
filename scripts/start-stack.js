const { spawn } = require('child_process');
const path = require('path');

const services = [
  { name: 'api-gateway', entry: 'apps/api-gateway/src/main.js', color: '\x1b[36m' },
  { name: 'auth-service', entry: 'apps/auth-service/src/main.js', color: '\x1b[32m' },
  { name: 'market-engine', entry: 'apps/market-engine/src/main.js', color: '\x1b[35m' },
  { name: 'wallet-service', entry: 'apps/wallet-service/src/main.js', color: '\x1b[33m' },
  { name: 'notification-service', entry: 'apps/notification-service/src/main.js', color: '\x1b[34m' },
  { name: 'websocket-gateway', entry: 'apps/websocket-gateway/src/main.js', color: '\x1b[96m' },
  { name: 'admin-service', entry: 'apps/admin-service/src/main.js', color: '\x1b[92m' },
  { name: 'reputation-engine', entry: 'apps/reputation-engine/src/main.js', color: '\x1b[95m' },
];

const resetColor = '\x1b[0m';
const children = [];
let shuttingDown = false;
let exitCode = 0;

process.stdout.write('Starting backend services in production mode...\n');

function prefixStream(stream, service) {
  let buffer = '';
  stream.on('data', (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.trim()) continue;
      process.stdout.write(`${service.color}[${service.name}]${resetColor} ${line}\n`);
    }
  });

  stream.on('end', () => {
    if (!buffer.trim()) return;
    process.stdout.write(`${service.color}[${service.name}]${resetColor} ${buffer}\n`);
  });
}

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;

  for (const child of children) {
    if (!child.killed) child.kill(signal);
  }

  setTimeout(() => process.exit(exitCode), 500);
}

for (const service of services) {
  const entryPath = path.join(process.cwd(), 'dist', 'out-tsc', service.entry);
  const child = spawn(`node "${entryPath}"`, {
    cwd: process.cwd(),
    env: process.env,
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  children.push(child);
  prefixStream(child.stdout, service);
  prefixStream(child.stderr, service);

  child.on('exit', (code, signal) => {
    if (shuttingDown) return;
    if (code && code !== 0) {
      exitCode = code;
      process.stderr.write(
        `${service.color}[${service.name}]${resetColor} exited unexpectedly with code ${code}.\n`,
      );
      shutdown(signal || 'SIGTERM');
    }
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
