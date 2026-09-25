import { format, formatDistanceToNow, isValid, parseISO } from 'date-fns';

const safe = (d) => {
  if (!d) return null;
  const dt = typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) ? parseISO(`${d}T00:00:00`) : new Date(d);
  return isValid(dt) ? dt : null;
};

export const fmtDate = (d) => { const x = safe(d); return x ? format(x, 'dd MMM yyyy') : '-'; };
export const fmtDateShort = (d) => { const x = safe(d); return x ? format(x, 'dd MMM') : '-'; };
export const fmtDateTime = (d) => { const x = safe(d); return x ? format(x, 'dd MMM yyyy, HH:mm') : '-'; };
export const fmtAgo = (d) => { const x = safe(d); return x ? `${formatDistanceToNow(x)} ago` : '-'; };

export const todayKey = () => format(new Date(), 'yyyy-MM-dd');
export const toKey = (d) => { const x = safe(d); return x ? format(x, 'yyyy-MM-dd') : todayKey(); };

export const pct = (n) => (typeof n === 'number' ? `${n.toFixed(2)}%` : '-');

export const initials = (name = '') =>
  name.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();

/** Colour for a percentage against the threshold. */
export function percentTone(value, threshold = 75) {
  if (value == null) return 'text-slate-500';
  if (value >= threshold) return 'text-emerald-700';
  if (value >= threshold - 5) return 'text-amber-700';
  return 'text-red-700';
}
