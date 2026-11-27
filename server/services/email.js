import nodemailer from 'nodemailer';
import { config } from '../config.js';

let smtpTransport = null;
if (config.email.smtpHost) {
  smtpTransport = nodemailer.createTransport({
    host: config.email.smtpHost,
    port: config.email.smtpPort,
    secure: config.email.smtpPort === 465,
    auth: config.email.smtpUser ? { user: config.email.smtpUser, pass: config.email.smtpPass } : undefined,
  });
}

export const emailConfigured = Boolean(config.email.resendKey || smtpTransport);

async function sendWithResend({ to, subject, html, text }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.email.resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: config.email.from, to: [to], subject, html, text }),
  });
  if (!res.ok) throw new Error(`Email delivery failed (${res.status})`);
  return res.json();
}

async function sendWithSmtp({ to, subject, html, text }) {
  return smtpTransport.sendMail({ from: config.email.from, to, subject, html, text });
}

export async function sendMail({ to, subject, html, text }) {
  const payload = { to, subject, html, text };
  try {
    if (config.email.resendKey) return await sendWithResend(payload);
    if (smtpTransport) return await sendWithSmtp(payload);
    console.log(`\n[mail:console] To: ${to}\nSubject: ${subject}\n${text}\n`);
    return { console: true };
  } catch (error) {
    console.error('[mail] delivery error:', error.message);
    throw new Error('We could not send the verification email. Please try again.');
  }
}

function shell(title, bodyHtml) {
  return `
  <div style="font-family:Inter,Arial,sans-serif;background:#f6f5fb;padding:32px">
    <div style="max-width:520px;margin:auto;background:#fff;border-radius:20px;padding:32px;border:1px solid #ece9f7">
      <div style="font-size:13px;font-weight:700;letter-spacing:.12em;color:#6d5dfc">KAZILINK</div>
      <h2 style="margin:18px 0 8px;color:#1b1630">${title}</h2>
      ${bodyHtml}
      <p style="color:#a29bb5;font-size:12px;margin-top:26px">This is an automated message about your KaziLink account.</p>
    </div>
  </div>`;
}

export async function sendOtpEmail({ to, name, code, purpose }) {
  const isActivation = purpose === 'activation';
  const isPassword = purpose === 'password';
  const subject = isActivation
    ? 'Your KaziLink activation code'
    : isPassword
      ? 'Your KaziLink password change code'
      : 'Your KaziLink sign-in verification code';
  const intro = isActivation
    ? 'Your activation payment was received. Enter this code to verify your identity and activate your account.'
    : isPassword
      ? 'Use this code to confirm the password change you requested while signed in.'
      : 'We noticed a sign-in from a new device or location. Enter this code to continue.';
  const text = `Hi ${name},\n\n${intro}\n\nCode: ${code}\n\nThis code expires in ${config.otpTtlMinutes} minutes. If this was not you, change your password immediately.\n\nKaziLink`;
  const html = `
  <div style="font-family:Inter,Arial,sans-serif;background:#f6f5fb;padding:32px">
    <div style="max-width:520px;margin:auto;background:#fff;border-radius:20px;padding:32px;border:1px solid #ece9f7">
      <div style="font-size:13px;font-weight:700;letter-spacing:.12em;color:#6d5dfc">KAZILINK</div>
      <h2 style="margin:18px 0 8px;color:#1b1630">${isActivation ? 'Activate your account' : isPassword ? 'Confirm your password change' : 'Verify this sign-in'}</h2>
      <p style="color:#5c5670;line-height:1.6">Hi ${name}, ${intro.toLowerCase()}</p>
      <div style="margin:24px 0;padding:18px;text-align:center;background:#f4f1ff;border-radius:14px;font-size:34px;font-weight:800;letter-spacing:10px;color:#4b33d6">${code}</div>
      <p style="color:#837d97;font-size:13px">The code expires in ${config.otpTtlMinutes} minutes. If you did not request it, ignore this email.</p>
    </div>
  </div>`;
  return sendMail({ to, subject, html, text });
}

