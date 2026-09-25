/**
 * All attendance is keyed by a calendar date string (YYYY-MM-DD) so that a
 * day's roster is stable regardless of the server timezone.
 */
const pad = (n) => String(n).padStart(2, '0');

function toDateKey(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function fromDateKey(key) {
  return new Date(`${key}T00:00:00.000Z`);
}

function dayOfWeek(key) {
  return fromDateKey(key).getUTCDay(); // 0 = Sunday
}

/** Inclusive list of date keys between two date keys. */
function dateRange(fromKey, toKey) {
  const out = [];
  const start = fromDateKey(fromKey);
  const end = fromDateKey(toKey);
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(toDateKey(d));
  }
  return out;
}

function isValidDateKey(key) {
  return typeof key === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(key) && !Number.isNaN(fromDateKey(key).getTime());
}

/** 'HH:MM' -> minutes from midnight */
function hmToMinutes(hm) {
  const [h, m] = String(hm).split(':').map(Number);
  return h * 60 + m;
}

const minutesToHm = (mins) => `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`;

function hoursSince(date, now = new Date()) {
  return (now - new Date(date)) / 3600000;
}

module.exports = {
  toDateKey, fromDateKey, dayOfWeek, dateRange, isValidDateKey,
  hmToMinutes, minutesToHm, hoursSince,
};
