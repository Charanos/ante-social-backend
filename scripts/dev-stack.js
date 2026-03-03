const { spawn } = require('child_process');

const services = [
  { name: 'api-gateway', color: '\x1b[36m' },
  { name: 'auth-service', color: '\x1b[32m' },
  { name: 'market-engine', color: '\x1b[35m' },
  { name: 'wallet-service', color: '\x1b[33m' },
  { name: 'notification-service', color: '\x1b[34m' },
  { name: 'websocket-gateway', color: '\x1b[96m' },
  { name: 'admin-service', color: '\x1b[92m' },
  { name: 'reputation-engine', color: '\x1b[95m' },
];

const resetColor = '\x1b[0m';
const children = [];
let shuttingDown = false;
let exitCode = 0;

process.stdout.write('Starting backend services in watch mode...\n');

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
    if (!child.killed) {
      child.kill(signal);
    }
  }

  setTimeout(() => process.exit(exitCode), 500);
}

for (const service of services) {
  const command = `npx nest start ${service.name} --watch`;
  process.stdout.write(`${service.color}[launcher]${resetColor} ${command}\n`);

  const child = spawn(command, {
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