export async function sendPaymentReceipt({ to, name, title, amountCents, reference, detail }) {
  const amount = `KSh ${(amountCents / 100).toLocaleString('en-KE', { minimumFractionDigits: 2 })}`;
  const text = `Hi ${name},\n\n${title}\n\nAmount: ${amount}\nReference: ${reference}\n${detail ? `${detail}\n` : ''}\nYou can view the payment in your KaziLink account.\n\nKaziLink`;
  const html = shell(title, `
    <p style="color:#5c5670;line-height:1.6">Hi ${name},</p>
    <div style="margin:18px 0;padding:16px;background:#f4f1ff;border-radius:14px">
      <div style="font-size:12px;color:#7a7390;text-transform:uppercase;letter-spacing:.08em">Amount paid</div>
      <div style="font-size:28px;font-weight:800;color:#4b33d6;margin-top:4px">${amount}</div>
      <div style="font-size:12px;color:#7a7390;margin-top:6px">Reference ${reference}</div>
    </div>
    ${detail ? `<p style="color:#5c5670;line-height:1.6">${detail}</p>` : ''}
  `);
  return sendMail({ to, subject: title, html, text });
}

export async function sendWithdrawalEmail({ to, name, title, amountCents, phone, status, note }) {
  const amount = `KSh ${(amountCents / 100).toLocaleString('en-KE', { minimumFractionDigits: 2 })}`;
  const text = `Hi ${name},\n\n${title}\n\nAmount: ${amount}\nPayout to: ${phone}\nStatus: ${status}\n${note ? `Note: ${note}\n` : ''}\nTrack this request in your KaziLink wallet.\n\nKaziLink`;
  const html = shell(title, `
    <p style="color:#5c5670;line-height:1.6">Hi ${name},</p>
    <div style="margin:18px 0;padding:16px;background:#f4f1ff;border-radius:14px">
      <div style="font-size:28px;font-weight:800;color:#4b33d6">${amount}</div>
      <div style="font-size:13px;color:#5c5670;margin-top:6px">Payout to ${phone}</div>
      <div style="font-size:13px;color:#5c5670;margin-top:2px">Status: <strong>${status}</strong></div>
    </div>
    ${note ? `<p style="color:#5c5670;line-height:1.6">${note}</p>` : ''}
  `);
  return sendMail({ to, subject: title, html, text });
}

export async function sendSupportEmail({ to, name, message, category }) {
  const text = `New support request from ${name}.\n\nCategory: ${category}\n\n${message}\n\nOpen the admin console to reply.`;
  const html = shell('New support request', `
    <p style="color:#5c5670;line-height:1.6">${name} sent a request from the KaziLink app.</p>
    <div style="margin:18px 0;padding:16px;background:#f4f1ff;border-radius:14px">
      <div style="font-size:12px;color:#7a7390;text-transform:uppercase;letter-spacing:.08em">${category}</div>
      <p style="color:#1b1630;line-height:1.65;margin-top:8px">${message}</p>
    </div>
    <p style="color:#5c5670">Reply from the admin console.</p>
  `);
  return sendMail({ to, subject: `KaziLink support: ${category}`, html, text });
}

export async function sendActivationNoticeEmail({ to, name, hours }) {
  const text = `Hi ${name},\n\nYour KaziLink account is still inactive. Activate it within ${hours} hours to avoid deletion.\n\nActivate from the app under Activation.\n\nKaziLink`;
  const html = shell('Activate your account', `
    <p style="color:#5c5670;line-height:1.6">Hi ${name}, your account is still inactive.</p>
    <p style="color:#5c5670;line-height:1.6">Activate within <strong>${hours} hours</strong> to avoid deletion of your account.</p>
    <p style="color:#5c5670;line-height:1.6">Open KaziLink and tap Activation to complete the one-time payment.</p>
  `);
  return sendMail({ to, subject: 'Activate your KaziLink account within 24 hours', html, text });
}
