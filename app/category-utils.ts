export function categoryName(value: string) {
  return value.normalize('NFKC').trim().replace(/\s+/gu, ' ');
}
export function categoryKey(value: string) {
  return categoryName(value).toLocaleLowerCase('pt-BR');
}
export type CategoryVisibility = 'active' | 'archived' | 'all';
export function visibleCategories<T extends { archived: boolean }>(
  categories: T[],
  visibility: CategoryVisibility,
) {
  return categories.filter(
    (c) =>
      visibility === 'all' ||
      (visibility === 'archived' ? c.archived : !c.archived),
  );
}
export function categoryTotals<
  T extends { category: string; amount: number; type: string },
>(entries: T[]) {
  const groups = new Map<
    string,
    { name: string; income: number; expense: number; balance: number }
  >();
  for (const entry of entries) {
    const key = categoryKey(entry.category);
    const row = groups.get(key) || {
      name: categoryName(entry.category),
      income: 0,
      expense: 0,
      balance: 0,
    };
    const amount = Math.round(entry.amount * 100);
    if (entry.type === 'income') row.income += amount;
    else row.expense += amount;
    row.balance = row.income - row.expense;
    groups.set(key, row);
  }
  return [...groups.values()].sort(
    (a, b) => b.expense - a.expense || b.income - a.income,
  );
}
