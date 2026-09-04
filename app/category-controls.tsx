'use client';
import { useState } from 'react';
import {
  Combobox,
  ComboboxInput,
  ComboboxContent,
  ComboboxList,
  ComboboxItem,
  ComboboxEmpty,
} from '@/components/ui/combobox';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@/components/ui/popover';
import {
  categoryKey,
  visibleCategories,
  type CategoryVisibility,
} from './category-utils';
export function CategoryStatus({
  value,
  onChange,
}: {
  value: CategoryVisibility;
  onChange: (value: CategoryVisibility) => void;
}) {
  return (
    <fieldset
      aria-label="Exibir categorias"
      className="flex flex-wrap gap-1 p-1"
    >
      {(
        [
          ['active', 'Apenas ativas'],
          ['archived', 'Apenas inativas'],
          ['all', 'Todas'],
        ] as const
      ).map(([key, label]) => (
        <Button
          key={key}
          type="button"
          size="sm"
          variant={value === key ? 'default' : 'ghost'}
          aria-pressed={value === key}
          onClick={() => onChange(key)}
        >
          {label}
        </Button>
      ))}
    </fieldset>
  );
}
export type Category = { name: string; key: string; archived: boolean };
export function CategoryInput({
  categories,
  value,
  onChange,
  disabled = false,
}: {
  categories: Category[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const [visibility, setVisibility] = useState<CategoryVisibility>('active');
  const names = visibleCategories(categories, visibility).map((c) => c.name);
  return (
    <div className="space-y-2">
      <label htmlFor="entry-category">Categoria</label>
      <Combobox<string>
        items={names}
        inputValue={value}
        onInputValueChange={onChange}
        onValueChange={(v) => {
          if (v) onChange(v);
        }}
        disabled={disabled}
      >
        <ComboboxInput
          id="entry-category"
          placeholder="Selecione ou digite uma categoria"
          maxLength={100}
        />
        <ComboboxContent>
          <CategoryStatus value={visibility} onChange={setVisibility} />
          <ComboboxEmpty>
            Nova categoria — será salva com o lançamento.
          </ComboboxEmpty>
          <ComboboxList>
            {(name: string) => (
              <ComboboxItem key={name} value={name}>
                {name}
                {categories.find((c) => c.name === name)?.archived && (
                  <span className="ml-2 text-xs text-amber-800">Inativa</span>
                )}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
      <input type="hidden" name="category" value={value} />
    </div>
  );
}
export function CategoryFilter({
  categories,
  value,
  onChange,
}: {
  categories: Category[];
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const [search, setSearch] = useState('');
  const [visibility, setVisibility] = useState<CategoryVisibility>('active');
  return (
    <Popover>
      <PopoverTrigger render={<Button type="button" variant="outline" />}>
        {value.length
          ? value.length + ' categorias selecionadas'
          : 'Todas as categorias'}
      </PopoverTrigger>
      <PopoverContent className="w-80 p-3">
        <CategoryStatus value={visibility} onChange={setVisibility} />
        <Input
          aria-label="Buscar categorias"
          placeholder="Buscar categoria"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Button type="button" variant="ghost" onClick={() => onChange([])}>
          Limpar seleção / mostrar todas
        </Button>
        <div className="max-h-60 overflow-auto space-y-2">
          {visibleCategories(categories, visibility)
            .filter((c) => categoryKey(c.name).includes(categoryKey(search)))
            .map((c) => (
              <label key={c.key} className="flex gap-2 p-1">
                <input
                  type="checkbox"
                  checked={value.includes(c.key)}
                  onChange={(e) =>
                    onChange(
                      e.target.checked
                        ? [...value, c.key]
                        : value.filter((k) => k !== c.key),
                    )
                  }
                />
                {c.name}
                {c.archived && (
                  <span className="text-xs text-amber-800">Inativa</span>
                )}
              </label>
            ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
