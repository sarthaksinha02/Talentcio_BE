const http = require('http');

const data = JSON.stringify({
  email: 'admin@gmail.com',
  password: 'Admin@123'
});

const options = {
  hostname: 'localhost',
  port: 5000,
  path: '/api/auth/login',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

const fs = require('fs');
const logFile = 'debug_login_out.txt';

const req = http.request(options, (res) => {
  console.log(`STATUS: ${res.statusCode}`);
  fs.writeFileSync(logFile, `STATUS: ${res.statusCode}\n`);
  
  let body = '';
  res.on('data', (d) => {
    body += d;
  });
  res.on('end', () => {
    console.log('RESPONSE:', body);
    fs.appendFileSync(logFile, 'RESPONSE: ' + body + '\n');
  });
});

req.on('error', (e) => {
  console.error(`problem with request: ${e.message}`);
  fs.writeFileSync(logFile, `ERROR: ${e.message}\n`);
});

req.write(data);
req.end();
