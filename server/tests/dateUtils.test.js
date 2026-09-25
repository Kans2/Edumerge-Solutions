const d = require('../src/utils/dateUtils');

describe('Date key handling', () => {
  test('converts a Date to a stable YYYY-MM-DD key', () => {
    expect(d.toDateKey(new Date('2026-09-22T18:30:00Z'))).toBe('2026-09-22');
  });

  test('round-trips a key without drifting a day', () => {
    expect(d.toDateKey(d.fromDateKey('2026-01-01'))).toBe('2026-01-01');
    expect(d.toDateKey(d.fromDateKey('2026-12-31'))).toBe('2026-12-31');
  });

  test('identifies the day of week', () => {
    expect(d.dayOfWeek('2026-09-21')).toBe(1); // Monday
    expect(d.dayOfWeek('2026-09-27')).toBe(0); // Sunday
  });

  test('builds an inclusive date range', () => {
    const r = d.dateRange('2026-09-21', '2026-09-25');
    expect(r).toEqual(['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25']);
  });

  test('a single-day range returns that day', () => {
    expect(d.dateRange('2026-09-21', '2026-09-21')).toEqual(['2026-09-21']);
  });

  test('spans a month boundary correctly', () => {
    expect(d.dateRange('2026-09-29', '2026-10-02')).toEqual(
      ['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02']
    );
  });

  test('validates date keys', () => {
    expect(d.isValidDateKey('2026-09-22')).toBe(true);
    expect(d.isValidDateKey('22-09-2026')).toBe(false);
    expect(d.isValidDateKey('2026-9-2')).toBe(false);
    expect(d.isValidDateKey(null)).toBe(false);
  });

  test('converts times to minutes and back', () => {
    expect(d.hmToMinutes('09:00')).toBe(540);
    expect(d.hmToMinutes('16:30')).toBe(990);
    expect(d.minutesToHm(540)).toBe('09:00');
    expect(d.minutesToHm(990)).toBe('16:30');
  });

  test('measures hours elapsed', () => {
    const now = new Date('2026-09-22T12:00:00Z');
    expect(d.hoursSince(new Date('2026-09-22T09:00:00Z'), now)).toBe(3);
    expect(d.hoursSince(new Date('2026-09-20T12:00:00Z'), now)).toBe(48);
  });
});
