const axios = require('axios');
const fs = require('fs');
const path = require('path');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const raw = fs.readFileSync(filePath, 'utf8');
  raw.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const idx = trimmed.indexOf('=');
    if (idx === -1) return;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    value = value.replace(/^['"]|['"]$/g, '');
    if (!process.env[key]) process.env[key] = value;
  });
}

loadEnvFile(path.join(__dirname, '..', '.env.local'));
loadEnvFile(path.join(__dirname, '..', '.env'));

async function sync() {
  const baseUrl =
    process.env.MARKET_SERVICE_URL ||
    process.env.MARKET_ENGINE_URL ||
    'http://127.0.0.1:3003';
  const jwt = process.env.AI_AGENT_JWT || process.env.ADMIN_JWT || '';

  if (!jwt) {
    console.error('AI_AGENT_JWT (or ADMIN_JWT) is required to run manual Polymarket sync.');
    process.exit(1);
  }

  try {
    console.log('Triggering Polymarket sync...');
    const response = await axios.post(
      `${baseUrl.replace(/\\/+$/, '')}/polymarket/sync`,
      {},
      { headers: { Authorization: `Bearer ${jwt}` } },
    );
    console.log('Sync complete:', response.data);
  } catch (error) {
    const message = error?.response?.data || error.message;
    console.error('Sync failed:', message);
  }
}

sync();
