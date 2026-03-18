const nodemailer = require('nodemailer');

/**
 * Configure the transporter using Brevo SMTP.
 */
const getTransporter = () => {
    const host = process.env.EMAIL_HOST || 'smtp-relay.brevo.com';
    const port = parseInt(process.env.EMAIL_PORT) || 587;
    const user = process.env.EMAIL_USER;
    
    console.log(`[SMTP] Attempting connection to ${host}:${port} as ${user}`);
    
    return nodemailer.createTransport({
        host,
        port,
        secure: port === 465, // true for 465, false for 587/25
        auth: {
            user,
            pass: process.env.EMAIL_PASS || process.env.BREVO_API_KEY,
        },
        // Helpful for debugging
        debug: true,
        logger: true 
    });
};

/**
 * Generic function to send an email
 */
const sendEmail = async ({ to, subject, html, text }) => {
    if (!process.env.EMAIL_USER || !(process.env.EMAIL_PASS || process.env.BREVO_API_KEY)) {
        console.error('Email credentials missing. Skipping email send.');
        return false;
    }

    try {
        const transporter = getTransporter();
        
        // Detailed verification (only logs once per process)
        await transporter.verify();
        
        const info = await transporter.sendMail({
            from: `"TalentCio" <${process.env.EMAIL_FROM || 'no-reply@talentcio.com'}>`,
            to,
            subject,
            html,
            text
        });
        console.log(`Email sent successfully: ${info.messageId}`);
        return true;
    } catch (error) {
        console.error('Email send failed:', error.message);
        return false;
    }
};

/**
 * Specific function for OTP emails
 */
const sendOTPEmail = async (to, otp, firstName) => {
    const html = `
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
    `;

    return await sendEmail({
        to,
        subject: 'Your Password Reset OTP - TalentCio',
        html
    });
};

module.exports = {
    sendEmail,
    sendOTPEmail
};
