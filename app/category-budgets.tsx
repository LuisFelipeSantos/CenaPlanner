'use client';
import { useState, useId } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Check, Target } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { categoryKey } from './category-utils';
import type { Category } from './category-controls';
export function BudgetEditor({
  category,
  hidden,
  busy,
  onSave,
}: {
  category: Category;
  hidden: boolean;
  busy: boolean;
  onSave: (value: number | null) => Promise<void>;
}) {
  const [value, setValue] = useState(category.monthlyBudget?.toString() ?? '');
  const inputId = useId();
  const dirty =
    (value.trim() ? Number(value) : null) !== (category.monthlyBudget ?? null);
  if (hidden) return <span className="text-sm">Teto mensal: R$ ••••</span>;
  return (
    <form
      className="grid grid-cols-[minmax(0,1fr)_2rem] items-center gap-1"
      onSubmit={(e) => {
        e.preventDefault();
        void onSave(value.trim() ? Number(value) : null);
      }}
    >
      <div className="relative">
        <label className="sr-only" htmlFor={inputId}>
          Teto mensal de {category.name}
        </label>
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-gray-500"
        >
          R$
        </span>
        <Input
          id={inputId}
          aria-label={'Teto mensal de ' + category.name}
          className="h-9 w-full min-w-0 bg-white pl-8 pr-2 text-sm tabular-nums"
          disabled={busy}
          type="number"
          min="0.01"
          max="1000000000"
          step="0.01"
          placeholder="Sem teto"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      </div>
      {dirty ? (
        <Button
          type="submit"
          size="icon-sm"
          variant="ghost"
          disabled={busy}
          aria-label={'Salvar teto de ' + category.name}
          title="Salvar teto"
        >
          <Check aria-hidden="true" />
        </Button>
      ) : (
        <span aria-hidden="true" />
      )}
    </form>
  );
}
export function CategoryBudgets({
  categories,
  entries,
  hidden,
  period,
}: {
  categories: Category[];
  entries: { category: string; amount: number; type: string }[];
  hidden: boolean;
  period: string;
}) {
  const budgets = categories.filter(
    (c) => c.monthlyBudget != null && c.monthlyBudget > 0,
  );
  if (!budgets.length) return null;
  const format = (v: number) =>
    hidden
      ? 'R$ ••••'
      : new Intl.NumberFormat('pt-BR', {
          style: 'currency',
          currency: 'BRL',
        }).format(v);
  return (
    <section className="my-5 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="mb-1 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-base font-semibold text-gray-800">
          <Target aria-hidden="true" className="size-4 text-gray-400" />
          Metas do Mês
        </h2>
        <span className="text-xs tabular-nums text-gray-400">
          {period.split('-').reverse().join('/')}
        </span>
      </div>
      <p className="mb-6 text-xs text-gray-400">
        Despesas registradas no mês, incluindo pendentes.
      </p>
      <div className="space-y-5">
        {budgets.map((c) => {
          const spent =
            entries
              .filter(
                (e) =>
                  e.type === 'expense' && categoryKey(e.category) === c.key,
              )
              .reduce((sum, e) => sum + Math.round(e.amount * 100), 0) / 100;
          const ratio = (spent / c.monthlyBudget!) * 100;
          return (
            <div key={c.key}>
              <div className="mb-2.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-sm">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="break-words font-semibold text-gray-800">
                    {c.name}
                  </span>
                  {!hidden && (
                    <Badge
                      className={
                        ratio >= 100
                          ? 'bg-red-50 text-red-800'
                          : ratio >= 80
                            ? 'bg-amber-50 text-amber-800'
                            : 'bg-green-50 text-green-800'
                      }
                    >
                      {ratio >= 100
                        ? 'Estourada'
                        : ratio >= 80
                          ? `${Math.floor(ratio)}% • Próximo do limite`
                          : `${Math.floor(ratio)}% • Dentro do limite`}
                    </Badge>
                  )}
                </div>
                <span className="whitespace-nowrap font-medium tabular-nums text-gray-600">
                  {format(spent)} / {format(c.monthlyBudget!)}
                </span>
              </div>
              {!hidden && (
                <>
                  <Progress
                    aria-label={'Uso do teto de ' + c.name}
                    value={Math.min(ratio, 100)}
                    className={
                      'mt-2.5 [&_[data-slot=progress-track]]:h-2.5 [&_[data-slot=progress-track]]:rounded-full [&_[data-slot=progress-track]]:bg-gray-200 [&_[data-slot=progress-indicator]]:rounded-full ' +
                      (ratio >= 100
                        ? '[&_[data-slot=progress-indicator]]:bg-red-600'
                        : ratio >= 80
                          ? '[&_[data-slot=progress-indicator]]:bg-amber-500'
                          : '[&_[data-slot=progress-indicator]]:bg-green-600')
                    }
                  />
                </>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
