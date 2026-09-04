'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Plus,
  Trash2,
  Pencil,
  Settings,
  LogOut,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import BrandLogo from './brand-logo';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

import {
  CategoryInput,
  CategoryFilter,
  CategoryStatus,
  type Category,
} from './category-controls';
import { visibleCategories, type CategoryVisibility } from './category-utils';
import ReportCharts from './report-charts';
import NotificationCenter from './notification-center';
type Entry = {
  id: string;
  name: string;
  category: string;
  amount: number;
  type: 'expense' | 'income';
  status: 'pago' | 'pendente' | 'vencido';
  entryDate: string;
  dueDate: string | null;
  month: number;
  year: number;
  templateId: string | null;
  isSalary: boolean;
};
type Profile = {
  name: string;
  monthlySalary: number;
  initialPeriod: string;
  onboardingCompletedAt: string;
};
type Mode = 'month' | 'year' | 'report';
type Modal =
  | 'categories'
  | 'profile'
  | 'entry'
  | 'salary'
  | 'edit'
  | 'editScope'
  | 'delete'
  | null;
const months = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];
const money = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});
function todayPeriod() {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date());
  return (
    parts.find((p) => p.type === 'year')!.value +
    '-' +
    parts.find((p) => p.type === 'month')!.value
  );
}
async function api<T>(
  url: string,
  method = 'GET',
  body?: object,
  signal?: AbortSignal,
): Promise<T> {
  let response: Response;
  try {
    const options: RequestInit = {
      method,
      signal: signal || AbortSignal.timeout(20000),
    };
    if (body) {
      options.headers = { 'content-type': 'application/json' };
      options.body = JSON.stringify(body);
    }
    response = await fetch(url, options);
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error('Falha de conexão. Tente novamente.');
  }
  const result = (await response.json().catch(() => ({
    error: 'O servidor retornou uma resposta inesperada.',
  }))) as T & { error?: string };
  if (!response.ok)
    throw new Error(result?.error || 'Não foi possível concluir a operação.');
  return result;
}
function formText(data: FormData, key: string) {
  const value = data.get(key);
  return typeof value === 'string' ? value : '';
}
const inputClass = 'mt-2 h-10 bg-white';
const selectClass = 'mt-2 h-10 w-full rounded-lg border bg-white px-3';

