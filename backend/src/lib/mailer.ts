import nodemailer from 'nodemailer';

type MailPayload = {
  subject: string;
  text: string;
  replyTo?: string;
};

function getSmtpConfig() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const to = process.env.CONTACT_RECEIVER_EMAIL;
  const from = process.env.CONTACT_FROM_EMAIL || process.env.SMTP_USER;

  if (!host || !user || !pass || !to || !from) {
    return null;
  }

  return { host, port, user, pass, to, from };
}

export async function sendContactEmail(payload: MailPayload): Promise<void> {
  const cfg = getSmtpConfig();
  if (!cfg) {
    throw new Error('SMTP config is missing');
  }

  const transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.port === 465,
    auth: {
      user: cfg.user,
      pass: cfg.pass,
    },
  });

  await transporter.sendMail({
    from: cfg.from,
    to: cfg.to,
    subject: payload.subject,
    text: payload.text,
    replyTo: payload.replyTo,
  });
}
