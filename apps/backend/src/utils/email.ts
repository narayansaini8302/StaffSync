import nodemailer, { Transporter } from 'nodemailer';

let transporter: Transporter | null = null;
let etherealUser: string | null = null;

export async function getTransporter(): Promise<Transporter> {
  if (transporter) return transporter;

  const isProd = process.env.NODE_ENV === 'production';

  if (isProd && process.env.SMTP_HOST) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
    console.log('Email: using SMTP from .env');
  } else {
    const test = await nodemailer.createTestAccount();
    etherealUser = test.user;
    transporter = nodemailer.createTransport({
      host: test.smtp.host,
      port: test.smtp.port,
      secure: test.smtp.secure,
      auth: { user: test.user, pass: test.pass },
    });
    console.log('Email: using Ethereal test account');
    console.log('   Login: https://ethereal.email/login');
    console.log('   User:  ' + test.user);
    console.log('   Pass:  ' + test.pass);
  }

  return transporter;
}

export interface SendMailInput {
  to: string;
  subject: string;
  html: string;
  attachments?: { filename: string; content: Buffer }[];
}

export async function sendMail(input: SendMailInput) {
  const t = await getTransporter();
  const info = await t.sendMail({
    from: '"Attendance System" <noreply@attendance.local>',
    to: input.to,
    subject: input.subject,
    html: input.html,
    attachments: input.attachments,
  });

  if (etherealUser) {
    const previewUrl = nodemailer.getTestMessageUrl(info);
    console.log('Preview URL: ' + previewUrl);
  }

  return info;
}