export default function Dashboard({
  accountName,
  accountEmail,
}: {
  accountName: string;
  accountEmail: string;
}) {
  const initial = todayPeriod();
  const [year, setYear] = useState(Number(initial.slice(0, 4))),
    [month, setMonth] = useState(Number(initial.slice(5)));
  const period = year + '-' + String(month).padStart(2, '0');
  const [view, setView] = useState<Mode>('month'),
    [profile, setProfile] = useState<Profile | null>(null),
    [profileLoaded, setProfileLoaded] = useState(false);
  const [entries, setEntries] = useState<Entry[]>([]),
    [modal, setModal] = useState<Modal>(null),
    [selected, setSelected] = useState<Entry | null>(null);
  const [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [formError, setFormError] = useState(''),
    [notice, setNotice] = useState('');
  const [query, setQuery] = useState(''),
    [status, setStatus] = useState('todos'),
    [repeat, setRepeat] = useState('once'),
    [revision, setRevision] = useState(0);
  const [report, setReport] = useState<{
    from: string;
    to: string;
  } | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryVisibility, setCategoryVisibility] =
    useState<CategoryVisibility>('active');
  const [categoryFilter, setCategoryFilter] = useState<string[]>([]);
  const [entryCategory, setEntryCategory] = useState('');
  const [editedDueDate, setEditedDueDate] = useState('');
  useEffect(() => {
    if (!profile) return;
    let active = true;
    api<Category[]>('/api/categories')
      .then((rows) => {
        if (active) setCategories(rows);
      })
      .catch(() => {
        if (active) setError('Não foi possível carregar as categorias.');
      });
    return () => {
      active = false;
    };
  }, [profile, revision]);
  const requestId = useRef('');
  const [entryType, setEntryType] = useState('expense');
  const [pendingAmount, setPendingAmount] = useState(0);
  useEffect(() => {
    let active = true;
    api<Profile | null>('/api/profile')
      .then((value) => {
        if (!active) return;
        setProfile(value);
        setProfileLoaded(true);
        if (!value) setModal('profile');
      })
      .catch((e) => {
        if (active) {
          setError(e.message);
          setProfileLoaded(true);
        }
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!profile) return;
    const controller = new AbortController();
    async function load() {
      await Promise.resolve();
      if (controller.signal.aborted) return;
      setEntries([]);
      setError('');
      setLoading(true);
      if (view === 'month')
        await api('/api/months', 'POST', { period }, controller.signal);
      if (view === 'report' && !report) return;
      const params =
        view === 'report'
          ? new URLSearchParams(report!)
          : new URLSearchParams({
              year: String(year),
              ...(view === 'month' ? { month: String(month) } : {}),
            });
      if (view !== 'month')
        categoryFilter.forEach((c) => params.append('category', c));
      const rows = await api<Entry[]>(
        '/api/entries?' + params,
        'GET',
        undefined,
        controller.signal,
      );
      if (!controller.signal.aborted) setEntries(rows);
    }
    load()
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [profile, period, year, month, view, report, revision, categoryFilter]);
  const totals = useMemo(
    () =>
      entries.reduce(
        (s, e) => {
          if (e.type === 'income') s.income += Math.round(e.amount * 100);
          else {
            s.expense += Math.round(e.amount * 100);
            if (e.status !== 'pago') s.pending += Math.round(e.amount * 100);
          }
          return s;
        },
        { income: 0, expense: 0, pending: 0 },
      ),
    [entries],
  );
  const visible = entries.filter(
    (e) =>
      (status === 'todos' || e.status === status) &&
      (e.name + ' ' + e.category).toLowerCase().includes(query.toLowerCase()),
  );
  const salary = entries.find((e) => e.isSalary)?.amount ?? 0;
  function open(value: Modal, entry: Entry | null = null) {
    if (value === 'categories') setCategoryVisibility('active');
    setSelected(entry);
    setEntryCategory(
      entry?.category ||
        (categoryFilter.length === 1
          ? categories.find((c) => c.key === categoryFilter[0])?.name || ''
          : ''),
    );
    setEditedDueDate(entry?.dueDate || '');
    setFormError('');
    setNotice('');
    setRepeat('once');
    setEntryType('expense');
    requestId.current = crypto.randomUUID();
    setModal(value);
  }
  function close() {
    if (!busy && profile) setModal(null);
  }
  async function mutate(work: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setFormError('');
    setError('');
    try {
      await work();
    } catch (e) {
      const message =
        e instanceof Error ? e.message : 'Não foi possível concluir.';
      setFormError(message);
      setError(message);
    } finally {
      setBusy(false);
    }
  }
  async function saveProfile(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const onboarding = !profile;
    await mutate(async () => {
      const saved = await api<Profile>('/api/profile', 'POST', {
        name: formText(data, 'name'),
        monthlySalary: Number(data.get('salary')),
        initialPeriod: formText(data, 'initialPeriod') || period,
      });
      setProfile(saved);
      setModal(null);
      if (onboarding) {
        setYear(Number(saved.initialPeriod.slice(0, 4)));
        setMonth(Number(saved.initialPeriod.slice(5)));
        setView('month');
      }
      setNotice(
        onboarding
          ? 'Conta preparada. Seu primeiro mês está pronto.'
          : 'Configurações salvas. Se o salário mudou, as previsões a partir do próximo mês foram atualizadas; mês atual e passado preservados.',
      );
    });
  }
  async function saveEntry(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    await mutate(async () => {
      const date = formText(data, 'date');
      await api('/api/entries', 'POST', {
        name: formText(data, 'name'),
        category: formText(data, 'category'),
        amount: Number(data.get('amount')),
        date,
        type: formText(data, 'type'),
        status: formText(data, 'status'),
        repeat,
        intervalMonths: 1,
        repetitionCount:
          repeat === 'count' ? Number(data.get('repetitionCount')) : undefined,
        dueDate:
          entryType === 'expense' ? formText(data, 'dueDate') || null : null,
        endDate: data.get('endDate'),
        requestId: requestId.current,
      });
      setYear(Number(date.slice(0, 4)));
      setMonth(Number(date.slice(5, 7)));
      setView('month');
      setModal(null);
      setRevision((v) => v + 1);
      setNotice('Lançamento salvo.');
    });
  }
  async function saveAmount(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const amount = Number(new FormData(event.currentTarget).get('amount'));
    if (modal === 'edit' && selected?.templateId) {
      setPendingAmount(amount);
      setModal('editScope');
      return;
    }
    await commitAmount(amount, 'single');
  }
  async function commitAmount(amount: number, scope: 'single' | 'future') {
    await mutate(async () => {
      if (modal === 'salary')
        await api('/api/months', 'PATCH', { period, amount });
      else
        await api('/api/entries', 'PATCH', {
          id: selected!.id,
          amount,
          scope,
          category: entryCategory,
          ...(selected!.type === 'expense'
            ? { dueDate: editedDueDate || null }
            : {}),
        });
      setModal(null);
      setRevision((v) => v + 1);
      setNotice(
        scope === 'future'
          ? 'Valor alterado neste mês e nas próximas ocorrências.'
          : 'Valor alterado apenas neste mês.',
      );
    });
  }
  async function remove(scope: 'single' | 'future') {
    await mutate(async () => {
      await api('/api/entries', 'DELETE', { id: selected!.id, scope });
      setModal(null);
      setRevision((v) => v + 1);
      setNotice(
        scope === 'future'
          ? 'Ocorrência e repetições futuras excluídas.'
          : 'Ocorrência excluída apenas deste mês.',
      );
    });
  }
  async function toggle(entry: Entry) {
    await mutate(async () => {
      await api('/api/entries', 'PATCH', {
        id: entry.id,
        status: entry.status === 'pago' ? 'pendente' : 'pago',
      });
      setRevision((v) => v + 1);
    });
  }
  async function logout() {
    await mutate(async () => {
      await api('/api/auth/logout', 'POST', {});
      location.replace('/');
    });
  }
  function reportSubmit(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setReport({
      from: formText(data, 'from'),
      to: formText(data, 'to'),
    });
  }
  return (
    <main className="min-h-screen bg-[#f5f7f4] text-[#17231d]">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-8">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <BrandLogo />
            <div>
              <h1 className="text-xl font-bold">Meu Controle</h1>
              <p className="text-sm text-[#6d7a73]">
                {profile?.name || accountName} · Finanças pessoais
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {profile && (
              <NotificationCenter
                revision={revision}
                onOpenMonth={(p) => {
                  setYear(Number(p.slice(0, 4)));
                  setMonth(Number(p.slice(5)));
                  setView('month');
                }}
              />
            )}
            <Button
              variant="outline"
              onClick={() => open('profile')}
              disabled={!profile || busy}
            >
              <Settings />
              Configurações
            </Button>
            <Button variant="outline" onClick={logout} disabled={busy}>
              <LogOut />
              Sair
            </Button>
            <Button
              className="bg-[#184e3a]"
              onClick={() => open('entry')}
              disabled={!profile || loading}
            >
              <Plus />
              Novo lançamento
            </Button>
          </div>
        </header>
        {profile && (
          <Button
            variant="outline"
            className="mb-4"
            onClick={() => open('categories')}
          >
            Gerenciar categorias
          </Button>
        )}
        <p className="mb-4 text-xs text-[#6d7a73]">{accountEmail}</p>
        {error && (
          <div
            role="alert"
            className="mb-4 rounded-xl bg-red-50 p-4 text-red-800"
          >
            {error}{' '}
            <Button variant="link" onClick={() => location.reload()}>
              Recarregar
            </Button>
          </div>
        )}
        {notice && (
          <output className="mb-4 block rounded-xl bg-green-50 p-4 text-green-800">
            {notice}
          </output>
        )}
        {!profileLoaded ? (
          <output>Carregando sua conta…</output>
        ) : (
          profile && (
            <>
              <section className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border bg-white p-4">
                <div className="flex items-center gap-3">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Ano anterior"
                    disabled={year <= 1900}
                    onClick={() => setYear((y) => y - 1)}
                  >
                    <ArrowLeft />
                  </Button>
                  <b className="text-xl">{year}</b>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Próximo ano"
                    disabled={year >= 2200}
                    onClick={() => setYear((y) => y + 1)}
                  >
                    <ArrowRight />
                  </Button>
                </div>
                <nav
                  className="flex flex-wrap gap-2"
                  aria-label="Visões financeiras"
                >
                  {(
                    [
                      ['month', 'Visão mensal'],
                      ['year', 'Visão anual'],
                      ['report', 'Relatórios'],
                    ] as const
                  ).map(([key, label]) => (
                    <Button
                      key={key}
                      variant={view === key ? 'default' : 'ghost'}
                      onClick={() => {
                        setView(key);
                        setNotice('');
                      }}
                    >
                      {label}
                    </Button>
                  ))}
                </nav>
              </section>
              {view === 'month' && (
                <>
                  <div className="mb-5 flex gap-2 overflow-x-auto pb-2">
                    {months.map((name, index) => (
                      <Button
                        key={name}
                        variant={month === index + 1 ? 'default' : 'outline'}
                        onClick={() => setMonth(index + 1)}
                      >
                        {name.slice(0, 3)}
                      </Button>
                    ))}
                  </div>
                  <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-2xl font-bold">
                        {months[month - 1]} de {year}
                      </h2>
                      <p className="text-sm text-[#6d7a73]">
                        Cada mês mantém seus próprios valores.
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      onClick={() => open('salary')}
                      disabled={loading}
                    >
                      Salário deste mês: {money.format(salary)}{' '}
                      <Pencil size={14} />
                    </Button>
                  </div>
                </>
              )}
              {view === 'year' && (
                <p className="mb-4 text-sm text-[#6d7a73]">
                  Resumo dos lançamentos registrados no ano, incluindo parcelas
                  futuras. Salários de meses ainda não abertos não são
                  projetados.
                </p>
              )}
              {view === 'year' && (
                <CategoryFilter
                  categories={categories}
                  value={categoryFilter}
                  onChange={setCategoryFilter}
                />
              )}
              {view === 'report' && (
                <form
                  onSubmit={reportSubmit}
                  className="mb-6 grid items-end gap-4 rounded-2xl border bg-white p-5 sm:grid-cols-4"
                >
                  <label htmlFor="finance-from">
                    Data inicial
                    <Input
                      id="finance-from"
                      name="from"
                      required
                      type="date"
                      className={inputClass}
                    />
                  </label>
                  <label htmlFor="finance-to">
                    Data final
                    <Input
                      id="finance-to"
                      name="to"
                      required
                      type="date"
                      className={inputClass}
                    />
                  </label>
                  <CategoryFilter
                    categories={categories}
                    value={categoryFilter}
                    onChange={setCategoryFilter}
                  />

                  <Button type="submit" disabled={loading}>
                    Aplicar filtros
                  </Button>
                </form>
              )}
              <section className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  ['Receitas', totals.income],
                  ['Despesas', totals.expense],
                  ['Falta pagar', totals.pending],
                  ['Saldo previsto', totals.income - totals.expense],
                ].map(([label, value]) => (
                  <article
                    key={label}
                    className="rounded-2xl border bg-white p-5"
                  >
                    <p className="text-sm text-[#6d7a73]">{label}</p>
                    <p className="mt-3 text-2xl font-bold">
                      {loading ? '…' : money.format(Number(value) / 100)}
                    </p>
                  </article>
                ))}
              </section>
              {!loading && view !== 'month' && (
                <ReportCharts entries={entries} annual={view === 'year'} />
              )}
              {loading ? (
                <output className="block p-8 text-center">
                  Carregando lançamentos…
                </output>
              ) : view === 'year' ? (
                <div className="overflow-x-auto rounded-2xl border bg-white">
                  <table className="w-full text-sm">
                    <caption className="p-5 text-left font-semibold">
                      Ano completo — {year}
                    </caption>
                    <thead>
                      <tr className="border-b bg-[#eef3ef]">
                        {['Mês', 'Receitas', 'Despesas', 'Saldo', ''].map(
                          (label, i) => (
                            <th key={i} className="p-4 text-left">
                              {label}
                            </th>
                          ),
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {months.map((name, index) => {
                        const list = entries.filter(
                          (e) => e.month === index + 1,
                        );
                        const income = list
                          .filter((e) => e.type === 'income')
                          .reduce((s, e) => s + Math.round(e.amount * 100), 0);
                        const expense = list
                          .filter((e) => e.type === 'expense')
                          .reduce((s, e) => s + Math.round(e.amount * 100), 0);
                        return (
                          <tr key={name} className="border-b">
                            <td className="p-4">{name}</td>
                            <td className="p-4 text-green-700">
                              {money.format(income / 100)}
                            </td>
                            <td className="p-4">
                              {money.format(expense / 100)}
                            </td>
                            <td className="p-4 font-semibold">
                              {money.format((income - expense) / 100)}
                            </td>
                            <td className="p-4">
                              <Button
                                variant="ghost"
                                onClick={() => {
                                  setMonth(index + 1);
                                  setView('month');
                                }}
                              >
                                Abrir mês
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <>
                  <section className="overflow-hidden rounded-2xl border bg-white">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b p-5">
                      <h2 className="font-semibold">
                        Lançamentos{' '}
                        {view === 'report' ? 'do período' : 'do mês'}
                      </h2>
                      <Input
                        aria-label="Buscar lançamento"
                        placeholder="Buscar descrição ou categoria"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        className="max-w-xs"
                      />
                      <select
                        aria-label="Filtrar situação"
                        value={status}
                        onChange={(e) => setStatus(e.target.value)}
                        className="rounded-lg border p-2"
                      >
                        <option value="todos">Todas as situações</option>
                        <option value="pendente">Pendente</option>
                        <option value="pago">Pago / recebido</option>
                        <option value="vencido">Vencido</option>
                      </select>
                    </div>
                    {visible.length === 0 ? (
                      <p className="p-10 text-center text-[#6d7a73]">
                        Nenhum lançamento encontrado.
                      </p>
                    ) : (
                      visible.map((e) => (
                        <article
                          key={e.id}
                          className="flex flex-wrap items-center justify-between gap-4 border-b p-5"
                        >
                          <div className="min-w-40 flex-1">
                            <b>{e.name}</b>
                            <p className="mt-1 text-xs text-[#6d7a73]">
                              {e.category}
                              {e.dueDate && (
                                <span className="font-semibold text-red-700">
                                  {' '}
                                  · Vence{' '}
                                  {e.dueDate.split('-').reverse().join('/')}
                                </span>
                              )}{' '}
                              · {e.entryDate.split('-').reverse().join('/')} ·{' '}
                              {e.templateId
                                ? 'Recorrente'
                                : e.isSalary
                                  ? 'Salário do mês'
                                  : 'Pontual'}
                            </p>
                          </div>
                          <div>
                            <p
                              className={
                                e.type === 'income'
                                  ? 'font-semibold text-green-700'
                                  : 'font-semibold'
                              }
                            >
                              {e.type === 'income' ? '+' : '−'}{' '}
                              {money.format(e.amount)}
                            </p>
                            <p className="mt-1 text-xs">
                              {e.status === 'pago'
                                ? e.type === 'income'
                                  ? 'Recebido'
                                  : 'Pago'
                                : e.status === 'pendente'
                                  ? 'Pendente'
                                  : 'Vencido'}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busy}
                              onClick={() => toggle(e)}
                            >
                              {e.status === 'pago'
                                ? 'Marcar pendente'
                                : e.type === 'income'
                                  ? 'Receber'
                                  : 'Pagar'}
                            </Button>
                            {view === 'month' ? (
                              <>
                                <Button
                                  size="icon-sm"
                                  variant="ghost"
                                  aria-label={'Editar ' + e.name}
                                  onClick={() => open('edit', e)}
                                >
                                  <Pencil />
                                </Button>
                                <Button
                                  size="icon-sm"
                                  variant="ghost"
                                  aria-label={'Excluir ' + e.name}
                                  onClick={() => open('delete', e)}
                                >
                                  <Trash2 />
                                </Button>
                              </>
                            ) : (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setYear(e.year);
                                  setMonth(e.month);
                                  setView('month');
                                }}
                              >
                                Abrir mês
                              </Button>
                            )}
                          </div>
                        </article>
                      ))
                    )}
                  </section>
                </>
              )}
            </>
          )
        )}
      </div>
      <Dialog
        open={modal !== null}
        onOpenChange={(value) => {
          if (!value) close();
        }}
      >
        <DialogContent
          className="max-h-[90vh] overflow-y-auto rounded-2xl p-6 sm:max-w-lg"
          showCloseButton={!!profile && !busy}
        >
          <DialogTitle className="text-2xl font-bold">
            {modal === 'categories'
              ? 'Categorias fixas'
              : modal === 'profile'
                ? profile
                  ? 'Configurações'
                  : 'Vamos preparar sua conta'
                : modal === 'entry'
                  ? 'Novo lançamento'
                  : modal === 'delete'
                    ? 'Excluir lançamento'
                    : modal === 'salary'
                      ? 'Salário deste mês'
                      : modal === 'editScope'
                        ? 'Onde aplicar o novo valor?'
                        : 'Editar valor deste mês'}
          </DialogTitle>
          <DialogDescription>
            {modal === 'categories'
              ? 'Cadastre e organize categorias para receitas e despesas.'
              : modal === 'profile'
                ? profile
                  ? 'O novo salário substitui as previsões a partir do próximo mês, inclusive meses futuros já abertos. O mês atual e o passado permanecem intactos.'
                  : 'Informe seu nome, salário padrão e o primeiro mês do seu controle.'
                : modal === 'entry'
                  ? 'Receitas e despesas podem ser pontuais, fixas ou repetir até uma data.'
                  : modal === 'delete'
                    ? 'Escolha o alcance da exclusão. Os meses anteriores serão preservados.'
                    : modal === 'editScope'
                      ? 'Escolha se a alteração deve atingir somente esta ocorrência ou também as seguintes da mesma série. Meses anteriores serão preservados.'
                      : 'O salário padrão não será modificado. Para lançamentos recorrentes, você poderá escolher o alcance da alteração ao continuar.'}
          </DialogDescription>
          {formError && (
            <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-800">
              {formError}
            </p>
          )}
          {modal === 'categories' && (
            <div className="space-y-4">
              <p>
                Categorias servem para receitas e despesas. Inativar oculta a
                sugestão padrão, sem modificar o histórico.
              </p>
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const form = e.currentTarget;
                  const name = formText(new FormData(form), 'name');
                  void mutate(async () => {
                    const saved = await api<Category>(
                      '/api/categories',
                      'POST',
                      { name },
                    );
                    setCategories((rows) =>
                      [...rows.filter((c) => c.key !== saved.key), saved].sort(
                        (a, b) => a.name.localeCompare(b.name, 'pt-BR'),
                      ),
                    );
                    form.reset();
                    setCategoryVisibility('active');
                    setNotice('Categoria cadastrada: ' + saved.name);
                    setRevision((v) => v + 1);
                  });
                }}
              >
                <Input
                  name="name"
                  required
                  maxLength={100}
                  placeholder="Nova categoria"
                  aria-label="Nome da nova categoria"
                />
                <Button type="submit" disabled={busy}>
                  {busy ? 'Cadastrando…' : 'Cadastrar'}
                </Button>
              </form>
              {notice && (
                <output className="block text-green-800">{notice}</output>
              )}
              <div className="max-h-72 overflow-auto">
                <CategoryStatus
                  value={categoryVisibility}
                  onChange={setCategoryVisibility}
                />
                {visibleCategories(categories, categoryVisibility).length ===
                  0 && (
                  <p className="py-4 text-sm text-[#6d7a73]">
                    Nenhuma categoria neste filtro.
                  </p>
                )}
                {visibleCategories(categories, categoryVisibility).map((c) => (
                  <div
                    key={c.key}
                    className="flex items-center justify-between border-b py-2"
                  >
                    <span>
                      {c.name}{' '}
                      <span
                        className={
                          c.archived
                            ? 'text-xs text-amber-800'
                            : 'text-xs text-green-800'
                        }
                      >
                        {c.archived ? 'Inativa' : 'Ativa'}
                      </span>
                    </span>
                    <Button
                      disabled={busy}
                      variant="ghost"
                      onClick={() =>
                        mutate(async () => {
                          const saved = await api<Category>(
                            '/api/categories',
                            'POST',
                            {
                              name: c.name,
                              archived: !c.archived,
                            },
                          );
                          setCategories((rows) =>
                            rows.map((row) =>
                              row.key === saved.key ? saved : row,
                            ),
                          );
                          setNotice(
                            'Categoria ' +
                              (saved.archived ? 'inativada: ' : 'ativada: ') +
                              saved.name,
                          );
                          setRevision((v) => v + 1);
                        })
                      }
                    >
                      {c.archived ? 'Ativar' : 'Inativar'}
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
          {modal === 'profile' && (
            <form onSubmit={saveProfile} className="space-y-4" aria-busy={busy}>
              <label className="block" htmlFor="finance-name">
                Seu nome
                <Input
                  id="finance-name"
                  name="name"
                  required
                  maxLength={100}
                  defaultValue={profile?.name || accountName}
                  disabled={busy}
                  className={inputClass}
                />
              </label>
              <label className="block" htmlFor="finance-salary">
                Salário mensal padrão
                <Input
                  id="finance-salary"
                  name="salary"
                  required
                  type="number"
                  min="0"
                  max="1000000000"
                  step="0.01"
                  defaultValue={profile?.monthlySalary ?? ''}
                  disabled={busy}
                  className={inputClass}
                />
              </label>
              {!profile && (
                <label className="block" htmlFor="finance-initialPeriod">
                  Primeiro mês
                  <Input
                    id="finance-initialPeriod"
                    name="initialPeriod"
                    required
                    type="month"
                    min="1900-01"
                    max="2200-12"
                    defaultValue={period}
                    disabled={busy}
                    className={inputClass}
                  />
                </label>
              )}
              <Button
                type="submit"
                disabled={busy}
                className="h-11 w-full bg-[#184e3a]"
              >
                {busy
                  ? 'Salvando…'
                  : profile
                    ? 'Salvar configurações'
                    : 'Concluir cadastro'}
              </Button>
            </form>
          )}
          {modal === 'entry' && (
            <form onSubmit={saveEntry} className="space-y-4" aria-busy={busy}>
              <fieldset disabled={busy} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <label htmlFor="finance-type">
                    Tipo
                    <select
                      id="finance-type"
                      name="type"
                      value={entryType}
                      onChange={(e) => setEntryType(e.target.value)}
                      className={selectClass}
                    >
                      <option value="expense">Despesa</option>
                      <option value="income">Receita / bônus</option>
                    </select>
                  </label>
                  <label htmlFor="finance-status">
                    Situação
                    <select
                      id="finance-status"
                      name="status"
                      className={selectClass}
                    >
                      <option value="pendente">Pendente</option>
                      <option value="pago">Pago / recebido</option>
                      <option value="vencido">Vencido</option>
                    </select>
                  </label>
                </div>
                <label className="block" htmlFor="finance-name">
                  Descrição
                  <Input
                    id="finance-name"
                    name="name"
                    required
                    maxLength={100}
                    className={inputClass}
                  />
                </label>
                <CategoryInput
                  categories={categories}
                  value={entryCategory}
                  onChange={setEntryCategory}
                  disabled={busy}
                />
                <div className="grid grid-cols-2 gap-3">
                  <label htmlFor="finance-amount">
                    Valor
                    <Input
                      id="finance-amount"
                      name="amount"
                      required
                      type="number"
                      min="0.01"
                      max="1000000000"
                      step="0.01"
                      className={inputClass}
                    />
                  </label>
                  <label htmlFor="finance-date">
                    Data do lançamento
                    <Input
                      id="finance-date"
                      name="date"
                      required
                      type="date"
                      defaultValue={period + '-01'}
                      className={inputClass}
                    />
                  </label>
                </div>
                {entryType === 'expense' && (
                  <label className="block" htmlFor="finance-dueDate">
                    Data de Vencimento{' '}
                    <span className="text-xs">(opcional)</span>
                    <Input
                      id="finance-dueDate"
                      name="dueDate"
                      type="date"
                      className={inputClass}
                    />
                  </label>
                )}
                <label className="block">
                  Repetição
                  <select
                    value={repeat}
                    onChange={(e) => setRepeat(e.target.value)}
                    className={selectClass}
                  >
                    <option value="once">
                      Somente no mês da data escolhida
                    </option>
                    <option value="count">
                      Todo mês / quantidade de parcelas
                    </option>
                    <option value="forever">Fixa / sem data final</option>
                    <option value="until">Parcelada / até uma data</option>
                  </select>
                </label>
                {repeat === 'count' && (
                  <label className="block" htmlFor="finance-repetitionCount">
                    Repetir quantas vezes?
                    <Input
                      id="finance-repetitionCount"
                      name="repetitionCount"
                      required
                      type="number"
                      min="1"
                      max="120"
                      defaultValue="1"
                      className={inputClass}
                    />
                  </label>
                )}
                {repeat === 'until' && (
                  <label className="block" htmlFor="finance-endDate">
                    Repetir até (inclusive)
                    <Input
                      id="finance-endDate"
                      name="endDate"
                      required
                      type="date"
                      className={inputClass}
                    />
                  </label>
                )}
                {repeat !== 'once' && (
                  <p className="text-xs text-[#6d7a73]">
                    A quantidade inclui a primeira ocorrência (máximo 120).
                    Séries com quantidade ou data final são gravadas
                    imediatamente. Cada repetição terá seu próprio valor e
                    situação. As próximas serão criadas como pendentes. Dias
                    29–31 são ajustados ao último dia de meses mais curtos.
                  </p>
                )}
                <Button
                  type="submit"
                  disabled={busy}
                  className="h-11 w-full bg-[#184e3a]"
                >
                  {busy ? 'Salvando…' : 'Salvar lançamento'}
                </Button>
              </fieldset>
            </form>
          )}
          {(modal === 'salary' || modal === 'edit') && (
            <form onSubmit={saveAmount} className="space-y-4">
              <p>
                {months[month - 1]} de {year}
                {selected ? ' · ' + selected.name : ''}
              </p>
              <label className="block" htmlFor="finance-amount">
                Valor
                <Input
                  id="finance-amount"
                  name="amount"
                  required
                  type="number"
                  min={modal === 'salary' || selected?.isSalary ? '0' : '0.01'}
                  step="0.01"
                  max="1000000000"
                  defaultValue={modal === 'salary' ? salary : selected?.amount}
                  disabled={busy}
                  className={inputClass}
                />
              </label>
              {modal === 'edit' && (
                <>
                  <CategoryInput
                    categories={categories}
                    value={entryCategory}
                    onChange={setEntryCategory}
                    disabled={busy}
                  />
                  {selected?.type === 'expense' && (
                    <label className="block" htmlFor="edit-due-date">
                      Data de vencimento (opcional)
                      <Input
                        id="edit-due-date"
                        type="date"
                        value={editedDueDate}
                        onChange={(e) => setEditedDueDate(e.target.value)}
                        disabled={busy}
                      />
                    </label>
                  )}
                  <p className="text-xs">
                    Categoria e vencimento são alterados somente nesta
                    ocorrência. O alcance escolhido aplica-se ao valor.
                  </p>
                </>
              )}
              <Button type="submit" disabled={busy} className="w-full">
                {busy
                  ? 'Salvando…'
                  : selected?.templateId
                    ? 'Continuar'
                    : 'Salvar apenas neste mês'}
              </Button>
            </form>
          )}
          {modal === 'editScope' && selected && (
            <div className="space-y-3">
              <p>
                Aplicar {money.format(pendingAmount)} a {selected.name} a partir
                de {months[selected.month - 1]} de {selected.year}?
              </p>
              <Button
                disabled={busy}
                className="w-full"
                onClick={() => commitAmount(pendingAmount, 'single')}
              >
                Alterar apenas este mês
              </Button>
              <Button
                disabled={busy}
                className="w-full"
                onClick={() => commitAmount(pendingAmount, 'future')}
              >
                Alterar para este mês e todos os meses futuros
              </Button>
              <Button
                disabled={busy}
                variant="outline"
                onClick={() => setModal('edit')}
              >
                Voltar
              </Button>
            </div>
          )}
          {modal === 'delete' && selected && (
            <div className="space-y-3">
              <p>
                <b>{selected.name}</b> · {money.format(selected.amount)} ·{' '}
                {months[selected.month - 1]} de {selected.year}
              </p>
              <Button
                className="w-full"
                variant="destructive"
                disabled={busy}
                onClick={() => remove('single')}
              >
                Excluir somente deste mês
              </Button>
              {selected.templateId && (
                <Button
                  className="w-full"
                  variant="destructive"
                  disabled={busy}
                  onClick={() => remove('future')}
                >
                  Excluir este mês e todas as futuras
                </Button>
              )}
              <Button
                className="w-full"
                variant="outline"
                disabled={busy}
                onClick={close}
              >
                Cancelar
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </main>
  );
}
