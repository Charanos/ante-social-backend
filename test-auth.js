const http = require('http');

const testLogin = async () => {
  const data = JSON.stringify({ email: 'test@test.com', password: 'wrong' });
  const req = http.request({
    hostname: '127.0.0.1',
    port: 3002,
    path: '/auth/login',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': data.length }
  }, (res) => {
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => console.log('Login Result:', res.statusCode, body));
  });
  req.on('error', e => console.error('Login Error:', e));
  req.write(data);
  req.end();
};

const testGoogle = async () => {
  const data = JSON.stringify({ email: 'test@test.com', googleId: '123', fullName: 'test' });
  const req = http.request({
    hostname: '127.0.0.1',
    port: 3002,
    path: '/auth/google',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': data.length }
  }, (res) => {
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => console.log('Google Result:', res.statusCode, body));
  });
  req.on('error', e => console.error('Google Error:', e));
  req.write(data);
  req.end();
};

testLogin();
testGoogle();
