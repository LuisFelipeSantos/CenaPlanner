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
  Check,
  RotateCcw,
  Eye,
  EyeOff,
} from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { BudgetEditor, CategoryBudgets } from './category-budgets';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
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
import { dueDays, dueGroup, saoPauloDate } from './due-alerts';
import DueDateBadge from './due-date-badge';
type Entry = {
  id: string;
  name: string;
  category: string;
  amount: number;
  type: 'expense' | 'income';
  status: 'pago' | 'pendente' | 'vencido';
  entryDate: string;
  dueDate: string | null;
  paidAt: string | null;
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
  | 'batchDelete'
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
  const [hideValues, setHideValues] = useState(true);
  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (!active) return;
      try {
        setHideValues(localStorage.getItem('cenaplanner:privacy') === 'true');
      } catch {
        setHideValues(false);
      }
    });
    return () => {
      active = false;
    };
  }, []);
  const money = {
    format: (value: number) =>
      hideValues
        ? 'R$ ••••'
        : new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL',
          }).format(value),
  };
  const [quickFilter, setQuickFilter] = useState<
    'overdue' | 'today' | 'soon' | null
  >(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
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
  const [dueEntries, setDueEntries] = useState<Entry[]>([]);
  const [dueError, setDueError] = useState('');
  const [today, setToday] = useState(() => saoPauloDate());
  useEffect(() => {
    if (!profile) return;
    let active = true;
    async function refresh() {
      try {
        const rows = await api<Entry[]>('/api/entries?alerts=due');
        if (active) {
          setDueEntries(rows);
          setToday(saoPauloDate());
          setDueError('');
        }
      } catch {
        if (active)
          setDueError(
            'Não foi possível conferir os vencimentos. Tentaremos novamente em instantes.',
          );
      }
    }
    void refresh();
    const timer = setInterval(refresh, 60000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [profile, revision]);
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
  const visible = (
    quickFilter
      ? dueEntries.filter((e) => dueGroup(e, today) === quickFilter)
      : entries
  ).filter(
    (e) =>
      (status === 'todos' ||
        (dueGroup(e, today) === 'overdue' ? 'vencido' : e.status) === status) &&
      (e.name + ' ' + e.category).toLowerCase().includes(query.toLowerCase()),
  );
  const salary = entries.find((e) => e.isSalary)?.amount ?? 0;
  const visibleSelected = selectedIds.filter((id) =>
    visible.some((e) => e.id === id),
  );
  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (active) setSelectedIds([]);
    });
    return () => {
      active = false;
    };
  }, [
    period,
    view,
    report,
    categoryFilter,
    query,
    status,
    quickFilter,
    revision,
  ]);
  async function applyBatch(action: 'pay' | 'delete') {
    await mutate(async () => {
      await api('/api/entries/batch', 'POST', { ids: visibleSelected, action });
      setSelectedIds([]);
      setRevision((v) => v + 1);
      setModal(null);
      setNotice(
        action === 'pay'
          ? 'Lançamentos marcados como pagos/recebidos.'
          : 'Ocorrências selecionadas excluídas.',
      );
    });
  }
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
              <DropdownMenu>
                <DropdownMenuTrigger className="rounded px-1 py-1 text-sm text-[#6d7a73] hover:bg-slate-100">
                  {profile?.name || accountName} ▾
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-auto min-w-60">
                  <p className="px-3 py-2 text-sm">{accountEmail}</p>
                  <DropdownMenuItem
                    onClick={() => open('profile')}
                    disabled={!profile || busy}
                  >
                    Configurações
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => open('categories')}
                    disabled={!profile || busy}
                  >
                    Gerenciar categorias
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={logout} disabled={busy}>
                    Sair
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              aria-label={hideValues ? 'Mostrar valores' : 'Ocultar valores'}
              aria-pressed={hideValues}
              onClick={() => {
                const next = !hideValues;
                setHideValues(next);
                try {
                  localStorage.setItem('cenaplanner:privacy', String(next));
                } catch {}
              }}
            >
              {hideValues ? <EyeOff /> : <Eye />}
            </Button>
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
              <section
                aria-label="Alertas de vencimento"
                className="mb-3 space-y-2"
              >
                <h2 className="sr-only">Vencimentos de todos os meses</h2>
                {dueError && (
                  <p role="alert" className="text-red-700">
                    {dueError}
                  </p>
                )}
                <div className="grid items-start gap-2 md:grid-cols-3">
                  {(
                    [
                      [
                        'overdue',
                        'Vencidas',
                        'border-slate-200 bg-white text-slate-700',
                      ],
                      [
                        'today',
                        'Vencem hoje',
                        'border-slate-200 bg-white text-slate-700',
                      ],
                      [
                        'soon',
                        'Próximos 7 dias',
                        'border-slate-200 bg-white text-slate-700',
                      ],
                    ] as const
                  ).map(([group, title, color]) => {
                    const rows = dueEntries
                      .filter((e) => dueGroup(e, today) === group)
                      .sort((a, b) => a.dueDate!.localeCompare(b.dueDate!));
                    return (
                      <div
                        key={group}
                        className={`rounded-lg border px-3 py-2 ${color} ${quickFilter === group ? 'ring-2 ring-green-700' : ''}`}
                      >
                        <button
                          type="button"
                          className="w-full cursor-pointer rounded text-left text-sm font-semibold leading-6 hover:bg-slate-100 focus-visible:outline-2"
                          aria-pressed={quickFilter === group}
                          onClick={() => {
                            setQuickFilter(
                              quickFilter === group ? null : group,
                            );
                            setQuery('');
                            setStatus('todos');
                            setView('month');
                          }}
                          title="Filtrar despesas de todos os meses"
                        >
                          {rows.length > 0 && (
                            <span className="mr-2 inline-flex items-center align-middle">
                              <span
                                aria-hidden="true"
                                className="h-2 w-2 rounded-full bg-red-600"
                              />
                              <span className="sr-only">
                                Há despesas pendentes. Expanda para ver.{' '}
                              </span>
                            </span>
                          )}
                          {title} ({rows.length})
                          <span className="ml-2 inline-block font-normal tabular-nums text-slate-500">
                            {money.format(
                              rows.reduce(
                                (sum, e) => sum + Math.round(e.amount * 100),
                                0,
                              ) / 100,
                            )}
                          </span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </section>
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
                <ReportCharts
                  entries={entries}
                  annual={view === 'year'}
                  hideValues={hideValues}
                />
              )}
              {!loading && view === 'month' && (
                <CategoryBudgets
                  categories={categories}
                  entries={entries}
                  hidden={hideValues}
                  period={period}
                />
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
                    {quickFilter && (
                      <p className="px-5 py-2 text-sm">
                        Filtro de vencimentos ativo · todos os meses{' '}
                        <Button
                          variant="link"
                          onClick={() => setQuickFilter(null)}
                        >
                          Limpar filtro
                        </Button>
                      </p>
                    )}
                    <div className="flex items-center gap-3 border-b px-5 py-3">
                      <Checkbox
                        aria-label="Selecionar todos"
                        disabled={busy || !visible.length}
                        checked={
                          visible.length > 0 &&
                          visibleSelected.length ===
                            Math.min(visible.length, 100)
                        }
                        indeterminate={
                          visibleSelected.length > 0 &&
                          visibleSelected.length < Math.min(visible.length, 100)
                        }
                        onCheckedChange={(checked) =>
                          setSelectedIds(
                            checked
                              ? visible.slice(0, 100).map((e) => e.id)
                              : [],
                          )
                        }
                      />
                      <span className="text-sm">
                        Selecionar todos
                        {visible.length > 100 ? ' (primeiros 100)' : ''}
                      </span>
                    </div>
                    {visibleSelected.length > 0 && (
                      <div className="sticky top-2 z-10 flex flex-wrap items-center gap-3 rounded-lg border bg-white p-3 shadow-md">
                        <b>{visibleSelected.length} selecionados</b>
                        <Button
                          disabled={busy}
                          onClick={() => applyBatch('pay')}
                        >
                          Marcar como pago/recebido
                        </Button>
                        <Button
                          variant="outline"
                          disabled={busy}
                          onClick={() => {
                            setFormError('');
                            setModal('batchDelete');
                          }}
                        >
                          Excluir selecionados
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={() => setSelectedIds([])}
                        >
                          Cancelar seleção
                        </Button>
                      </div>
                    )}
                    {visible.length === 0 ? (
                      <p className="p-10 text-center text-[#6d7a73]">
                        Nenhum lançamento encontrado.
                      </p>
                    ) : (
                      visible.map((e) => (
                        <article
                          key={e.id}
                          className={`flex flex-wrap items-center justify-between gap-4 border-b p-5 ${e.status === 'pago' ? 'bg-[#F8FAFC]' : ''}`}
                        >
                          <Checkbox
                            aria-label={'Selecionar ' + e.name}
                            disabled={
                              busy ||
                              (!selectedIds.includes(e.id) &&
                                selectedIds.length >= 100)
                            }
                            checked={selectedIds.includes(e.id)}
                            onCheckedChange={(checked) =>
                              setSelectedIds((ids) =>
                                checked
                                  ? [...ids, e.id]
                                  : ids.filter((id) => id !== e.id),
                              )
                            }
                          />
                          <div className="min-w-40 flex-1">
                            <b>{e.name}</b>
                            <p className="mt-1 text-xs text-[#6d7a73]">
                              {e.category} ·{' '}
                              {e.entryDate.split('-').reverse().join('/')} ·{' '}
                              {e.templateId
                                ? 'Recorrente'
                                : e.isSalary
                                  ? 'Salário do mês'
                                  : 'Pontual'}
                            </p>
                            <DueDateBadge
                              date={e.dueDate}
                              paid={e.status === 'pago'}
                              today={today}
                            />
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
                            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-sm">
                              <Badge
                                className={`h-auto py-1 text-sm ${e.status === 'pago' ? 'bg-[#DCFCE7] text-[#166534]' : dueGroup(e, today) === 'overdue' || e.status === 'vencido' ? 'bg-[#FEE2E2] text-[#991B1B]' : 'bg-[#FEF3C7] text-[#92400E]'}`}
                              >
                                {e.status === 'pago' && (
                                  <Check aria-hidden="true" />
                                )}
                                {e.status === 'pago'
                                  ? e.type === 'income'
                                    ? 'Recebido'
                                    : 'Pago'
                                  : dueGroup(e, today) === 'overdue'
                                    ? 'Vencido'
                                    : dueGroup(e, today) === 'today'
                                      ? 'Pendente · vence hoje'
                                      : e.status === 'pendente'
                                        ? 'Pendente'
                                        : 'Vencido'}
                              </Badge>
                              {dueGroup(e, today) === 'overdue' && (
                                <span className="text-sm text-[#991B1B]">
                                  {-dueDays(e.dueDate!, today)} dia(s) de atraso
                                </span>
                              )}
                              {e.status === 'pago' && e.paidAt && (
                                <span className="ml-1 text-slate-500">
                                  ·{' '}
                                  {new Intl.DateTimeFormat('pt-BR', {
                                    timeZone: 'America/Sao_Paulo',
                                  }).format(new Date(e.paidAt))}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busy}
                              onClick={() => toggle(e)}
                              className={
                                e.status === 'pago'
                                  ? 'border-transparent bg-transparent text-slate-600 hover:border-slate-300 hover:bg-white hover:text-slate-900'
                                  : 'border-green-600 bg-white text-green-800 hover:bg-green-50 hover:text-green-900'
                              }
                            >
                              {e.status === 'pago' ? (
                                <RotateCcw aria-hidden="true" />
                              ) : (
                                <Check aria-hidden="true" />
                              )}
                              {e.status === 'pago'
                                ? e.type === 'income'
                                  ? 'Desfazer recebimento'
                                  : 'Desfazer pagamento'
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
          className={`max-h-[90vh] overflow-y-auto rounded-2xl p-4 sm:p-6 ${modal === 'categories' ? 'sm:max-w-2xl' : 'sm:max-w-lg'}`}
          showCloseButton={!!profile && !busy}
        >
          <DialogTitle className="text-2xl font-bold">
            {modal === 'batchDelete'
              ? 'Excluir selecionados'
              : modal === 'categories'
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
          {hideValues && modal !== 'batchDelete' ? (
            <div className="space-y-3">
              <p>
                Valores ocultos. Mostre os valores para editar com segurança.
              </p>
              <Button
                onClick={() => {
                  setHideValues(false);
                  try {
                    localStorage.setItem('cenaplanner:privacy', 'false');
                  } catch {}
                }}
              >
                Mostrar valores
              </Button>
            </div>
          ) : (
            <>
              {formError && (
                <p
                  role="alert"
                  className="rounded-lg bg-red-50 p-3 text-red-800"
                >
                  {formError}
                </p>
              )}
              {modal === 'batchDelete' && (
                <div className="space-y-4">
                  <p>
                    Excluir {visibleSelected.length} lançamento(s)? Apenas as
                    ocorrências selecionadas serão excluídas; outras repetições
                    não serão alteradas.
                  </p>
                  <div className="flex gap-2">
                    <Button
                      disabled={busy || !visibleSelected.length}
                      onClick={() => applyBatch('delete')}
                    >
                      Confirmar exclusão
                    </Button>
                    <Button variant="outline" disabled={busy} onClick={close}>
                      Cancelar
                    </Button>
                  </div>
                </div>
              )}
              {modal === 'categories' && (
                <div className="space-y-4">
                  <form
                    className="grid items-end gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4 sm:grid-cols-[minmax(0,1fr)_10rem_auto]"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const form = e.currentTarget;
                      const name = formText(new FormData(form), 'name');
                      void mutate(async () => {
                        const saved = await api<Category>(
                          '/api/categories',
                          'POST',
                          {
                            name,
                            monthlyBudget: formText(
                              new FormData(form),
                              'budget',
                            ).trim()
                              ? Number(formText(new FormData(form), 'budget'))
                              : null,
                          },
                        );
                        setCategories((rows) =>
                          [
                            ...rows.filter((c) => c.key !== saved.key),
                            saved,
                          ].sort((a, b) =>
                            a.name.localeCompare(b.name, 'pt-BR'),
                          ),
                        );
                        form.reset();
                        setCategoryVisibility('active');
                        setNotice('Categoria cadastrada: ' + saved.name);
                        setRevision((v) => v + 1);
                      });
                    }}
                  >
                    <label
                      className="min-w-0 text-sm font-medium text-gray-700"
                      htmlFor="new-category-name"
                    >
                      Nome da categoria
                      <Input
                        id="new-category-name"
                        className="mt-1.5 h-10 bg-white"
                        name="name"
                        required
                        maxLength={100}
                        placeholder="Nova categoria"
                        aria-label="Nome da nova categoria"
                      />
                    </label>
                    <label
                      className="min-w-0 text-sm font-medium text-gray-700"
                      htmlFor="new-category-budget"
                    >
                      Teto mensal (opcional)
                      <Input
                        id="new-category-budget"
                        className="mt-1.5 h-10 bg-white"
                        name="budget"
                        aria-label="Teto mensal (R$)"
                        placeholder="Teto mensal (R$)"
                        type="number"
                        min="0.01"
                        max="1000000000"
                        step="0.01"
                      />
                    </label>
                    <Button
                      type="submit"
                      disabled={busy}
                      className="h-10 whitespace-nowrap"
                    >
                      <Plus aria-hidden="true" />
                      {busy ? 'Cadastrando…' : 'Cadastrar'}
                    </Button>
                  </form>
                  {notice && (
                    <output className="block text-green-800">{notice}</output>
                  )}
                  <div>
                    <CategoryStatus
                      value={categoryVisibility}
                      onChange={setCategoryVisibility}
                    />
                    <div className="overflow-x-auto">
                      <div className="min-w-[480px]">
                        <div className="grid grid-cols-[minmax(0,1fr)_11rem_3.5rem] gap-4 border-b border-gray-200 px-3 py-2 text-sm text-gray-500">
                          <span>Categoria</span>
                          <span>Teto mensal</span>
                          <span className="text-center">Ativa</span>
                        </div>
                        <div className="max-h-[360px] overflow-y-auto scroll-smooth">
                          {visibleCategories(categories, categoryVisibility)
                            .length === 0 && (
                            <p className="py-4 text-sm text-[#6d7a73]">
                              Nenhuma categoria neste filtro.
                            </p>
                          )}
                          {visibleCategories(
                            categories,
                            categoryVisibility,
                          ).map((c) => (
                            <div
                              key={c.key}
                              className="grid min-h-[60px] grid-cols-[minmax(0,1fr)_11rem_3.5rem] items-center gap-4 border-b border-gray-100 px-3 py-2 last:border-0"
                            >
                              <div className="flex min-w-0 items-center gap-2">
                                <span
                                  className="truncate font-medium text-gray-800"
                                  title={c.name}
                                >
                                  {c.name}
                                </span>
                                <Badge
                                  className={
                                    c.archived
                                      ? 'shrink-0 bg-gray-100 text-gray-500'
                                      : 'shrink-0 bg-green-50 text-green-700'
                                  }
                                >
                                  {c.archived ? 'Inativa' : 'Ativa'}
                                </Badge>
                              </div>
                              <BudgetEditor
                                key={c.key + ':' + c.monthlyBudget}
                                category={c}
                                hidden={hideValues}
                                busy={busy}
                                onSave={(value) =>
                                  mutate(async () => {
                                    await api('/api/categories', 'POST', {
                                      name: c.name,
                                      archived: c.archived,
                                      monthlyBudget: value,
                                    });
                                    setRevision((v) => v + 1);
                                    setNotice('Teto mensal salvo.');
                                  })
                                }
                              />
                              <Switch
                                className="justify-self-center"
                                checked={!c.archived}
                                aria-label={
                                  (c.archived ? 'Ativar' : 'Inativar') +
                                  ' ' +
                                  c.name
                                }
                                disabled={busy}
                                onCheckedChange={() =>
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
                                        (saved.archived
                                          ? 'inativada: '
                                          : 'ativada: ') +
                                        saved.name,
                                    );
                                    setRevision((v) => v + 1);
                                  })
                                }
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              {modal === 'profile' && (
                <form
                  onSubmit={saveProfile}
                  className="space-y-4"
                  aria-busy={busy}
                >
                  {profile && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => open('categories')}
                    >
                      Gerenciar categorias
                    </Button>
                  )}
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
                <form
                  onSubmit={saveEntry}
                  className="space-y-4"
                  aria-busy={busy}
                >
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
                      <label
                        className="block"
                        htmlFor="finance-repetitionCount"
                      >
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
                      min={
                        modal === 'salary' || selected?.isSalary ? '0' : '0.01'
                      }
                      step="0.01"
                      max="1000000000"
                      defaultValue={
                        modal === 'salary' ? salary : selected?.amount
                      }
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
                    Aplicar {money.format(pendingAmount)} a {selected.name} a
                    partir de {months[selected.month - 1]} de {selected.year}?
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
            </>
          )}
        </DialogContent>
      </Dialog>
    </main>
  );
}
