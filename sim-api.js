const axios = require('axios');
require('dotenv').config();

async function simulateApi() {
    const baseUrl = process.env.VITE_API_URL || 'http://localhost:5000';
    console.log(`Simulating request to ${baseUrl}`);

    try {
        // We need a token. I'll steal one from a user if possible, 
        // but for now let's just test if the endpoint itself crashes early.
        // Actually, without protect, it won't hit the controller.
        
        console.log('\n[INFO] This script requires a valid JWT token to test "Private" routes.');
        console.log('[INFO] If you have a token from telentcio-demo, paste it in .env as TEST_TOKEN.\n');

        const token = process.env.TEST_TOKEN;
        if (!token) {
            console.log('[FAIL] No token found. Skipping authenticated test.');
            process.exit(1);
        }

        const config = {
            headers: {
                'Authorization': `Bearer ${token}`,
                'x-tenant-id': 'telentcio-demo'
            }
        };

        console.log('Fetching /api/leaves/config...');
        const res = await axios.get(`${baseUrl}/api/leaves/config`, config);
        console.log('[SUCCESS] Status:', res.status);
        console.log('[DATA] Count:', res.data.length);

        console.log('\nTesting POST /api/leaves/config (Seed)...');
        const seedRes = await axios.post(`${baseUrl}/api/leaves/config/seed`, {}, config);
        console.log('[SUCCESS] Seed Status:', seedRes.status);

        process.exit(0);
    } catch (err) {
        console.error('\n[ERROR] API Call Failed!');
        if (err.response) {
            console.error('Status:', err.response.status);
            console.error('Data:', JSON.stringify(err.response.data, null, 2));
        } else {
            console.error(err.message);
        }
        process.exit(1);
    }
}

simulateApi();
