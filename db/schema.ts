import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

export const entries = sqliteTable(
  'entries',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: text('user_id').notNull(),
    name: text('name').notNull(),
    category: text('category').notNull().default('Outros'),
    amount: real('amount').notNull(),
    type: text('type', { enum: ['expense', 'income'] })
      .notNull()
      .default('expense'),
    status: text('status', { enum: ['pago', 'pendente', 'vencido'] })
      .notNull()
      .default('pendente'),
    dueDay: integer('due_day'),
    entryDate: text('entry_date'),
    month: integer('month').notNull(),
    year: integer('year').notNull(),
    recurring: integer('recurring', { mode: 'boolean' })
      .notNull()
      .default(false),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    index('idx_entries_user_period').on(table.userId, table.year, table.month),
    index('idx_entries_user_date').on(table.userId, table.entryDate),
  ],
);

export const profiles = sqliteTable('profiles', {
  userId: text('user_id').primaryKey(),
  name: text('name').notNull(),
  monthlySalary: real('monthly_salary').notNull().default(0),
  createdAt: text('created_at').notNull(),
});

// Legacy tables above remain intact. All new money amounts use integer cents.
export const financialUsers = sqliteTable('financial_users', {
  userId: text('user_id').primaryKey(),
  name: text('name').notNull(),
  baseSalaryCents: integer('base_salary_cents').notNull(),
  initialPeriod: text('initial_period').notNull(),
  onboardingCompletedAt: text('onboarding_completed_at').notNull(),
  currency: text('currency').notNull().default('BRL'),
  timezone: text('timezone').notNull().default('America/Sao_Paulo'),
});
export const salaryDefaults = sqliteTable(
  'salary_defaults',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: text('user_id').notNull(),
    effectivePeriod: text('effective_period').notNull(),
    amountCents: integer('amount_cents').notNull(),
  },
  (t) => [
    uniqueIndex('uq_salary_default_period').on(t.userId, t.effectivePeriod),
  ],
);
export const monthlyCycles = sqliteTable(
  'monthly_cycles',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: text('user_id').notNull(),
    period: text('period').notNull(),
    initialSalaryCents: integer('initial_salary_cents').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [uniqueIndex('uq_cycle_user_period').on(t.userId, t.period)],
);
export const categories = sqliteTable(
  'categories',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: text('user_id').notNull(),
    name: text('name').notNull(),
    normalizedKey: text('normalized_key'),
    archived: integer('archived').notNull().default(0),
  },
  (t) => [
    uniqueIndex('uq_category_user_name').on(t.userId, t.name),
    uniqueIndex('uq_category_user_key').on(t.userId, t.normalizedKey),
  ],
);
export const recurrenceTemplates = sqliteTable(
  'recurrence_templates',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    name: text('name').notNull(),
    category: text('category').notNull(),
    amountCents: integer('amount_cents').notNull(),
    type: text('type', { enum: ['expense', 'income'] }).notNull(),
    startPeriod: text('start_period').notNull(),
    endDate: text('end_date'),
    intervalMonths: integer('interval_months').notNull().default(1),
    dueDay: integer('due_day').notNull(),
    repetitionCount: integer('repetition_count'),
    notificationDueDay: integer('notification_due_day'),
    dueMonthOffset: integer('due_month_offset').notNull().default(0),
    stoppedFrom: text('stopped_from'),
    createdAt: text('created_at').notNull(),
  },
  (t) => [index('idx_templates_user_start').on(t.userId, t.startPeriod)],
);
export const ledgerEntries = sqliteTable(
  'ledger_entries',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    period: text('period').notNull(),
    name: text('name').notNull(),
    category: text('category').notNull(),
    amountCents: integer('amount_cents').notNull(),
    type: text('type', { enum: ['expense', 'income'] }).notNull(),
    status: text('status', { enum: ['pago', 'pendente', 'vencido'] }).notNull(),
    entryDate: text('entry_date').notNull(),
    dueDate: text('due_date'),
    sourceKey: text('source_key').notNull(),
    templateId: text('template_id'),
    deletedAt: text('deleted_at'),
    createdAt: text('created_at').notNull(),
  },
  (t) => [
    uniqueIndex('uq_ledger_occurrence').on(t.userId, t.period, t.sourceKey),
    index('idx_ledger_user_date').on(t.userId, t.entryDate),
    index('idx_ledger_due_status').on(t.dueDate, t.status),
    index('idx_ledger_user_template_period').on(
      t.userId,
      t.templateId,
      t.period,
    ),
  ],
);

export const recurrenceValues = sqliteTable(
  'recurrence_values',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: text('user_id').notNull(),
    templateId: text('template_id').notNull(),
    effectivePeriod: text('effective_period').notNull(),
    amountCents: integer('amount_cents').notNull(),
  },
  (t) => [
    uniqueIndex('uq_recurrence_value').on(
      t.userId,
      t.templateId,
      t.effectivePeriod,
    ),
  ],
);
export const notificationPreferences = sqliteTable('notification_preferences', {
  userId: text('user_id').primaryKey(),
  email: text('email').notNull(),
  inApp: integer('in_app').notNull().default(1),
  emailEnabled: integer('email_enabled').notNull().default(0),
});
export const notificationJobs = sqliteTable(
  'notification_jobs',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    entryId: text('entry_id').notNull(),
    dueDate: text('due_date').notNull(),
    offsetDays: integer('offset_days').notNull(),
    channel: text('channel').notNull(),
    status: text('status').notNull().default('pending'),
    readAt: text('read_at'),
    createdAt: text('created_at').notNull(),
    attempts: integer('attempts').notNull().default(0),
    nextAttemptAt: text('next_attempt_at'),
    leaseToken: text('lease_token'),
    leaseUntil: text('lease_until'),
    sentAt: text('sent_at'),
    lastError: text('last_error'),
  },
  (t) => [
    uniqueIndex('uq_notification_event').on(
      t.entryId,
      t.dueDate,
      t.offsetDays,
      t.channel,
    ),
    index('idx_notification_user').on(t.userId, t.channel, t.readAt),
    index('idx_notification_queue').on(t.status, t.nextAttemptAt),
  ],
);
