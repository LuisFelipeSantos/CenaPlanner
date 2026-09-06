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
  const gatewayUrl = config.EMAIL_GATEWAY_URL?.trim();
  const gatewayToken = config.NOTIFICATION_GATEWAY_TOKEN?.trim();
  if (gatewayUrl && gatewayToken) {
    if (new URL(gatewayUrl).protocol !== 'https:') throw new Error('HTTPS required');
    senders.email = async (delivery: Delivery) => {
      const response = await fetch(gatewayUrl, {
        method: 'POST', redirect: 'follow',
        headers: {
          'content-type': 'application/json',
          Authorization: `Bearer ${gatewayToken}`,
          'Idempotency-Key': delivery.idempotencyKey,
        },
        // Apps Script Web Apps do not expose arbitrary request headers to doPost,
        // so the secret is duplicated in the TLS-protected JSON body.
        body: JSON.stringify({ ...delivery, gatewayToken }),
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new Error('Delivery failed');
      const result = (await response.json().catch(() => null)) as { ok?: boolean } | null;
      if (!result?.ok) throw new Error('Delivery was not acknowledged');
    };
    return senders;
  }
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
  return senders;
}
