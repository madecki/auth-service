'use strict';

const { spawnSync } = require('child_process');

function resolvePort() {
  const raw =
    process.env.npm_package_config_port || process.argv[2] || '4001';
  const port = Number.parseInt(String(raw), 10);
  if (!Number.isFinite(port) || port < 1 || port > 65535) {
    return 4001;
  }
  return port;
}

const port = resolvePort();

if (process.platform === 'win32') {
  const ps = [
    'Get-NetTCPConnection',
    `-LocalPort ${port}`,
    '-State Listen',
    '-ErrorAction SilentlyContinue',
    '| Select-Object -ExpandProperty OwningProcess',
    '| Sort-Object -Unique',
    '| ForEach-Object {',
    'try { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue } catch {}',
    '}',
  ].join(' ');
  spawnSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', ps],
    { stdio: 'ignore', windowsHide: true },
  );
} else {
  spawnSync(
    'sh',
    [
      '-c',
      `lsof -ti:${port} | xargs kill 2>/dev/null; sleep 1; lsof -ti:${port} | xargs kill -9 2>/dev/null || true`,
    ],
    { stdio: 'ignore' },
  );
}
