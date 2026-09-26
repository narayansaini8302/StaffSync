import nodemailer, { Transporter } from 'nodemailer';
import dns from 'dns';

if (dns.setDefaultResultOrder) {
  try {
    dns.setDefaultResultOrder('ipv4first');
  } catch {}
}

let transporter: Transporter | null = null;
let etherealUser: string | null = null;

export function isRealSmtpConfigured(): boolean {
  if (process.env.RESEND_API_KEY || process.env.BREVO_API_KEY) {
    return true;
  }
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  return Boolean(
    host &&
    user &&
    pass &&
    user !== 'your-email@gmail.com' &&
    pass !== 'your-16-char-app-password'
  );
}

export async function getTransporter(): Promise<Transporter> {
  if (transporter) return transporter;

  if (isRealSmtpConfigured()) {
    const isGmail =
      process.env.SMTP_HOST?.includes('gmail') ||
      process.env.SMTP_USER?.includes('@gmail.com');

    const rawHost = isGmail ? 'smtp.gmail.com' : (process.env.SMTP_HOST || 'smtp.gmail.com');
    const port = Number(process.env.SMTP_PORT ?? (isGmail ? 465 : 587));
    const secure = process.env.SMTP_SECURE !== undefined
      ? process.env.SMTP_SECURE === 'true'
      : port === 465;

    // Resolve IPv4 address directly using OS resolver (dns.promises.lookup)
    // This completely bypasses Nodemailer's internal random IPv6 selection that causes ENETUNREACH on platforms without IPv6 routing (Render)
    let host = rawHost;
    try {
      const { address } = await dns.promises.lookup(rawHost, { family: 4 });
      if (address) {
        host = address;
      }
    } catch (err) {
      console.warn(`[Email] Could not resolve IPv4 for ${rawHost}, using raw host:`, err);
    }

    transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
      tls: {
        servername: rawHost,
        rejectUnauthorized: false,
      },
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 20000,
    } as any);

    console.log(
      `[Email] Configured SMTP: ${rawHost} (${host}):${port} (secure: ${secure}, user: ${process.env.SMTP_USER})`,
    );
  } else {
    try {
      const test = await nodemailer.createTestAccount();
      etherealUser = test.user;
      transporter = nodemailer.createTransport({
        host: test.smtp.host,
        port: test.smtp.port,
        secure: test.smtp.secure,
        auth: { user: test.user, pass: test.pass },
      });
      console.log('[Email] No SMTP credentials provided. Using Ethereal test account:');
      console.log('   Login: https://ethereal.email/login');
      console.log('   User:  ' + test.user);
      console.log('   Pass:  ' + test.pass);
    } catch (err) {
      console.error('[Email] Failed to create test account, creating fallback transport:', err);
      transporter = nodemailer.createTransport({
        jsonTransport: true,
      });
    }
  }

  return transporter;
}

export interface SendMailInput {
  to: string;
  subject: string;
  html: string;
  attachments?: { filename: string; content: Buffer; contentType?: string }[];
  replyTo?: string;
  fromName?: string;
  companyId?: string;
  category?: 'PAYSLIP' | 'JOINING_LETTER' | 'INVOICE';
}

