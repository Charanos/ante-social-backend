const axios = require('axios');

async function testEndpoint(name, url, params) {
  try {
    const res = await axios.get(url, { params });
    console.log(`[SUCCESS] ${name} -> ${res.status}`);
  } catch (err) {
    const status = err?.response?.status;
    const data = JSON.stringify(err?.response?.data);
    console.error(`[ERROR] ${name} -> ${status} - ${data}`);
  }
}

async function run() {
  const base = 'https://gamma-api.polymarket.com';
  
  await testEndpoint('trending', `${base}/markets`, { active: true, limit: 40, order: 'volume', ascending: false });
}

run();
