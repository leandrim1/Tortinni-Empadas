import { useMemo, useState } from 'react';
import { Check, Plus, Minus, AlertCircle } from 'lucide-react';
import type { Product } from '@/types/catalog';
import type { PricingGroup } from '@shared/pricing';
import { formatBRL } from '@/utils/format';
import type { CartSelection } from '@/features/cart/CartContext';

interface ComboBuilderProps {
  product: Product;
  onChange: (selections: CartSelection[], valid: boolean) => void;
}

type Picks = Record<string, string[]>;

/**
 * Montagem do combo: cada grupo exige uma quantidade exata de escolhas
 * ("escolha 3 empadas"), com repetição permitida. O botão de adicionar só
 * libera quando todos os grupos estão completos.
 */
export function ComboBuilder({ product, onChange }: ComboBuilderProps) {
  const groups = product.comboGroups ?? [];
  const [picks, setPicks] = useState<Picks>(() =>
    Object.fromEntries(groups.map((group) => [group.id, [] as string[]])),
  );

  const status = useMemo(() => {
    const perGroup = groups.map((group) => {
      const chosen = picks[group.id] ?? [];
      return {
        group,
        chosen,
        remaining: group.minSelect - chosen.length,
        complete: chosen.length >= group.minSelect && chosen.length <= group.maxSelect,
      };
    });
    return { perGroup, valid: perGroup.every((entry) => entry.complete) };
  }, [groups, picks]);

  function update(next: Picks) {
    setPicks(next);
    const selections: CartSelection[] = groups.map((group) => ({
      groupId: group.id,
      groupTitle: group.title,
      optionProductIds: next[group.id] ?? [],
    }));
    const valid = groups.every((group) => {
      const chosen = next[group.id] ?? [];
      return chosen.length >= group.minSelect && chosen.length <= group.maxSelect;
    });
    onChange(selections, valid);
  }

  function add(group: PricingGroup, optionProductId: string) {
    const chosen = picks[group.id] ?? [];
    if (chosen.length >= group.maxSelect) {
      // Grupo de escolha única: trocar em vez de bloquear.
      if (group.maxSelect === 1) {
        update({ ...picks, [group.id]: [optionProductId] });
      }
      return;
    }
    update({ ...picks, [group.id]: [...chosen, optionProductId] });
  }

  function remove(group: PricingGroup, optionProductId: string) {
    const chosen = [...(picks[group.id] ?? [])];
    const index = chosen.lastIndexOf(optionProductId);
    if (index === -1) return;
    chosen.splice(index, 1);
    update({ ...picks, [group.id]: chosen });
  }

  return (
    <div className="space-y-5">
      {status.perGroup.map(({ group, chosen, remaining, complete }) => (
        <fieldset key={group.id} className="rounded-2xl bg-white p-4 ring-1 ring-night-900/5">
          <legend className="sr-only">{group.title}</legend>

          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="font-display text-[15px] font-bold text-night-900">{group.title}</p>
              <p className="text-xs text-night-900/55">
                {group.minSelect === group.maxSelect
                  ? `Escolha exatamente ${group.minSelect}`
                  : `De ${group.minSelect} a ${group.maxSelect} itens`}
                {group.allowRepeat && ' · pode repetir o sabor'}
              </p>
            </div>
            <span
              className={`chip shrink-0 ${
                complete ? 'bg-brand-100 text-brand-800' : 'bg-gold-100 text-gold-800'
              }`}
            >
              {complete ? (
                <>
                  <Check size={13} aria-hidden="true" /> Completo
                </>
              ) : (
                `Faltam ${remaining}`
              )}
            </span>
          </div>

          <ul className="space-y-1.5">
            {group.options.map((option) => {
              const count = chosen.filter((id) => id === option.productId).length;
              const disabled = !option.isAvailable;
              const full = chosen.length >= group.maxSelect && group.maxSelect > 1;

              return (
                <li key={option.productId}>
                  <div
                    className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 transition ${
                      count > 0
                        ? 'border-gold-400 bg-gold-50'
                        : 'border-night-900/10 bg-white hover:border-night-900/20'
                    } ${disabled ? 'opacity-50' : ''}`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-night-900">
                        {option.name}
                      </span>
                      {option.extraPriceCents > 0 && (
                        <span className="text-xs text-night-900/55">
                          + {formatBRL(option.extraPriceCents)}
                        </span>
                      )}
                      {disabled && (
                        <span className="text-xs text-crust">Indisponível no momento</span>
                      )}
                    </span>

                    {group.maxSelect === 1 ? (
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => add(group, option.productId)}
                        aria-pressed={count > 0}
                        className={`flex h-8 w-8 items-center justify-center rounded-full transition ${
                          count > 0
                            ? 'bg-gold-400 text-night-950'
                            : 'bg-night-900/5 text-night-900/50 hover:bg-night-900/10'
                        }`}
                        aria-label={`Escolher ${option.name}`}
                      >
                        <Check size={15} />
                      </button>
                    ) : (
                      <span className="flex items-center gap-1">
                        <button
                          type="button"
                          disabled={count === 0}
                          onClick={() => remove(group, option.productId)}
                          aria-label={`Remover um ${option.name}`}
                          className="flex h-8 w-8 items-center justify-center rounded-full text-night-900/50
                                     transition hover:bg-night-900/10 disabled:opacity-30"
                        >
                          <Minus size={15} />
                        </button>
                        <span className="w-5 text-center text-sm font-bold tabular-nums" aria-live="polite">
                          {count}
                        </span>
                        <button
                          type="button"
                          disabled={disabled || full}
                          onClick={() => add(group, option.productId)}
                          aria-label={`Adicionar um ${option.name}`}
                          className="flex h-8 w-8 items-center justify-center rounded-full bg-gold-400
                                     text-night-950 transition hover:bg-gold-300 disabled:opacity-30"
                        >
                          <Plus size={15} />
                        </button>
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </fieldset>
      ))}

      {!status.valid && (
        <p className="flex items-start gap-2 rounded-xl bg-gold-50 px-3 py-2.5 text-xs text-gold-900">
          <AlertCircle size={15} className="mt-px shrink-0" aria-hidden="true" />
          Complete as escolhas acima para adicionar o combo ao carrinho.
        </p>
      )}
    </div>
  );
}
