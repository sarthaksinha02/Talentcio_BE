const http = require('http');

const loginData = JSON.stringify({
  email: 'admin@techcorp.com',
  password: 'password123'
});

const runDebug = () => {
    // 1. Login
    const loginReq = http.request({
        hostname: 'localhost',
        port: 5000,
        path: '/api/auth/login',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': loginData.length }
    }, (res) => {
        let body = '';
        res.on('data', d => body += d);
        res.on('end', () => {
            const token = JSON.parse(body).token;
            console.log('Got Token');
            
            // 2. Test Project Route
            const req2 = http.request({
                hostname: 'localhost',
                port: 5000,
                path: '/api/projects/business-units',
                method: 'GET',
                headers: { 
                    'Authorization': `Bearer ${token}`
                }
            }, (res2) => {
                console.log(`GET BusinessUnits STATUS: ${res2.statusCode}`);
                if (res2.statusCode === 404) {
                    console.error('Route NOT FOUND');
                } else {
                    console.log('Route Found!');
                }
            });
            req2.end();
        });
    });
    loginReq.write(loginData);
    loginReq.end();
};

runDebug();