export interface SendMailResult {
  messageId: string;
  previewUrl: string | false;
  isTestAccount: boolean;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function sendViaResend(
  input: SendMailInput,
  fromName: string,
  fromEmail: string,
): Promise<SendMailResult> {
  const apiKey = process.env.RESEND_API_KEY!;
  const sender =
    process.env.RESEND_FROM ||
    (fromEmail && !fromEmail.includes('@gmail.com') && !fromEmail.includes('@staffsync.local')
      ? `"${fromName}" <${fromEmail}>`
      : 'StaffSync <onboarding@resend.dev>');

  const payload: any = {
    from: sender,
    to: [input.to],
    subject: input.subject,
    html: input.html,
  };

  if (input.replyTo || (fromEmail && fromEmail !== 'noreply@staffsync.local')) {
    payload.reply_to = input.replyTo || fromEmail;
  }

  if (input.attachments && input.attachments.length > 0) {
    payload.attachments = input.attachments.map((att) => ({
      filename: att.filename,
      content: att.content.toString('base64'),
    }));
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data: any = await res.json();
  if (!res.ok) {
    throw new Error(data?.message || JSON.stringify(data));
  }

  return {
    messageId: data.id,
    previewUrl: false,
    isTestAccount: false,
  };
}

async function sendViaBrevo(
  input: SendMailInput,
  fromName: string,
  fromEmail: string,
): Promise<SendMailResult> {
  const apiKey = process.env.BREVO_API_KEY!;
  const senderEmail = process.env.BREVO_FROM || process.env.SMTP_USER || fromEmail;

  const payload: any = {
    sender: { name: fromName, email: senderEmail },
    to: [{ email: input.to }],
    subject: input.subject,
    htmlContent: input.html,
  };

  if (input.replyTo) {
    payload.replyTo = { email: input.replyTo };
  }

  if (input.attachments && input.attachments.length > 0) {
    payload.attachment = input.attachments.map((att) => ({
      name: att.filename,
      content: att.content.toString('base64'),
    }));
  }

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data: any = await res.json();
  if (!res.ok) {
    throw new Error(data?.message || JSON.stringify(data));
  }

  return {
    messageId: data.messageId || data.id,
    previewUrl: false,
    isTestAccount: false,
  };
}

export async function sendMail(
  input: SendMailInput,
  retries = 2,
): Promise<SendMailResult> {
  const fromName = input.fromName || process.env.EMAIL_FROM_NAME || process.env.COMPANY_NAME || 'StaffSync';
  const fromEmail = isRealSmtpConfigured()
    ? (process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@staffsync.local')
    : 'noreply@staffsync.local';

  // 1. Direct HTTPS API delivery (bypasses Render SMTP port 25/465/587 blocks)
  if (process.env.RESEND_API_KEY) {
    try {
      console.log(`[Email] Dispatching via Resend HTTPS API to ${input.to}`);
      return await sendViaResend(input, fromName, fromEmail);
    } catch (err: any) {
      console.error('[Email] Resend API error:', err);
      throw err;
    }
  }

  if (process.env.BREVO_API_KEY) {
    try {
      console.log(`[Email] Dispatching via Brevo HTTPS API to ${input.to}`);
      return await sendViaBrevo(input, fromName, fromEmail);
    } catch (err: any) {
      console.error('[Email] Brevo API error:', err);
      throw err;
    }
  }

  // 2. Standard SMTP delivery (with strict IPv4 resolution)
  const mailOptions: any = {
    from: `"${fromName}" <${fromEmail}>`,
    to: input.to,
    subject: input.subject,
    html: input.html,
    attachments: input.attachments,
    headers: {
      'X-Mailer': 'StaffSync Enterprise SaaS Mailer',
      'X-Auto-Response-Suppress': 'OOF, AutoReply',
      ...(input.companyId ? { 'X-Tenant-Company': input.companyId } : {}),
      ...(input.category ? { 'X-Entity-Category': input.category } : {}),
    },
  };

  if (input.replyTo) {
    mailOptions.replyTo = input.replyTo;
  }

  let attempt = 0;
  while (attempt <= retries) {
    try {
      const t = await getTransporter();
      const info = await t.sendMail(mailOptions);

      let previewUrl: string | false = false;
      if (etherealUser) {
        previewUrl = nodemailer.getTestMessageUrl(info);
        if (previewUrl) {
          console.log('[Email] Preview URL: ' + previewUrl);
        }
      }

      return {
        messageId: info.messageId,
        previewUrl,
        isTestAccount: Boolean(etherealUser),
      };
    } catch (err: any) {
      attempt++;
      transporter = null; // Invalidate cached transporter so retry re-resolves
      if (attempt > retries) {
        console.error(`[Email] Failed to send email to ${input.to} after ${retries + 1} attempts:`, err);
        throw err;
      }
      console.warn(`[Email] Retry ${attempt}/${retries} for ${input.to} after error:`, err?.message);
      await sleep(1000 * Math.pow(2, attempt)); // Exponential backoff: 2s, 4s
    }
  }

  throw new Error('Email send failed');
}

/**
 * Production SaaS Concurrency-Controlled Batch Dispatcher
 * Prevents SMTP connection spikes, timeouts, and provider rate-limiting.
 */
export async function sendMailBatch<T>(
  items: T[],
  worker: (item: T, index: number) => Promise<void>,
  concurrency = 2,
  delayBetweenMs = 250,
): Promise<{ total: number; processed: number; errors: { item: T; error: string }[] }> {
  let index = 0;
  const errors: { item: T; error: string }[] = [];
  let processed = 0;

  async function next(): Promise<void> {
    while (index < items.length) {
      const currentIndex = index++;
      const item = items[currentIndex];
      try {
        await worker(item, currentIndex);
        processed++;
      } catch (err: any) {
        errors.push({ item, error: err?.message || 'Execution error' });
      }
      if (delayBetweenMs > 0) {
        await sleep(delayBetweenMs);
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => next());
  await Promise.all(workers);

  return { total: items.length, processed, errors };
}


