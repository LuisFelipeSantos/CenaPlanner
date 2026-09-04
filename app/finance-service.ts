import { categoryKey, categoryName } from './category-utils.ts';
export class FinanceError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}
export function periodOf(year: number, month: number) {
  if (
    !Number.isInteger(year) ||
    year < 1900 ||
    year > 2200 ||
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12
  )
    throw new FinanceError('Mês ou ano inválido.');
  return `${year}-${String(month).padStart(2, '0')}`;
}
export function validatePeriod(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}$/.test(value))
    throw new FinanceError('Mês inválido.');
  const [y, m] = value.split('-').map(Number);
  return periodOf(y, m);
}
export function currentPeriod(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(date);
  return `${parts.find((p) => p.type === 'year')!.value}-${parts.find((p) => p.type === 'month')!.value}`;
}
export function moneyCents(value: unknown, allowZero = false) {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < (allowZero ? 0 : 0.01) ||
    value > 1000000000
  )
    throw new FinanceError('Informe um valor válido.');
  const cents = Math.round(value * 100);
  if (Math.abs(value * 100 - cents) > 0.00001)
    throw new FinanceError('Use no máximo duas casas decimais.');
  return cents;
}
function textValue(value: unknown, label: string, max = 100) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max)
    throw new FinanceError(`Informe ${label} válido(a).`);
  return value.trim();
}
export function dateAt(period: string, day: number) {
  const [year, month] = period.split('-').map(Number);
  return `${period}-${String(Math.min(day, new Date(Date.UTC(year, month, 0)).getUTCDate())).padStart(2, '0')}`;
}
export function validDate(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new FinanceError('Data inválida.');
  validatePeriod(value.slice(0, 7));
  const day = Number(value.slice(8));
  if (day < 1 || day > 31 || dateAt(value.slice(0, 7), day) !== value)
    throw new FinanceError('Data inválida.');
  return value;
}
export function addMonths(period: string, offset: number) {
  const [y, m] = period.split('-').map(Number);
  const index = y * 12 + m - 1 + offset;
  return periodOf(Math.floor(index / 12), (index % 12) + 1);
}
type Template = {
  id: string;
  name: string;
  category: string;
  amount_cents: number;
  type: string;
  start_period: string;
  end_date: string | null;
  interval_months: number;
  due_day: number;
  stopped_from: string | null;
  repetition_count?: number | null;
  notification_due_day?: number | null;
  due_month_offset?: number;
};
type Profile = {
  name: string;
  monthlySalary: number;
  initialPeriod: string;
  onboardingCompletedAt: string;
};
export function financeService(
  db: D1Database,
  userId: string,
  clock: () => Date = () => new Date(),
) {
  const q = (sql: string, ...args: (string | number | null)[]) =>
    db.prepare(sql).bind(...args);
  const now = () => clock().toISOString();
  const profileQuery = () =>
    q(
      'SELECT name, base_salary_cents / 100.0 AS monthlySalary, initial_period AS initialPeriod, onboarding_completed_at AS onboardingCompletedAt FROM financial_users WHERE user_id=?',
      userId,
    ).first<Profile>();
  function cycleStatements(period: string) {
    return [
      q(
        `INSERT INTO monthly_cycles(user_id,period,initial_salary_cents,created_at)
         SELECT user_id,?,COALESCE((SELECT amount_cents FROM salary_defaults WHERE user_id=? AND effective_period<=? ORDER BY effective_period DESC LIMIT 1),0),?
         FROM financial_users WHERE user_id=? ON CONFLICT(user_id,period) DO NOTHING`,
        period,
        userId,
        period,
        now(),
        userId,
      ),
      q(
        `INSERT INTO ledger_entries(id,user_id,period,name,category,amount_cents,type,status,entry_date,source_key,created_at)
         SELECT ?,user_id,period,'Salário','Salário',initial_salary_cents,'income','pago',period||'-01','salary',?
         FROM monthly_cycles WHERE user_id=? AND period=? ON CONFLICT(user_id,period,source_key) DO NOTHING`,
        crypto.randomUUID(),
        now(),
        userId,
        period,
      ),
    ];
  }
  // Explicit one-time import. Legacy records remain untouched and are never
  // guessed into a series: their original recurrence flag contained no series ID.
  async function getProfile(): Promise<Profile | null> {
    const existing = await profileQuery();
    if (existing) return existing;
    const legacy = await q(
      'SELECT name, monthly_salary AS salary FROM profiles WHERE user_id=?',
      userId,
    ).first<{ name: string; salary: number }>();
    if (!legacy) return null;
    const rows = await q('SELECT * FROM entries WHERE user_id=?', userId).all<{
      id: number;
      name: string;
      category: string;
      amount: number;
      type: string;
      status: string;
      entry_date: string | null;
      due_day: number | null;
      month: number;
      year: number;
    }>();
    const periods = [
      ...new Set([
        currentPeriod(),
        ...rows.results.map((r) => periodOf(r.year, r.month)),
      ]),
    ].sort();
    const initial = periods[0];
    const salary = moneyCents(legacy.salary, true);
    const statements = [
      q(
        'INSERT INTO financial_users(user_id,name,base_salary_cents,initial_period,onboarding_completed_at) VALUES(?,?,?,?,?) ON CONFLICT(user_id) DO NOTHING',
        userId,
        legacy.name,
        salary,
        initial,
        now(),
      ),
      q(
        'INSERT INTO salary_defaults(user_id,effective_period,amount_cents) VALUES(?,?,?) ON CONFLICT(user_id,effective_period) DO NOTHING',
        userId,
        initial,
        salary,
      ),
    ];
    for (const period of periods) statements.push(...cycleStatements(period));
    for (const row of rows.results)
      statements.push(
        q(
          `INSERT INTO ledger_entries(id,user_id,period,name,category,amount_cents,type,status,entry_date,source_key,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id,period,source_key) DO NOTHING`,
          crypto.randomUUID(),
          userId,
          periodOf(row.year, row.month),
          row.name,
          row.category,
          Math.round(row.amount * 100),
          row.type,
          row.status,
          row.entry_date ||
            dateAt(periodOf(row.year, row.month), row.due_day || 1),
          `legacy:${row.id}`,
          now(),
        ),
      );
    await db.batch(statements);
    return profileQuery();
  }
  async function requireProfile() {
    const profile = await getProfile();
    if (!profile)
      throw new FinanceError(
        'Conclua a preparação da sua conta primeiro.',
        409,
      );
    return profile;
  }
  async function saveProfile(body: Record<string, unknown>) {
    const name = textValue(body.name, 'nome');
    const salary = moneyCents(body.monthlySalary, true);
    const existing = await getProfile();
    const period = existing
      ? addMonths(currentPeriod(clock()), 1)
      : validatePeriod(body.initialPeriod || currentPeriod(clock()));
    if (existing) {
      if (moneyCents(existing.monthlySalary, true) === salary) {
        await q(
          'UPDATE financial_users SET name=? WHERE user_id=?',
          name,
          userId,
        ).run();
        return profileQuery();
      }
      await db.batch([
        q(
          'DELETE FROM salary_defaults WHERE user_id=? AND effective_period>=?',
          userId,
          period,
        ),
        q(
          'UPDATE financial_users SET name=?,base_salary_cents=? WHERE user_id=?',
          name,
          salary,
          userId,
        ),
        q(
          'INSERT INTO salary_defaults(user_id,effective_period,amount_cents) VALUES(?,?,?) ON CONFLICT(user_id,effective_period) DO UPDATE SET amount_cents=excluded.amount_cents',
          userId,
          period,
          salary,
        ),
        q(
          "UPDATE ledger_entries SET amount_cents=? WHERE user_id=? AND period>=? AND source_key='salary'",
          salary,
          userId,
          period,
        ),
        q(
          'UPDATE monthly_cycles SET initial_salary_cents=? WHERE user_id=? AND period>=?',
          salary,
          userId,
          period,
        ),
      ]);
    } else {
      await db.batch([
        q(
          'INSERT INTO financial_users(user_id,name,base_salary_cents,initial_period,onboarding_completed_at) VALUES(?,?,?,?,?) ON CONFLICT(user_id) DO NOTHING',
          userId,
          name,
          salary,
          period,
          now(),
        ),
        q(
          'INSERT INTO salary_defaults(user_id,effective_period,amount_cents) VALUES(?,?,?) ON CONFLICT(user_id,effective_period) DO NOTHING',
          userId,
          period,
          salary,
        ),
        ...[
          'Salário',
          'Moradia',
          'Alimentação',
          'Transporte',
          'Trabalho',
          'Outros',
        ].map((c) =>
          q(
            'INSERT INTO categories(user_id,name) VALUES(?,?) ON CONFLICT(user_id,name) DO NOTHING',
            userId,
            c,
          ),
        ),
        ...cycleStatements(period),
      ]);
    }
    return profileQuery();
  }
  function occurrence(template: Template, period: string) {
    const [y, m] = period.split('-').map(Number);
    const [sy, sm] = template.start_period.split('-').map(Number);
    const delta = (y - sy) * 12 + m - sm;
    const date = dateAt(period, template.due_day);
    if (
      delta < 0 ||
      delta % template.interval_months ||
      (template.repetition_count != null &&
        delta / template.interval_months >= template.repetition_count) ||
      (template.end_date && date > template.end_date) ||
      (template.stopped_from && period >= template.stopped_from)
    )
      return null;
    // Re-read stop boundary inside INSERT so concurrent delete/generation cannot
    // resurrect a stopped series. The unique key also retains deleted exceptions.
    return q(
      `INSERT INTO ledger_entries(id,user_id,period,name,category,amount_cents,type,status,entry_date,source_key,template_id,created_at,due_date)
      SELECT ?,user_id,?,name,category,COALESCE((SELECT amount_cents FROM recurrence_values v WHERE v.user_id=recurrence_templates.user_id AND v.template_id=recurrence_templates.id AND v.effective_period<=? ORDER BY effective_period DESC LIMIT 1),amount_cents),type,'pendente',?,?,id,?,? FROM recurrence_templates
      WHERE id=? AND user_id=? AND (stopped_from IS NULL OR stopped_from>?)
      ON CONFLICT(user_id,period,source_key) DO NOTHING`,
      crypto.randomUUID(),
      period,
      period,
      date,
      `template:${template.id}`,
      now(),
      template.notification_due_day
        ? dateAt(
            addMonths(period, template.due_month_offset || 0),
            template.notification_due_day,
          )
        : null,
      template.id,
      userId,
      period,
    );
  }
  async function openMonth(value: unknown) {
    const period = validatePeriod(value);
    await requireProfile();
    const templates = await q(
      'SELECT * FROM recurrence_templates WHERE user_id=? AND start_period<=? AND (stopped_from IS NULL OR stopped_from>?)',
      userId,
      period,
      period,
    ).all<Template>();
    await db.batch([
      ...cycleStatements(period),
      ...templates.results
        .map((t) => occurrence(t, period))
        .filter((s): s is D1PreparedStatement => s !== null),
    ]);
    return { period };
  }
  async function setMonthlySalary(value: unknown, amount: unknown) {
    const period = validatePeriod(value);
    const cents = moneyCents(amount, true);
    await openMonth(period);
    await q(
      "UPDATE ledger_entries SET amount_cents=?,deleted_at=NULL WHERE user_id=? AND period=? AND source_key='salary'",
      cents,
      userId,
      period,
    ).run();
    return { ok: true };
  }
  async function listCategories() {
    await requireProfile();
    const rows = (
      await q(
        'SELECT name,archived FROM categories WHERE user_id=? ORDER BY id',
        userId,
      ).all<{ name: string; archived: number }>()
    ).results;
    const groups = new Map<
      string,
      { name: string; key: string; archived: boolean }
    >();
    for (const row of rows) {
      const key = categoryKey(row.name);
      const previous = groups.get(key);
      groups.set(key, {
        name: previous?.name || categoryName(row.name),
        key,
        archived: !!row.archived && (previous?.archived ?? true),
      });
    }
    // Include historical names for report filters, even if no catalog record existed.
    const historical = (
      await q(
        'SELECT DISTINCT category AS name FROM ledger_entries WHERE user_id=? AND deleted_at IS NULL',
        userId,
      ).all<{ name: string }>()
    ).results;
    for (const row of historical) {
      const key = categoryKey(row.name);
      if (!groups.has(key))
        groups.set(key, { name: categoryName(row.name), key, archived: false });
    }
    return [...groups.values()].sort((a, b) =>
      a.name.localeCompare(b.name, 'pt-BR'),
    );
  }
  async function saveCategory(body: Record<string, unknown>) {
    await requireProfile();
    const name = categoryName(textValue(body.name, 'categoria'));
    const key = categoryKey(name);
    const rows = (
      await q('SELECT id,name FROM categories WHERE user_id=?', userId).all<{
        id: number;
        name: string;
      }>()
    ).results;
    const matches = rows.filter((r) => categoryKey(r.name) === key);
    const archived = body.archived === true ? 1 : 0;
    if (matches.length) {
      await db.batch(
        matches.map((r) =>
          q(
            'UPDATE categories SET archived=? WHERE id=? AND user_id=?',
            archived,
            r.id,
            userId,
          ),
        ),
      );
      return { name: categoryName(matches[0].name), key, archived: !!archived };
    }
    await q(
      'INSERT INTO categories(user_id,name,normalized_key,archived) VALUES(?,?,?,?) ON CONFLICT DO NOTHING',
      userId,
      name,
      key,
      archived,
    ).run();
    const saved = await q(
      'SELECT name FROM categories WHERE user_id=? AND normalized_key=?',
      userId,
      key,
    ).first<{ name: string }>();
    return { name: saved?.name || name, key, archived: !!archived };
  }
  async function listEntries(params: URLSearchParams) {
    await requireProfile();
    const conditions = ['user_id=?', 'deleted_at IS NULL'];
    const args: (string | number)[] = [userId];
    if (params.has('from') || params.has('to')) {
      const from = validDate(params.get('from')),
        to = validDate(params.get('to'));
      if (from > to)
        throw new FinanceError('A data final deve ser posterior à inicial.');
      conditions.push('entry_date BETWEEN ? AND ?');
      args.push(from, to);
    } else {
      const year = Number(params.get('year'));
      const month = Number(params.get('month'));
      if (month) {
        const period = periodOf(year, month);
        conditions.push('period=?');
        args.push(period);
      } else {
        periodOf(year, 1);
        conditions.push('period BETWEEN ? AND ?');
        args.push(`${year}-01`, `${year}-12`);
      }
    }
    const selected = new Set(
      params.getAll('category').filter(Boolean).map(categoryKey),
    );
    const rows = (
      await q(
        `SELECT id,name,category,amount_cents/100.0 AS amount,type,status,entry_date AS entryDate,due_date AS dueDate,CAST(substr(entry_date,9,2) AS INTEGER) AS due,CAST(substr(period,6,2) AS INTEGER) AS month,CAST(substr(period,1,4) AS INTEGER) AS year,template_id AS templateId,source_key='salary' AS isSalary FROM ledger_entries WHERE ${conditions.join(' AND ')} ORDER BY entry_date,created_at,id`,
        ...args,
      ).all()
    ).results;
    return rows.filter(
      (row) =>
        !selected.size || selected.has(categoryKey(String(row.category))),
    );
  }
  async function createEntry(body: Record<string, unknown>) {
    const name = textValue(body.name, 'descrição'),
      category = categoryName(textValue(body.category, 'categoria'));
    const amount = moneyCents(body.amount),
      date = validDate(body.date),
      period = date.slice(0, 7);
    const type = body.type;
    if (type !== 'income' && type !== 'expense')
      throw new FinanceError('Tipo inválido.');
    const status = body.status || 'pendente';
    if (
      typeof status !== 'string' ||
      !['pago', 'pendente', 'vencido'].includes(status)
    )
      throw new FinanceError('Situação inválida.');
    const repeat = body.repeat || 'once';
    if (
      typeof repeat !== 'string' ||
      !['once', 'forever', 'until', 'count'].includes(repeat)
    )
      throw new FinanceError('Repetição inválida.');
    const interval = body.intervalMonths ?? 1;
    if (
      typeof interval !== 'number' ||
      !Number.isInteger(interval) ||
      interval < 1 ||
      interval > 120
    )
      throw new FinanceError('O intervalo deve ser de 1 a 120 meses.');
    const end = repeat === 'until' ? validDate(body.endDate) : null;
    if (end && end < date)
      throw new FinanceError(
        'O fim da repetição deve ser igual ou posterior à primeira ocorrência.',
      );
    const count = repeat === 'count' ? body.repetitionCount : null;
    if (
      repeat === 'count' &&
      (typeof count !== 'number' ||
        !Number.isInteger(count) ||
        count < 1 ||
        count > 120)
    )
      throw new FinanceError(
        'Informe de 1 a 120 ocorrências, incluindo a primeira.',
      );
    const dueDate =
      type === 'expense' && body.dueDate ? validDate(body.dueDate) : null;
    if (type === 'income' && body.dueDate)
      throw new FinanceError('Receitas não possuem data de vencimento.');
    const dueOffset = dueDate
      ? (Number(dueDate.slice(0, 4)) - Number(period.slice(0, 4))) * 12 +
        Number(dueDate.slice(5, 7)) -
        Number(period.slice(5))
      : 0;
    const futurePeriods: string[] = [];
    if (repeat === 'count' || repeat === 'until') {
      for (
        let n = 1;
        n <= (repeat === 'count' ? Number(count) - 1 : 120);
        n++
      ) {
        const target = addMonths(period, n * interval);
        if (end && dateAt(target, Number(date.slice(8))) > end) break;
        if (n >= 120)
          throw new FinanceError('Limite de 120 ocorrências por série.');
        futurePeriods.push(target);
      }
    }
    const requestId = textValue(body.requestId, 'identificador', 80);
    if (!/^[a-zA-Z0-9-]+$/.test(requestId))
      throw new FinanceError('Identificador inválido.');
    await openMonth(period);
    const id = `entry:${userId}:${requestId}`,
      templateId = `series:${userId}:${requestId}`;
    await saveCategory({ name: category });
    const statements: D1PreparedStatement[] = [];
    if (repeat !== 'once')
      statements.push(
        q(
          'INSERT INTO recurrence_templates(id,user_id,name,category,amount_cents,type,start_period,end_date,interval_months,due_day,created_at,repetition_count,notification_due_day,due_month_offset) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING',
          templateId,
          userId,
          name,
          category,
          amount,
          type,
          period,
          end,
          interval,
          Number(date.slice(8)),
          now(),
          typeof count === 'number' ? count : null,
          dueDate ? Number(dueDate.slice(8)) : null,
          dueOffset,
        ),
      );
    statements.push(
      q(
        `INSERT INTO ledger_entries(id,user_id,period,name,category,amount_cents,type,status,entry_date,source_key,template_id,created_at,due_date) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT DO NOTHING`,
        id,
        userId,
        period,
        name,
        category,
        amount,
        type,
        String(status),
        date,
        repeat === 'once' ? `manual:${requestId}` : `template:${templateId}`,
        repeat === 'once' ? null : templateId,
        now(),
        dueDate,
      ),
    );
    if (repeat !== 'once') {
      const cycles = await q(
        'SELECT period FROM monthly_cycles WHERE user_id=? AND period>?',
        userId,
        period,
      ).all<{ period: string }>();
      const template: Template = {
        id: templateId,
        name,
        category,
        amount_cents: amount,
        type,
        start_period: period,
        end_date: end,
        interval_months: interval,
        due_day: Number(date.slice(8)),
        stopped_from: null,
        repetition_count: typeof count === 'number' ? count : null,
        notification_due_day: dueDate ? Number(dueDate.slice(8)) : null,
        due_month_offset: dueOffset,
      };
      for (const target of new Set([
        ...futurePeriods,
        ...cycles.results.map((c) => c.period),
      ])) {
        const statement = occurrence(template, target);
        if (statement) statements.push(statement);
      }
    }
    await db.batch(statements);
    return { ok: true, id };
  }
  async function changeEntry(body: Record<string, unknown>) {
    const id = textValue(body.id, 'lançamento', 250);
    const row = await q(
      'SELECT period,source_key,template_id FROM ledger_entries WHERE id=? AND user_id=? AND deleted_at IS NULL',
      id,
      userId,
    ).first<{
      period: string;
      source_key: string;
      template_id: string | null;
    }>();
    if (!row) throw new FinanceError('Lançamento não encontrado.', 404);
    const extra: D1PreparedStatement[] = [];
    if (body.category !== undefined) {
      const category = categoryName(textValue(body.category, 'categoria'));
      await saveCategory({ name: category });
      extra.push(
        q(
          'UPDATE ledger_entries SET category=? WHERE id=? AND user_id=?',
          category,
          id,
          userId,
        ),
      );
    }
    if (body.dueDate !== undefined) {
      const entry = await q(
        'SELECT type FROM ledger_entries WHERE id=? AND user_id=?',
        id,
        userId,
      ).first<{ type: string }>();
      if (entry?.type !== 'expense' && body.dueDate)
        throw new FinanceError('Receitas não possuem vencimento.');
      extra.push(
        q(
          'UPDATE ledger_entries SET due_date=? WHERE id=? AND user_id=?',
          body.dueDate ? validDate(body.dueDate) : null,
          id,
          userId,
        ),
      );
    }
    if (body.amount !== undefined) {
      const cents = moneyCents(body.amount, row.source_key === 'salary');
      if (
        body.scope !== undefined &&
        body.scope !== 'single' &&
        body.scope !== 'future'
      )
        throw new FinanceError('Alcance inválido.');
      if (row.template_id && body.scope === 'future') {
        await db.batch([
          ...extra,
          q(
            'DELETE FROM recurrence_values WHERE user_id=? AND template_id=? AND effective_period>=?',
            userId,
            row.template_id,
            row.period,
          ),
          q(
            'INSERT INTO recurrence_values(user_id,template_id,effective_period,amount_cents) VALUES(?,?,?,?)',
            userId,
            row.template_id,
            row.period,
            cents,
          ),
          q(
            'UPDATE ledger_entries SET amount_cents=? WHERE user_id=? AND template_id=? AND period>=? AND deleted_at IS NULL',
            cents,
            userId,
            row.template_id,
            row.period,
          ),
        ]);
      } else
        await db.batch([
          ...extra,
          q(
            'UPDATE ledger_entries SET amount_cents=? WHERE id=? AND user_id=?',
            cents,
            id,
            userId,
          ),
        ]);
    } else if (body.status !== undefined) {
      if (
        typeof body.status !== 'string' ||
        !['pago', 'pendente', 'vencido'].includes(body.status)
      )
        throw new FinanceError('Situação inválida.');
      await q(
        'UPDATE ledger_entries SET status=? WHERE id=? AND user_id=?',
        body.status,
        id,
        userId,
      ).run();
    }
    if (body.amount === undefined && extra.length) await db.batch(extra);
    return { ok: true };
  }
  async function deleteEntry(body: Record<string, unknown>) {
    const id = textValue(body.id, 'lançamento', 250);
    const scope = body.scope;
    if (scope !== 'single' && scope !== 'future')
      throw new FinanceError('Escolha o alcance da exclusão.');
    const row = await q(
      'SELECT period,template_id FROM ledger_entries WHERE id=? AND user_id=?',
      id,
      userId,
    ).first<{ period: string; template_id: string | null }>();
    if (!row) throw new FinanceError('Lançamento não encontrado.', 404);
    if (scope === 'future' && row.template_id) {
      await db.batch([
        q(
          'UPDATE recurrence_templates SET stopped_from=CASE WHEN stopped_from IS NULL OR stopped_from>? THEN ? ELSE stopped_from END WHERE id=? AND user_id=?',
          row.period,
          row.period,
          row.template_id,
          userId,
        ),
        q(
          'UPDATE ledger_entries SET deleted_at=? WHERE user_id=? AND template_id=? AND period>=? AND deleted_at IS NULL',
          now(),
          userId,
          row.template_id,
          row.period,
        ),
      ]);
    } else
      await q(
        'UPDATE ledger_entries SET deleted_at=? WHERE id=? AND user_id=?',
        now(),
        id,
        userId,
      ).run();
    return { ok: true };
  }
  return {
    getProfile,
    saveProfile,
    openMonth,
    setMonthlySalary,
    listEntries,
    listCategories,
    saveCategory,
    createEntry,
    changeEntry,
    deleteEntry,
  };
}
