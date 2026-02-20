const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// Test Connection safely
if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
    cloudinary.api.ping((error, result) => {
        if (error) {
            console.error('Cloudinary Connection Failed:', error);
        } else {
            console.log('Cloudinary Connection Successful:', result);
        }
    });
} else {
    console.warn('⚠️  Cloudinary environment variables are missing! Uploads will fail.');
}

// Storage for all document uploads (employee dossier, resumes, etc.)
const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: async (req, file) => {
        let folderName = 'employee_dossier'; // Default folder

        if (file.fieldname === 'resume') {
            folderName = 'resumes';
        }

        return {
            folder: folderName,
            resource_type: 'auto',
            public_id: file.originalname.split('.')[0] + '-' + Date.now(), // Ensure unique filenames
        };
    },
});

const upload = multer({ storage: storage });

module.exports = { upload, cloudinary };
