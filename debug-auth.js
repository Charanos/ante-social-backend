const http = require('http');

function testLogin(url) {
  return new Promise((resolve) => {
    const started = Date.now();
    const req = http.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve(`[RES] ${url} -> ${res.statusCode} in ${Date.now() - started}ms. Body: ${data}`);
      });
    });
    req.on('error', (e) => resolve(`[ERR] ${url} -> ${e.message}`));
    req.write(JSON.stringify({email: "test@test.com", password: "test"}));
    req.end();
  });
}

async function run() {
  console.log(await testLogin('http://127.0.0.1:3002/auth/login'));
}

run();
