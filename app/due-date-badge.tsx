import { CalendarDays, Clock3, TriangleAlert } from 'lucide-react';
import { dueDays } from './due-alerts';

export default function DueDateBadge({
  date,
  paid,
  today,
}: {
  date: string | null;
  paid: boolean;
  today: string;
}) {
  if (!date) return null;
  const fullDate = date.split('-').reverse().join('/');
  const shortDate = fullDate.slice(0, 5);
  const days = dueDays(date, today);
  if (paid)
    return (
      <span className="mt-2 inline-flex items-center gap-1 text-xs text-gray-500">
        <CalendarDays className="size-3" aria-hidden="true" />
        Vencimento em {fullDate}
      </span>
    );
  const color =
    days < 0
      ? 'border-red-200 bg-red-50 text-red-700 font-medium'
      : days === 0
        ? 'border-amber-300 bg-amber-50 text-amber-800 font-semibold motion-safe:animate-pulse'
        : days <= 3
          ? 'border-yellow-200 bg-yellow-50 text-yellow-800'
          : 'border-transparent bg-gray-100 text-gray-700';
  const Icon = days < 0 ? TriangleAlert : days <= 3 ? Clock3 : CalendarDays;
  const label =
    days < 0
      ? `Venceu ${shortDate}`
      : days === 0
        ? `Vence hoje (${shortDate})`
        : days <= 3
          ? `Vence em ${days} ${days === 1 ? 'dia' : 'dias'} (${shortDate})`
          : `Vence ${fullDate}`;
  return (
    <span
      title={fullDate}
      className={`mt-2 inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs ${color}`}
    >
      <Icon className="size-3" aria-hidden="true" />
      {label}
    </span>
  );
}
