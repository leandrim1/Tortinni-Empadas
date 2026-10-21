export function formatBRL(cents: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
    Math.round(cents) / 100,
  );
}

export function formatPhone(digits: string): string {
  const only = digits.replace(/\D/g, '').slice(0, 11);
  if (only.length <= 10) {
    return only.replace(/^(\d{0,2})(\d{0,4})(\d{0,4})$/, (_, a, b, c) =>
      [a && `(${a}`, a.length === 2 ? ') ' : '', b, c && `-${c}`].filter(Boolean).join(''),
    );
  }
  return only.replace(/^(\d{2})(\d{5})(\d{0,4})$/, (_, a, b, c) => `(${a}) ${b}${c ? `-${c}` : ''}`);
}

export function formatEta(min: number, max: number): string {
  return `${min}–${max} min`;
}

const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
export function weekdayName(weekday: number): string {
  return WEEKDAYS[weekday] ?? '';
}

export function formatDateTime(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

/** "Empada de frango com cheddar" → iniciais para avatar/placeholder. */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter((part) => part.length > 2)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}
