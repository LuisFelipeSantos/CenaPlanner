export class PreferenceError extends Error {}
export type NotificationPrefs = {
  user_id: string;
  email: string;
  in_app: number;
  email_enabled: number;
};
export type Delivery = {
  channel: 'email';
  to: string;
  message: string;
  subject: string;
  text: string;
  html: string;
  idempotencyKey: string;
};
import { financialEmail } from './notification-email.ts';
export type Senders = Partial<
  Record<'email', (delivery: Delivery) => Promise<void>>
>;
export function localDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  return ['year', 'month', 'day']
    .map((k) => parts.find((p) => p.type === k)!.value)
    .join('-');
}
function offsetDate(date: string, days: number) {
  const d = new Date(date + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function notificationService(db: D1Database) {
  const q = (sql: string, ...args: (string | number | null)[]) =>
    db.prepare(sql).bind(...args);
  async function preferences(userId: string, email: string) {
    await q(
      'INSERT INTO notification_preferences(user_id,email) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET email=excluded.email',
      userId,
      email,
    ).run();
    return (await q(
      'SELECT * FROM notification_preferences WHERE user_id=?',
      userId,
    ).first<NotificationPrefs>())!;
  }
  async function savePreferences(
    userId: string,
    email: string,
    body: Record<string, unknown>,
  ) {
    for (const key of ['inApp', 'emailEnabled'])
      if (typeof body[key] !== 'boolean')
        throw new PreferenceError('Preferências inválidas.');
    await preferences(userId, email);
    await q(
      'UPDATE notification_preferences SET in_app=?,email_enabled=? WHERE user_id=?',
      Number(body.inApp),
      Number(body.emailEnabled),
      userId,
    ).run();
    return preferences(userId, email);
  }
  async function scan(today = localDate(), userId?: string, cursor = '') {
    const rows = await q(
      `SELECT e.id,e.user_id,e.due_date,p.in_app,p.email_enabled
      FROM ledger_entries e JOIN notification_preferences p ON p.user_id=e.user_id
      WHERE e.type='expense' AND e.status!='pago' AND e.deleted_at IS NULL AND e.due_date IN (?,?,?,?) AND e.id>? ${userId ? 'AND e.user_id=?' : ''}
      ORDER BY e.id LIMIT 200`,
      today,
      offsetDate(today, 1),
      offsetDate(today, 3),
      offsetDate(today, 7),
      cursor,
      ...(userId ? [userId] : []),
    ).all<{
      id: string;
      user_id: string;
      due_date: string;
      in_app: number;
      email_enabled: number;
    }>();
    const statements: D1PreparedStatement[] = [];
    for (const row of rows.results) {
      const offset = Math.round(
        (Date.parse(row.due_date) - Date.parse(today)) / 86400000,
      );
      if (row.in_app) {
        statements.push(
          q(
            'INSERT INTO notification_jobs(id,user_id,entry_id,due_date,offset_days,channel,status,created_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(entry_id,due_date,offset_days,channel) DO NOTHING',
            crypto.randomUUID(),
            row.user_id,
            row.id,
            row.due_date,
            offset,
            'in_app',
            'sent',
            new Date().toISOString(),
          ),
        );
      }
      if (row.email_enabled) {
        statements.push(
          q(
            'INSERT INTO notification_jobs(id,user_id,entry_id,due_date,offset_days,channel,status,created_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(entry_id,due_date,offset_days,channel) DO NOTHING',
            crypto.randomUUID(),
            row.user_id,
            `due-batch:${row.user_id}:${today}`,
            today,
            998,
            'email',
            'pending',
            new Date().toISOString(),
          ),
        );
      }
    }
    // D1 batch is atomic; each event/channel has an independent deduplication key.
    if (statements.length) await db.batch(statements);
    if (today.endsWith('-01') && !cursor) {
      const pendingUsers = await q(
        `SELECT p.user_id FROM notification_preferences p WHERE p.email_enabled=1 AND EXISTS (SELECT 1 FROM ledger_entries e WHERE e.user_id=p.user_id AND e.type='expense' AND e.status!='pago' AND e.deleted_at IS NULL AND e.period<?) ${userId ? 'AND p.user_id=?' : ''} ORDER BY p.user_id`,
        today.slice(0, 7),
        ...(userId ? [userId] : []),
      ).all<{ user_id: string }>();
      const created = new Date().toISOString();
      for (const user of pendingUsers.results)
        await q('INSERT INTO notification_jobs(id,user_id,entry_id,due_date,offset_days,channel,status,created_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(entry_id,due_date,offset_days,channel) DO NOTHING', crypto.randomUUID(), user.user_id, `monthly:${user.user_id}`, today, 999, 'email', 'pending', created).run();
    }
    return {
      processed: rows.results.length,
      nextCursor: rows.results.length === 200 ? rows.results.at(-1)!.id : null,
    };
  }
  async function list(userId: string) {
    const pref = await q(
      'SELECT in_app FROM notification_preferences WHERE user_id=?',
      userId,
    ).first<{ in_app: number }>();
    if (!pref?.in_app) return { items: [], unread: 0 };
    const condition =
      "j.user_id=? AND j.channel='in_app' AND e.deleted_at IS NULL AND e.status!='pago' AND e.due_date=j.due_date";
    const items = (
      await q(
        `SELECT j.id,j.read_at AS readAt,j.due_date AS dueDate,j.offset_days AS offsetDays,e.name,e.period FROM notification_jobs j JOIN ledger_entries e ON e.id=j.entry_id WHERE ${condition} ORDER BY j.created_at DESC,j.id LIMIT 100`,
        userId,
      ).all()
    ).results;
    const count = await q(
      `SELECT COUNT(*) AS n FROM notification_jobs j JOIN ledger_entries e ON e.id=j.entry_id WHERE ${condition} AND j.read_at IS NULL`,
      userId,
    ).first<{ n: number }>();
    return { items, unread: count?.n || 0 };
  }
  async function markRead(userId: string, id: unknown) {
    if (typeof id !== 'string')
      throw new PreferenceError('Notificação inválida.');
    await q(
      "UPDATE notification_jobs SET read_at=? WHERE id=? AND user_id=? AND channel='in_app'",
      new Date().toISOString(),
      id,
      userId,
    ).run();
    return { ok: true };
  }
  async function dispatch(senders: Senders, now = new Date()) {
    const stamp = now.toISOString(),
      today = localDate(now);
    const jobs = await q(
      `SELECT * FROM notification_jobs WHERE channel='email' AND attempts<5 AND (status IN ('pending','failed','blocked') OR (status='sending' AND lease_until<?)) AND (next_attempt_at IS NULL OR next_attempt_at<=?) ORDER BY created_at,id LIMIT 50`,
      stamp,
      stamp,
    ).all<{
      id: string;
      user_id: string;
      entry_id: string;
      due_date: string;
      offset_days: number;
      channel: 'email';
      attempts: number;
    }>();
    let sent = 0;
    let examined = 0;
    const deadline = Date.now() + 25000;
    for (const job of jobs.results) {
      if (Date.now() > deadline) break;
      examined++;
      const lease = crypto.randomUUID();
      await q(
        `UPDATE notification_jobs SET status='sending',lease_token=?,lease_until=? WHERE id=? AND attempts<5 AND (next_attempt_at IS NULL OR next_attempt_at<=?) AND (status IN ('pending','failed','blocked') OR (status='sending' AND lease_until<?))`,
        lease,
        new Date(now.getTime() + 120000).toISOString(),
        job.id,
        stamp,
        stamp,
      ).run();
      const owned = await q(
        'SELECT lease_token FROM notification_jobs WHERE id=?',
        job.id,
      ).first<{ lease_token: string }>();
      if (owned?.lease_token !== lease) continue;
      if (job.offset_days === 999 && job.entry_id.startsWith('monthly:')) {
        const pref = await q('SELECT email,email_enabled FROM notification_preferences WHERE user_id=?', job.user_id).first<NotificationPrefs>();
        const pending = await q("SELECT name,due_date AS dueDate,amount_cents AS amountCents FROM ledger_entries WHERE user_id=? AND type='expense' AND status!='pago' AND deleted_at IS NULL AND period<? ORDER BY due_date,name", job.user_id, today.slice(0, 7)).all<{ name: string; dueDate: string | null; amountCents: number }>();
        if (!pref?.email_enabled || !pending.results.length) { await q("UPDATE notification_jobs SET status='cancelled',lease_token=NULL,lease_until=NULL WHERE id=? AND lease_token=?", job.id, lease).run(); continue; }
        const sender = senders.email;
        if (!sender) { await q("UPDATE notification_jobs SET status='blocked',last_error='provider_not_configured',next_attempt_at=?,lease_token=NULL,lease_until=NULL WHERE id=? AND lease_token=?", new Date(now.getTime() + 3600000).toISOString(), job.id, lease).run(); continue; }
        try { const content = financialEmail('monthly', pending.results); await sender({ channel: 'email', to: pref.email, message: content.text, ...content, idempotencyKey: job.id }); await q("UPDATE notification_jobs SET status='sent',sent_at=?,attempts=attempts+1,last_error=NULL,lease_token=NULL,lease_until=NULL WHERE id=? AND lease_token=?", stamp, job.id, lease).run(); sent++; }
        catch { await q("UPDATE notification_jobs SET status='failed',attempts=attempts+1,last_error='delivery_failed',next_attempt_at=?,lease_token=NULL,lease_until=NULL WHERE id=? AND lease_token=?", new Date(now.getTime() + 60000 * 2 ** job.attempts).toISOString(), job.id, lease).run(); }
        continue;
      }
      if (job.offset_days === 998 && job.entry_id.startsWith('due-batch:')) {
        const pref = await q('SELECT email,email_enabled FROM notification_preferences WHERE user_id=?', job.user_id).first<NotificationPrefs>();
        const due = await q(
          "SELECT name,due_date AS dueDate,amount_cents AS amountCents FROM ledger_entries WHERE user_id=? AND type='expense' AND status!='pago' AND deleted_at IS NULL AND due_date IN (?,?,?,?) ORDER BY due_date,name",
          job.user_id,
          today,
          offsetDate(today, 1),
          offsetDate(today, 3),
          offsetDate(today, 7),
        ).all<{ name: string; dueDate: string; amountCents: number }>();
        if (!pref?.email_enabled || !due.results.length) {
          await q("UPDATE notification_jobs SET status='cancelled',lease_token=NULL,lease_until=NULL WHERE id=? AND lease_token=?", job.id, lease).run();
          continue;
        }
        const sender = senders.email;
        if (!sender) {
          await q("UPDATE notification_jobs SET status='blocked',last_error='provider_not_configured',next_attempt_at=?,lease_token=NULL,lease_until=NULL WHERE id=? AND lease_token=?", new Date(now.getTime() + 3600000).toISOString(), job.id, lease).run();
          continue;
        }
        try {
          const singleOffset = due.results.length === 1
            ? Math.round((Date.parse(due.results[0].dueDate) - Date.parse(today)) / 86400000)
            : 0;
          const content = financialEmail('due', due.results, singleOffset);
          await sender({ channel: 'email', to: pref.email, message: content.text, ...content, idempotencyKey: job.id });
          await q("UPDATE notification_jobs SET status='sent',sent_at=?,attempts=attempts+1,last_error=NULL,lease_token=NULL,lease_until=NULL WHERE id=? AND lease_token=?", stamp, job.id, lease).run();
          sent++;
        } catch {
          await q("UPDATE notification_jobs SET status='failed',attempts=attempts+1,last_error='delivery_failed',next_attempt_at=?,lease_token=NULL,lease_until=NULL WHERE id=? AND lease_token=?", new Date(now.getTime() + 60000 * 2 ** job.attempts).toISOString(), job.id, lease).run();
        }
        continue;
      }
      const row = await q(
        'SELECT e.name,e.amount_cents,e.status,e.deleted_at,e.due_date,p.* FROM ledger_entries e JOIN notification_preferences p ON p.user_id=e.user_id WHERE e.id=? AND e.user_id=?',
        job.entry_id,
        job.user_id,
      ).first<
        NotificationPrefs & {
          name: string;
          status: string;
          deleted_at: string | null;
          due_date: string | null;
          amount_cents: number;
        }
      >();
      const enabled = row?.email_enabled;
      if (
        !row ||
        !enabled ||
        row.status === 'pago' ||
        row.deleted_at ||
        row.due_date !== job.due_date ||
        offsetDate(today, job.offset_days) !== job.due_date
      ) {
        await q(
          "UPDATE notification_jobs SET status='cancelled',lease_token=NULL,lease_until=NULL WHERE id=? AND lease_token=?",
          job.id,
          lease,
        ).run();
        continue;
      }
      const sender = senders[job.channel];
      if (!sender) {
        await q(
          "UPDATE notification_jobs SET status='blocked',last_error='provider_not_configured',next_attempt_at=?,lease_token=NULL,lease_until=NULL WHERE id=? AND lease_token=?",
          new Date(now.getTime() + 3600000).toISOString(),
          job.id,
          lease,
        ).run();
        continue;
      }
      try {
        const content = financialEmail('due', [{ name: row.name, dueDate: row.due_date, amountCents: row.amount_cents }], job.offset_days);
        await sender({
          channel: job.channel,
          to: row.email,
          message: content.text,
          ...content,
          idempotencyKey: job.id,
        });
        await q(
          "UPDATE notification_jobs SET status='sent',sent_at=?,attempts=attempts+1,last_error=NULL,lease_token=NULL,lease_until=NULL WHERE id=? AND lease_token=?",
          stamp,
          job.id,
          lease,
        ).run();
        sent++;
      } catch {
        await q(
          "UPDATE notification_jobs SET status='failed',attempts=attempts+1,last_error='delivery_failed',next_attempt_at=?,lease_token=NULL,lease_until=NULL WHERE id=? AND lease_token=?",
          new Date(now.getTime() + 60000 * 2 ** job.attempts).toISOString(),
          job.id,
          lease,
        ).run();
      }
    }
    return {
      sent,
      examined,
      hasMore: examined < jobs.results.length || jobs.results.length === 50,
    };
  }
  return { preferences, savePreferences, scan, list, markRead, dispatch };
}
