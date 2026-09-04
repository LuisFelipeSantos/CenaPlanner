export function saoPauloDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  return ['year', 'month', 'day']
    .map((key) => parts.find((p) => p.type === key)!.value)
    .join('-');
}
export function dueDays(dueDate: string, today: string) {
  return Math.round(
    (Date.parse(dueDate + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) /
      86400000,
  );
}
export function dueGroup(
  entry: { type: string; status: string; dueDate: string | null },
  today: string,
) {
  if (entry.type !== 'expense' || entry.status === 'pago' || !entry.dueDate)
    return null;
  const days = dueDays(entry.dueDate, today);
  return days < 0
    ? 'overdue'
    : days === 0
      ? 'today'
      : days <= 7
        ? 'soon'
        : null;
}
