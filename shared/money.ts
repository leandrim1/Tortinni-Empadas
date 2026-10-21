/**
 * Toda moeda no sistema trafega e é persistida em centavos (inteiro).
 * Nunca usar float para dinheiro.
 */
export const CURRENCY = 'BRL';

export function formatBRL(cents: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: CURRENCY }).format(
    Math.round(cents) / 100,
  );
}

/** Converte "11,90" | "11.90" | 11.9 para 1190 centavos. */
export function toCents(value: string | number): number {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Valor monetário inválido');
    return Math.round(value * 100);
  }
  const normalized = value.trim().replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) throw new Error('Valor monetário inválido');
  return Math.round(parsed * 100);
}

export function centsToDecimalString(cents: number): string {
  return (Math.round(cents) / 100).toFixed(2);
}
