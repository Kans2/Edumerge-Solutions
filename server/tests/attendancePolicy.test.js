const policy = require('../src/modules/attendance/attendancePolicy');
const { ATT_STATUS, RISK_BAND } = require('../src/config/constants');

const P = { ...policy.DEFAULT_POLICY };
const rec = (status, periodsCounted = 1) => ({ status, periodsCounted });

describe('Record classification', () => {
  test('a present mark credits and counts', () => {
    expect(policy.classify(rec(ATT_STATUS.PRESENT), P)).toEqual({ credited: 1, countable: 1, weight: 1 });
  });

  test('an absence counts against the student', () => {
    expect(policy.classify(rec(ATT_STATUS.ABSENT), P)).toEqual({ credited: 0, countable: 1, weight: 1 });
  });

  test('late credits attendance when the policy allows it', () => {
    expect(policy.classify(rec(ATT_STATUS.LATE), P).credited).toBe(1);
    expect(policy.classify(rec(ATT_STATUS.LATE), { ...P, lateCountsAsPresent: false }).credited).toBe(0);
  });

  test('on-duty is removed from both sides of the fraction', () => {
    expect(policy.classify(rec(ATT_STATUS.EXCUSED), P)).toEqual({ credited: 0, countable: 0, weight: 1 });
  });

  test('on-duty becomes an absence when the policy says so', () => {
    const r = policy.classify(rec(ATT_STATUS.EXCUSED), { ...P, excusedCountsAsPresent: false });
    expect(r).toEqual({ credited: 0, countable: 1, weight: 1 });
  });

  test('a three-period lab carries three periods of weight', () => {
    expect(policy.classify(rec(ATT_STATUS.PRESENT, 3), P)).toEqual({ credited: 3, countable: 3, weight: 3 });
    expect(policy.classify(rec(ATT_STATUS.ABSENT, 3), P)).toEqual({ credited: 0, countable: 3, weight: 3 });
  });
});

describe('Summary computation', () => {
  test('computes a straightforward percentage', () => {
    const records = [
      ...Array(8).fill(rec(ATT_STATUS.PRESENT)),
      ...Array(2).fill(rec(ATT_STATUS.ABSENT)),
    ];
    const s = policy.computeSummary(records, P);
    expect(s.heldPeriods).toBe(10);
    expect(s.countablePeriods).toBe(10);
    expect(s.percent).toBe(80);
    expect(s.riskBand).toBe(RISK_BAND.SAFE);
  });

  test('exempt periods never drag the percentage down', () => {
    const records = [
      ...Array(7).fill(rec(ATT_STATUS.PRESENT)),
      ...Array(3).fill(rec(ATT_STATUS.EXCUSED)),
    ];
    const s = policy.computeSummary(records, P);
    expect(s.heldPeriods).toBe(10);
    expect(s.countablePeriods).toBe(7);   // OD removed from the denominator
    expect(s.percent).toBe(100);
  });

  test('a student with no countable periods is not penalised', () => {
    expect(policy.computeSummary([], P).percent).toBe(100);
    expect(policy.computeSummary([rec(ATT_STATUS.EXCUSED)], P).percent).toBe(100);
  });

  test('lab weighting changes the outcome', () => {
    // Missing one 3-period lab out of 10 total periods
    const records = [...Array(7).fill(rec(ATT_STATUS.PRESENT)), rec(ATT_STATUS.ABSENT, 3)];
    const s = policy.computeSummary(records, P);
    expect(s.countablePeriods).toBe(10);
    expect(s.percent).toBe(70);
  });

  test('assigns the correct risk band', () => {
    const at = (present, total) => policy.computeSummary([
      ...Array(present).fill(rec(ATT_STATUS.PRESENT)),
      ...Array(total - present).fill(rec(ATT_STATUS.ABSENT)),
    ], P).riskBand;

    expect(at(80, 100)).toBe(RISK_BAND.SAFE);
    expect(at(75, 100)).toBe(RISK_BAND.SAFE);
    expect(at(72, 100)).toBe(RISK_BAND.WARNING);
    expect(at(68, 100)).toBe(RISK_BAND.CONDONABLE);
    expect(at(50, 100)).toBe(RISK_BAND.DETAINED);
  });
});

describe('Recovery maths', () => {
  test('a safe student needs no further classes', () => {
    expect(policy.periodsToReachThreshold(80, 100, 75)).toBe(0);
  });

  test('computes how many consecutive classes restore the threshold', () => {
    // 70/100 -> need x where (70+x)/(100+x) >= 0.75  =>  x >= 20
    expect(policy.periodsToReachThreshold(70, 100, 75)).toBe(20);
    const after = (70 + 20) / (100 + 20);
    expect(after).toBeGreaterThanOrEqual(0.75);
  });

  test('a 100% requirement is unreachable once missed', () => {
    expect(policy.periodsToReachThreshold(90, 100, 100)).toBeNull();
  });

  test('computes how many classes may still be missed', () => {
    // 90/100 at 75% -> total may grow to 120, so 20 more may be missed
    expect(policy.periodsCanMiss(90, 100, 75)).toBe(20);
  });

  test('a student already below the line may miss none', () => {
    expect(policy.periodsCanMiss(70, 100, 75)).toBe(0);
  });
});

