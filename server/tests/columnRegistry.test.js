const registry = require('../src/modules/exports/columnRegistry');

describe('Column resolution', () => {
  test('falls back to the report defaults when nothing is supplied', () => {
    const { columns } = registry.resolveColumns({ reportType: 'DAILY_ATTENDANCE' });
    expect(columns.map((c) => c.key)).toEqual(registry.DEFAULT_COLUMNS.DAILY_ATTENDANCE);
    expect(columns[0].header).toBe('S.No');
  });

  test('honours a plain list of column keys and their order', () => {
    const { columns } = registry.resolveColumns({
      reportType: 'DAILY_ATTENDANCE',
      requested: ['studentName', 'studentCode', 'status'],
    });
    expect(columns.map((c) => c.key)).toEqual(['studentName', 'studentCode', 'status']);
  });

  test('renames a column when a custom header is supplied', () => {
    const { columns } = registry.resolveColumns({
      reportType: 'DAILY_ATTENDANCE',
      requested: [
        { key: 'studentCode', header: 'Admission No' },
        { key: 'status', header: 'P / A', width: 8 },
      ],
    });
    expect(columns[0].header).toBe('Admission No');
    expect(columns[1].header).toBe('P / A');
    expect(columns[1].width).toBe(8);
  });

  test('ignores unknown keys instead of throwing', () => {
    const { columns, unknown } = registry.resolveColumns({
      reportType: 'DAILY_ATTENDANCE',
      requested: ['studentName', 'notARealColumn'],
    });
    expect(columns.map((c) => c.key)).toEqual(['studentName']);
    expect(unknown).toEqual(['notARealColumn']);
  });

  test('never returns an empty column list', () => {
    const { columns } = registry.resolveColumns({
      reportType: 'DAILY_ATTENDANCE',
      requested: ['nope', 'alsoNope'],
    });
    expect(columns.length).toBeGreaterThan(0);
  });

  test('applies a saved template, respecting order and hidden columns', () => {
    const template = {
      columns: [
        { key: 'status', header: 'Attendance', order: 2, visible: true },
        { key: 'studentName', header: 'Name', order: 1, visible: true },
        { key: 'remarks', header: 'Notes', order: 3, visible: false },
      ],
    };
    const { columns } = registry.resolveColumns({ reportType: 'DAILY_ATTENDANCE', template });
    expect(columns.map((c) => c.key)).toEqual(['studentName', 'status']);
    expect(columns[0].header).toBe('Name');
  });

  test('an explicit request overrides a saved template', () => {
    const template = { columns: [{ key: 'remarks', header: 'Notes', order: 0, visible: true }] };
    const { columns } = registry.resolveColumns({
      reportType: 'DAILY_ATTENDANCE', requested: ['studentName'], template,
    });
    expect(columns.map((c) => c.key)).toEqual(['studentName']);
  });

  test('throws only for an unknown report type', () => {
    expect(() => registry.resolveColumns({ reportType: 'NOPE' })).toThrow(/Unknown report type/);
  });
});

describe('Column resolvers', () => {
  const row = {
    date: '2026-09-22', dayName: 'Tuesday', rollNumber: '22CSE001', studentName: 'Aarav Sharma',
    status: 'ABSENT', remarks: '', percent: 68.456, riskBand: 'CONDONABLE',
    heldPeriods: 40, presentPeriods: 27, periodsToReachThreshold: 12,
  };

  test('serial numbers are one-based', () => {
    expect(registry.ATTENDANCE_COLUMNS.serial.resolve(row, { index: 0 })).toBe(1);
    expect(registry.ATTENDANCE_COLUMNS.serial.resolve(row, { index: 7 })).toBe(8);
  });

  test('status renders a human label, not the enum', () => {
    expect(registry.ATTENDANCE_COLUMNS.status.resolve(row, {})).toBe('Absent');
    expect(registry.ATTENDANCE_COLUMNS.statusShort.resolve(row, {})).toBe('A');
  });

  test('empty values render as a dash rather than blank', () => {
    expect(registry.ATTENDANCE_COLUMNS.remarks.resolve(row, {})).toBe('-');
    expect(registry.ATTENDANCE_COLUMNS.subjectCode.resolve({}, {})).toBe('-');
  });

  test('percentages are rounded to two decimals', () => {
    expect(registry.SUMMARY_COLUMNS.percent.resolve(row, {})).toBe(68.46);
  });

  test('risk band renders a readable label', () => {
    expect(registry.SUMMARY_COLUMNS.riskBand.resolve(row, {})).toBe('Condonable');
  });

  test('an unrecoverable student is labelled, not shown as a number', () => {
    expect(registry.SUMMARY_COLUMNS.periodsToReachThreshold.resolve(
      { periodsToReachThreshold: null }, {}
    )).toBe('Not recoverable');
  });
});

describe('Column catalogue', () => {
  test('describes every column and flags the defaults', () => {
    const cols = registry.describeColumns('DEFAULTERS');
    expect(cols.length).toBeGreaterThan(10);
    const roll = cols.find((c) => c.key === 'studentCode');
    expect(roll.defaultHeader).toBe('Roll Number');
    expect(roll.isDefault).toBe(true);
    expect(cols.find((c) => c.key === 'lastComputedAt').isDefault).toBe(false);
  });

  test('every report type has a usable default column set', () => {
    Object.keys(registry.REGISTRIES).forEach((rt) => {
      const defaults = registry.DEFAULT_COLUMNS[rt];
      expect(defaults.length).toBeGreaterThan(0);
      defaults.forEach((key) => expect(registry.REGISTRIES[rt][key]).toBeDefined());
    });
  });
});
