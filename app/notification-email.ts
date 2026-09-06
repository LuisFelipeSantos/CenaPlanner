export type EmailContent = { subject: string; text: string; html: string };
export type EmailEntry = { name: string; dueDate: string | null; amountCents: number };
const appUrl = () => (typeof process !== 'undefined' && (process.env.APP_ORIGIN || process.env.RENDER_EXTERNAL_URL || (process.env.RENDER_EXTERNAL_HOSTNAME ? `https://${process.env.RENDER_EXTERNAL_HOSTNAME}` : ''))) || 'https://cenaplanner.onrender.com';
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
const money = (cents: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
const date = (value: string | null) => value ? value.split('-').reverse().join('/') : 'Sem vencimento informado';
function card(entry: EmailEntry) {
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;margin:0 0 12px"><tr><td style="padding:16px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td style="color:#6b7280;font-size:13px;padding-bottom:6px">Descrição:</td><td align="right" style="color:#111827;font-size:13px;font-weight:600;padding-bottom:6px">${escapeHtml(entry.name)}</td></tr><tr><td style="color:#6b7280;font-size:13px;padding-bottom:6px">Vencimento:</td><td align="right" style="color:#dc2626;font-size:13px;font-weight:600;padding-bottom:6px">${date(entry.dueDate)}</td></tr><tr><td style="color:#6b7280;font-size:13px">Valor previsto:</td><td align="right" style="color:#111827;font-size:15px;font-weight:700">${money(entry.amountCents)}</td></tr></table></td></tr></table>`;
}
export function financialEmail(kind: 'due' | 'monthly', entries: EmailEntry[], offsetDays = 0): EmailContent {
  const monthly = kind === 'monthly';
  const title = monthly
    ? 'Atenção: pendências em aberto'
    : entries.length > 1
      ? `${entries.length} contas com vencimento próximo`
      : offsetDays === 0
        ? 'Uma conta vence hoje'
        : `Uma conta vence em ${offsetDays} dias`;
  const intro = monthly ? 'Encontramos despesas de meses anteriores que continuam sem baixa de pagamento.' : 'Confira o vencimento abaixo e atualize o pagamento no seu controle financeiro.';
  const total = entries.reduce((sum, entry) => sum + entry.amountCents, 0);
  const summary = entries.length > 1 ? `<p style="margin:4px 0 20px;color:#111827;font-size:14px;font-weight:600">${entries.length} contas · Total ${money(total)}</p>` : '';
  const safeUrl = escapeHtml(appUrl());
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Aviso Financeiro</title></head><body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f4f5f7;padding:30px 15px"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:540px;background:#fff;border-radius:12px;border:1px solid #e5e7eb;overflow:hidden"><tr><td style="background:#184e3a;height:6px"></td></tr><tr><td style="padding:32px 28px"><span style="display:inline-block;background:#ecfdf5;color:#184e3a;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;padding:4px 8px;border-radius:4px;margin-bottom:12px">Controle Financeiro</span><h1 style="margin:0 0 12px;color:#111827;font-size:20px;font-weight:600">${title}</h1><p style="margin:0 0 12px;color:#4b5563;font-size:14px;line-height:1.5">${intro}</p>${summary}${entries.map(card).join('')}<table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin-top:24px"><tr><td bgcolor="#184e3a" style="border-radius:8px"><a href="${safeUrl}" target="_blank" style="display:inline-block;background:#184e3a;color:#fff;font-size:14px;font-weight:500;text-decoration:none;padding:10px 18px;border-radius:8px">Acessar painel financeiro &rarr;</a></td></tr></table></td></tr><tr><td style="padding:16px 28px;background:#f9fafb;border-top:1px solid #e5e7eb;text-align:center"><p style="margin:0;color:#9ca3af;font-size:12px">Mensagem automática do seu controle financeiro.</p></td></tr></table></td></tr></table></body></html>`;
  return { subject: title, text: `${title}\n\n${intro}\n${entries.map(e => `${e.name} — ${date(e.dueDate)} — ${money(e.amountCents)}`).join('\n')}\n\n${appUrl()}`, html };
}
