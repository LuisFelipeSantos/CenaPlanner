'use client';
import {
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from 'recharts';
import { ChartContainer } from '@/components/ui/chart';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableCell,
  TableRow,
  TableCaption,
} from '@/components/ui/table';
import { categoryTotals } from './category-utils';
type Entry = { category: string; amount: number; type: string; month: number };
const money = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});
const config = {
  income: { label: 'Receitas', color: '#18704c' },
  expense: { label: 'Despesas', color: '#b93d40' },
  balance: { label: 'Saldo', color: '#456ec1' },
};
export default function ReportCharts({
  entries,
  annual,
  hideValues = false,
}: {
  entries: Entry[];
  annual: boolean;
  hideValues?: boolean;
}) {
  const categories = categoryTotals(entries).map((c) => ({
    ...c,
    income: c.income / 100,
    expense: c.expense / 100,
    balance: c.balance / 100,
  }));
  const months = Array.from({ length: 12 }, (_, i) => {
    const rows = entries.filter((e) => e.month === i + 1);
    const income =
      rows
        .filter((e) => e.type === 'income')
        .reduce((s, e) => s + Math.round(e.amount * 100), 0) / 100;
    const expense =
      rows
        .filter((e) => e.type === 'expense')
        .reduce((s, e) => s + Math.round(e.amount * 100), 0) / 100;
    return {
      name: [
        'Jan',
        'Fev',
        'Mar',
        'Abr',
        'Mai',
        'Jun',
        'Jul',
        'Ago',
        'Set',
        'Out',
        'Nov',
        'Dez',
      ][i],
      income,
      expense,
      balance: income - expense,
    };
  });
  function chart(data: typeof categories, balance = false) {
    if (hideValues)
      return (
        <p className="rounded-lg bg-slate-50 p-4 text-sm">
          Gráfico oculto no modo privacidade · R$ ••••
        </p>
      );
    return (
      <ChartContainer
        config={config}
        className="w-full"
        style={{ height: balance ? 288 : Math.max(280, data.length * 110) }}
      >
        <BarChart
          data={
            balance
              ? data
              : [...data].sort(
                  (a, b) =>
                    Math.max(b.expense, b.income) -
                    Math.max(a.expense, a.income),
                )
          }
          layout={balance ? 'horizontal' : 'vertical'}
          accessibilityLayer
        >
          <CartesianGrid vertical={false} />
          <XAxis
            type={balance ? 'category' : 'number'}
            dataKey={balance ? 'name' : undefined}
          />
          <YAxis
            type={balance ? 'number' : 'category'}
            dataKey={balance ? undefined : 'name'}
            width={balance ? 70 : 140}
            interval={balance ? undefined : 0}
            tick={
              balance
                ? { fontSize: 12 }
                : ({
                    x,
                    y,
                    payload,
                  }: {
                    x?: number | string;
                    y?: number | string;
                    payload?: { value: string };
                  }) => {
                    const lines =
                      String(payload?.value ?? '').match(/.{1,18}/g) || [];
                    return (
                      <text
                        x={x}
                        y={y}
                        textAnchor="end"
                        fontSize={12}
                        fill="currentColor"
                      >
                        <title>{payload?.value}</title>
                        {lines.map((line, i) => (
                          <tspan
                            key={i}
                            x={x}
                            dy={i === 0 ? -(lines.length - 1) * 7 : 14}
                          >
                            {line}
                          </tspan>
                        ))}
                      </text>
                    );
                  }
            }
          />
          <Tooltip formatter={(v) => money.format(Number(v))} />
          <Legend />
          <Bar
            dataKey="income"
            name="Receitas"
            fill="var(--color-income)"
            radius={3}
          />
          <Bar
            dataKey="expense"
            name="Despesas"
            fill="var(--color-expense)"
            radius={3}
          />
          {balance && (
            <Bar
              dataKey="balance"
              name="Saldo"
              fill="var(--color-balance)"
              radius={3}
            />
          )}
        </BarChart>
      </ChartContainer>
    );
  }
  return (
    <section className="my-6 space-y-6 rounded-2xl border bg-white p-5">
      {annual && (
        <div>
          <h2 className="mb-4 font-semibold">
            Receitas, despesas e saldo — Janeiro a Dezembro
          </h2>
          {chart(months, true)}
        </div>
      )}
      <h2 className="font-semibold">Distribuição por categoria</h2>
      {!categories.length ? (
        <p>Nenhum lançamento neste recorte.</p>
      ) : (
        <>
          <div className="max-h-[480px] overflow-y-auto">
            {chart(categories)}
          </div>
          <div className="overflow-x-auto">
            <Table className="w-full text-sm">
              <TableCaption className="text-left py-2">
                Valores registrados, incluindo pendentes. O saldo é receitas
                menos despesas.
              </TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-left p-2">Categoria</TableHead>
                  <TableHead className="p-2 text-right">Receitas</TableHead>
                  <TableHead className="p-2 text-right">Despesas</TableHead>
                  <TableHead className="p-2 text-right">Saldo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categories.map((c) => (
                  <TableRow key={c.name} className="border-t">
                    <TableCell className="p-2">{c.name}</TableCell>
                    <TableCell className="text-right p-2">
                      {hideValues ? 'R$ ••••' : money.format(c.income)}
                    </TableCell>
                    <TableCell className="text-right p-2">
                      {hideValues ? 'R$ ••••' : money.format(c.expense)}
                    </TableCell>
                    <TableCell className="text-right p-2">
                      {hideValues ? 'R$ ••••' : money.format(c.balance)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </section>
  );
}
