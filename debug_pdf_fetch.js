require('dotenv').config();
const axios = require('axios');
const { cloudinary } = require('./src/config/cloudinary');
const { extractPublicIdFromUrl } = require('./src/utils/cloudinaryHelper');

// The new URL provided by user logs
const targetUrl = "https://res.cloudinary.com/dgbbxl3du/image/upload/v1770184147/employee_dossier/rwyll2s0ovimjdlg55gj.pdf";

console.log('--- Env Check ---');
console.log('Cloud Name:', process.env.CLOUDINARY_CLOUD_NAME);
console.log('API Key:', process.env.CLOUDINARY_API_KEY ? '******' + process.env.CLOUDINARY_API_KEY.slice(-4) : 'UNDEFINED');
console.log('API Secret:', process.env.CLOUDINARY_API_SECRET ? 'DEFINED' : 'UNDEFINED');
console.log('-----------------\n');

async function testLogic() {
    console.log('Testing Logic for:', targetUrl);

    // Logic mirror from dossierController.js
    const candidates = [];
    candidates.push(targetUrl);

    let alternateUrl = null;
    if (targetUrl.includes('/image/upload/')) {
        alternateUrl = targetUrl.replace('/image/upload/', '/raw/upload/');
    }
    if (alternateUrl) candidates.push(alternateUrl);

    // Extract valid version
    const versionMatch = targetUrl.match(/\/upload\/v(\d+)\//);
    const version = versionMatch ? versionMatch[1] : undefined;
    console.log('Extracted Version:', version);

    // Signed
    const publicId = extractPublicIdFromUrl(targetUrl);
    console.log('Extracted Public ID:', publicId);

    if (publicId) {
        // 1. Signed Upload (Type: upload) - Most likely for restricted public files
        const signedUpload = cloudinary.url(publicId, {
            resource_type: 'image',
            secure: true, sign_url: true,
            type: 'upload', // Explicitly verify 'upload'
            version: version,
            format: 'pdf'
        });
        candidates.push(signedUpload);

        // 2. Signed Authenticated (Type: authenticated)
        const signedAuth = cloudinary.url(publicId, {
            resource_type: 'image',
            secure: true, sign_url: true, type: 'authenticated',
            version: version,
            format: 'pdf'
        });
        candidates.push(signedAuth);

        // 3. Raw/Alternate variants
        const signedRawUpload = cloudinary.url(publicId, {
            resource_type: 'raw',
            secure: true, sign_url: true,
            type: 'upload',
            version: version,
            format: 'pdf'
        });
        candidates.push(signedRawUpload);
    }

    console.log('\nCandidates to try:');
    candidates.forEach(c => console.log(c));
    console.log('\n--- Starting Fetch Attempts ---');

    for (const url of candidates) {
        console.log(`\nFetching: ${url}`);
        try {
            const res = await axios.get(url, {
                validateStatus: s => true,
                responseType: 'arraybuffer', // Change to arraybuffer to inspect bytes
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                    'Referer': 'https://res.cloudinary.com/'
                }
            });
            console.log(`Status: ${res.status} ${res.statusText}`);
            console.log(`Content-Type: ${res.headers['content-type']}`);
            console.log(`Content-Length: ${res.headers['content-length'] || res.data.length}`);

            const firstBytes = res.data.slice(0, 10).toString();
            console.log(`First Bytes: ${firstBytes}`);

            if (firstBytes.includes('%PDF')) {
                console.log('>>> SUCCESS! It IS a PDF despite headers.');
                return;
            }

        } catch (err) {
            console.log('Error:', err.message);
        }
    }
    console.log('>>> FAILURE. No candidate worked.');
}

testLogic();

async function listResources() {
    console.log('Listing resources in folder: employee_dossier');
    try {
        // We need to use Search API or Resources API
        // Try Search for specific filename or folder
        const result = await cloudinary.search
            .expression('folder:employee_dossier')
            .sort_by('created_at', 'desc')
            .max_results(10)
            .execute();

        console.log('Found Resources:', result.total_count);
        result.resources.forEach(res => {
            console.log('\n--- Resource ---');
            console.log('Public ID:', res.public_id);
            console.log('Type:', res.type);
            console.log('Format:', res.format);
            console.log('Access Mode:', res.access_mode);
            console.log('URL:', res.secure_url);
            console.log('Created:', res.created_at);
        });

    } catch (err) {
        console.error('List Resources Error:', err.message);
    }
}

listResources();
