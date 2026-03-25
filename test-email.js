const nodemailer = require('nodemailer');
require('dotenv').config();

const testEmail = async () => {
    console.log('--- Brevo SMTP Test Started ---');
    console.log('EMAIL_HOST:', process.env.EMAIL_HOST || 'smtp-relay.brevo.com');
    console.log('EMAIL_PORT:', process.env.EMAIL_PORT || 587);
    console.log('EMAIL_USER:', process.env.EMAIL_USER);
    console.log('EMAIL_FROM:', process.env.EMAIL_FROM);
    
    const transporter = nodemailer.createTransport({
        host: process.env.EMAIL_HOST || 'smtp-relay.brevo.com',
        port: parseInt(process.env.EMAIL_PORT) || 587,
        secure: parseInt(process.env.EMAIL_PORT) === 465,
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS || process.env.BREVO_API_KEY
        },
        debug: true,
        logger: true
    });

    try {
        console.log('\nValidating connection...');
        await transporter.verify();
        console.log('✅ Connection verified successfully.');

        console.log('\nSending test email...');
        const info = await transporter.sendMail({
            from: `"Test" <${process.env.EMAIL_FROM}>`,
            to: process.env.EMAIL_USER, // Send to self
            subject: 'Brevo SMTP Test Connection',
            text: 'If you are reading this, your Brevo SMTP settings are correct!'
        });

        console.log('✅ Test email sent:', info.messageId);
        process.exit(0);
    } catch (error) {
        console.error('\n❌ SMTP Error:', error.message);
        console.log('\nCommon issues:');
        console.log('1. Brevo SMTP is not enabled for your account (Check Brevo dashboard).');
        console.log('2. Invalid SMTP key (Check SMTP & API tab).');
        console.log('3. Port 587 is blocked by your ISP/Server.');
        process.exit(1);
    }
};

testEmail();