describe('Default roster', () => {
  const students = [
    { _id: 's1', code: 'R001', name: 'Aarav', student: { rollNumber: 'R001' } },
    { _id: 's2', code: 'R002', name: 'Diya', student: { rollNumber: 'R002' } },
    { _id: 's3', code: 'R003', name: 'Rohan', student: { rollNumber: 'R003' } },
  ];

  test('everyone defaults to present so faculty only tap absentees', () => {
    const roster = policy.buildDefaultRoster(students, { policy: P });
    expect(roster).toHaveLength(3);
    expect(roster.every((r) => r.status === ATT_STATUS.PRESENT)).toBe(true);
    expect(roster.every((r) => r.source === 'DEFAULT')).toBe(true);
  });

  test('honours a configured default of absent', () => {
    const roster = policy.buildDefaultRoster(students, { policy: { ...P, defaultMark: ATT_STATUS.ABSENT } });
    expect(roster.every((r) => r.status === ATT_STATUS.ABSENT)).toBe(true);
  });

  test('pre-applies approved leave and locks the row', () => {
    const roster = policy.buildDefaultRoster(students, {
      policy: P,
      approvedLeaves: [{ studentId: 's2', leaveType: 'ON_DUTY', requestNo: 'LV-1' }],
    });
    const diya = roster.find((r) => r.studentId === 's2');
    expect(diya.status).toBe(ATT_STATUS.EXCUSED);
    expect(diya.locked).toBe(true);
    expect(diya.source).toBe('LEAVE');
  });

  test('existing marks win over defaults when re-opening a class', () => {
    const roster = policy.buildDefaultRoster(students, {
      policy: P,
      existing: [{ studentId: 's3', status: ATT_STATUS.ABSENT, remarks: 'Did not attend' }],
    });
    const rohan = roster.find((r) => r.studentId === 's3');
    expect(rohan.status).toBe(ATT_STATUS.ABSENT);
    expect(rohan.source).toBe('EXISTING');
  });
});

describe('Roster validation', () => {
  test('rejects a student who is not in the section', () => {
    const r = policy.validateRoster([{ studentId: 'x1', status: 'PRESENT' }], ['s1', 's2']);
    expect(r.valid).toBe(false);
    expect(r.unknown).toContain('x1');
  });

  test('rejects an unknown status', () => {
    const r = policy.validateRoster([{ studentId: 's1', status: 'MAYBE' }], ['s1']);
    expect(r.valid).toBe(false);
    expect(r.badStatus).toContain('MAYBE');
  });

  test('rejects duplicate rows for the same student', () => {
    const r = policy.validateRoster(
      [{ studentId: 's1', status: 'PRESENT' }, { studentId: 's1', status: 'ABSENT' }], ['s1']
    );
    expect(r.valid).toBe(false);
    expect(r.duplicates).toContain('s1');
  });

  test('accepts a clean roster', () => {
    expect(policy.validateRoster([{ studentId: 's1', status: 'PRESENT' }], ['s1', 's2']).valid).toBe(true);
  });
});

describe('Session statistics', () => {
  test('excludes exempt students from the session percentage', () => {
    const stats = policy.sessionStats([
      { status: ATT_STATUS.PRESENT }, { status: ATT_STATUS.PRESENT },
      { status: ATT_STATUS.ABSENT }, { status: ATT_STATUS.EXCUSED },
    ]);
    expect(stats.total).toBe(4);
    expect(stats.present).toBe(2);
    expect(stats.absent).toBe(1);
    expect(stats.excused).toBe(1);
    expect(stats.percent).toBeCloseTo(66.67, 1); // 2 of 3 countable
  });
});

describe('Edit window and locking', () => {
  const faculty = { _id: 'f1', capabilities: [] };
  const hod = { _id: 'f2', capabilities: ['attendance:edit:any'] };
  const now = new Date('2026-09-22T12:00:00Z');

  test('the owning faculty may edit inside the window', () => {
    const s = { facultyId: 'f1', status: 'MARKED', markedAt: new Date('2026-09-22T09:00:00Z') };
    expect(policy.canEditSession(s, faculty, P, now).allowed).toBe(true);
  });

  test('the window closes after the configured hours', () => {
    const s = { facultyId: 'f1', status: 'MARKED', markedAt: new Date('2026-09-20T09:00:00Z') };
    const r = policy.canEditSession(s, faculty, P, now);
    expect(r.allowed).toBe(false);
    expect(r.reason).toMatch(/correction request/i);
  });

  test('another faculty member cannot edit someone else class', () => {
    const s = { facultyId: 'other', status: 'MARKED', markedAt: now };
    expect(policy.canEditSession(s, faculty, P, now).allowed).toBe(false);
  });

  test('an HOD may edit any session', () => {
    const s = { facultyId: 'other', status: 'MARKED', markedAt: new Date('2026-09-01T09:00:00Z') };
    expect(policy.canEditSession(s, hod, P, now).allowed).toBe(true);
  });

  test('a locked session is closed even to an HOD path via canEdit', () => {
    const s = { facultyId: 'f1', status: 'LOCKED', markedAt: now };
    expect(policy.canEditSession(s, faculty, P, now).allowed).toBe(false);
  });

  test('a cancelled class cannot be marked', () => {
    const s = { facultyId: 'f1', status: 'CANCELLED' };
    expect(policy.canEditSession(s, faculty, P, now).allowed).toBe(false);
  });

  test('shouldLock fires only after the lock window', () => {
    expect(policy.shouldLock(
      { status: 'MARKED', date: '2026-09-22', startTime: '09:00', markedAt: new Date('2026-09-22T09:30:00Z') }, P, now
    )).toBe(false);
    expect(policy.shouldLock(
      { status: 'MARKED', date: '2026-09-19', startTime: '09:00', markedAt: new Date('2026-09-19T09:30:00Z') }, P, now
    )).toBe(true);
    expect(policy.shouldLock({ status: 'LOCKED' }, P, now)).toBe(false);
  });
});
