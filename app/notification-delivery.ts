import type { Senders, Delivery } from './notification-service';
// Contract for a server-controlled gateway that wraps the chosen email provider
// for transactional email. Gateways must honor Idempotency-Key.
export function deliveryAdapters(config: {
  EMAIL_GATEWAY_URL?: string;
  NOTIFICATION_GATEWAY_TOKEN?: string;
  GMAIL_SMTP_USER?: string;
  GMAIL_APP_PASSWORD?: string;
}): Senders {
  const senders: Senders = {};
  const gmailUser = config.GMAIL_SMTP_USER?.trim();
  const gmailPassword = config.GMAIL_APP_PASSWORD?.replace(/\s/g, '');
  if (gmailUser && gmailPassword) {
    senders.email = async (delivery: Delivery) => {
      const { default: nodemailer } = await import('nodemailer');
      const transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com', port: 465, secure: true,
        auth: { user: gmailUser, pass: gmailPassword },
        connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 20000,
      });
      await transporter.sendMail({
        from: `Meu Controle <${gmailUser}>`, to: delivery.to,
        subject: delivery.subject, text: delivery.text, html: delivery.html,
        headers: { 'X-Entity-Ref-ID': delivery.idempotencyKey },
      });
    };
    return senders;
  }
  for (const channel of ['email'] as const) {
    const url = config.EMAIL_GATEWAY_URL;
    if (!url || !config.NOTIFICATION_GATEWAY_TOKEN) continue;
    if (new URL(url).protocol !== 'https:') throw new Error('HTTPS required');
    senders[channel] = async (delivery: Delivery) => {
      const response = await fetch(url, {
        method: 'POST',
        redirect: 'error',
        headers: {
          'content-type': 'application/json',
          Authorization: `Bearer ${config.NOTIFICATION_GATEWAY_TOKEN}`,
          'Idempotency-Key': delivery.idempotencyKey,
        },
        body: JSON.stringify(delivery),
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new Error('Delivery failed');
    };
  }
  return senders;
}
