import nodemailer from 'nodemailer';
import { env } from './env';

// Gmail SMTP transporter
// Uses an App Password — not your actual Gmail password
// Generate at: Google Account → Security → 2-Step Verification → App Passwords
export const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: env.GMAIL_USER,
    pass: env.GMAIL_APP_PASSWORD,
  },
});
