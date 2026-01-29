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

            // 2. Get Current Timesheet
            const req2 = http.request({
                hostname: 'localhost',
                port: 5000,
                path: '/api/timesheet/current',
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            }, (res2) => {
                console.log(`GET STATUS: ${res2.statusCode}`);
                let body2 = '';
                res2.on('data', d => body2 += d);
                res2.on('end', () => console.log('RESPONSE:', body2));
            });
            req2.end();
        });
    });
    loginReq.write(loginData);
    loginReq.end();
};

runDebug();
