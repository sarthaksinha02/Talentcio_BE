const nodemailer = require('nodemailer');

/**
 * Configure the transporter. 
 * Initialized lazily to avoid startup crashes if env variables are missing.
 */
const getTransporter = () => {
    return nodemailer.createTransport({
        host: process.env.EMAIL_HOST || 'smtp.gmail.com',
        port: process.env.EMAIL_PORT || 587,
        secure: false, // true for 465, false for other ports
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
        },
    });
};

/**
 * Sends an OTP email to the user using Nodemailer.
 * @param {string} to - Recipient email address
 * @param {string} otp - The 6-digit OTP
 * @param {string} firstName - User's first name for personalization
 */
const sendOTPEmail = async (to, otp, firstName) => {
    // Check for missing credentials
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        console.error('ERROR: EMAIL_USER or EMAIL_PASS is missing in .env file.');
        console.warn(`[DEV] OTP for ${to}: ${otp}`);
        return false;
    }

    try {
        const transporter = getTransporter();
        const mailOptions = {
            from: `"TalentCio" <${process.env.EMAIL_FROM || 'no-reply@talentcio.com'}>`,
            to: to,
            subject: 'Your Password Reset OTP - TalentCio',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
                    <h2 style="color: #4a90e2; text-align: center;">Welcome to TalentCio!</h2>
                    <p>Hello ${firstName},</p>
                    <p>To ensure the security of your account, we require a mandatory password reset for your first login.</p>
                    <p>Please use the following One-Time Password (OTP) to verify your identity and set your new password:</p>
                    <div style="text-align: center; margin: 30px 0;">
                        <span style="font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #333; background: #f4f4f4; padding: 10px 20px; border-radius: 5px; border: 1px solid #ccc;">${otp}</span>
                    </div>
                    <p style="color: #666; font-size: 14px;">This OTP is valid for 10 minutes. If you did not expect this email, please ignore it.</p>
                    <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
                    <p style="text-align: center; color: #999; font-size: 12px;">© 2026 TalentCio. All rights reserved.</p>
                </div>
            `,
        };

        const info = await transporter.sendMail(mailOptions);
        console.log('OTP Email sent via Nodemailer successfully:', info.messageId);
        return true;
    } catch (error) {
        console.error('Nodemailer SMTP Error:', error.message);
        console.warn(`[DEV] Fallback OTP (Nodemailer Failed): ${otp}`);
        return false;
    }
};

module.exports = {
    sendOTPEmail
};
