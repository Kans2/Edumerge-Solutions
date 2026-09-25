/* eslint-disable no-console */
/**
 * Smart Attendance Management — database seed.
 *
 * Place this file at:  server/scripts/seed.js
 * Run from:            server/    →    npm run seed
 *
 * WARNING: this wipes every collection before inserting. Run it only on a
 * development database.
 *
 * Scale knobs (set as environment variables before running):
 *   SEED_STUDENTS_PER_SECTION   default 60
 *   SEED_WEEKS_OF_HISTORY       default 6
 *
 *   e.g.  set SEED_STUDENTS_PER_SECTION=15 && npm run seed      (Windows cmd)
 */
require('dotenv').config();
const mongoose = require('mongoose');
const { connectDB } = require('../src/config/db');
const {
  User, Department, Programme, Batch, Section, Subject, AcademicTerm, Holiday,
  CourseOffering, ClassSession, AttendanceRecord, AttendanceSummary,
  CorrectionRequest, LeaveRequest, ExportTemplate, AuditLog, Notification, Counter,
} = require('../src/models');
const { ROLES, ATT_STATUS, SESSION_STATUS, SESSION_TYPE } = require('../src/config/constants');
const sessionService = require('../src/modules/sessions/sessionService');
const attendanceService = require('../src/modules/attendance/attendanceService');
const attendancePolicy = require('../src/modules/attendance/attendancePolicy');
const { toDateKey } = require('../src/utils/dateUtils');

const PASSWORD = 'Password@123';
const STUDENTS_PER_SECTION = parseInt(process.env.SEED_STUDENTS_PER_SECTION || '60', 10);
const WEEKS_OF_HISTORY = parseInt(process.env.SEED_WEEKS_OF_HISTORY || '6', 10);

const rand = (n) => Math.floor(Math.random() * n);
const pick = (arr) => arr[rand(arr.length)];

const FIRST = [
  'Aarav', 'Diya', 'Vihaan', 'Ananya', 'Arjun', 'Ishita', 'Rohan', 'Meera', 'Karthik', 'Sneha',
  'Aditya', 'Priya', 'Rahul', 'Kavya', 'Nikhil', 'Divya', 'Sanjay', 'Pooja', 'Vikram', 'Lakshmi',
  'Harish', 'Nandini', 'Praveen', 'Swathi', 'Manoj', 'Ritika', 'Gokul', 'Deepika', 'Suresh', 'Anjali',
];
const LAST = [
  'Sharma', 'Iyer', 'Reddy', 'Nair', 'Menon', 'Patel', 'Kumar', 'Rao', 'Pillai', 'Verma',
  'Krishnan', 'Joshi', 'Shetty', 'Das', 'Bose', 'Gupta', 'Naidu', 'Chandran', 'Prasad', 'Mohan',
];
const studentName = () => `${pick(FIRST)} ${pick(LAST)}`;

async function wipe() {
  await Promise.all([
    User.deleteMany({}), Department.deleteMany({}), Programme.deleteMany({}),
    Batch.deleteMany({}), Section.deleteMany({}), Subject.deleteMany({}),
    AcademicTerm.deleteMany({}), Holiday.deleteMany({}), CourseOffering.deleteMany({}),
    ClassSession.deleteMany({}), AttendanceRecord.deleteMany({}), AttendanceSummary.deleteMany({}),
    CorrectionRequest.deleteMany({}), LeaveRequest.deleteMany({}), ExportTemplate.deleteMany({}),
    AuditLog.collection.deleteMany({}), Notification.deleteMany({}), Counter.deleteMany({}),
  ]);
  console.log('Cleared existing data');
}

async function seed() {
  await connectDB();
  await wipe();
  const t0 = Date.now();

  /* ---------------------------------------------------------------- *
   *  1. Academic term (carries the attendance policy)
   * ---------------------------------------------------------------- */
  const today = new Date();
  const termStart = toDateKey(new Date(today.getTime() - WEEKS_OF_HISTORY * 7 * 86400000));
  const termEnd = toDateKey(new Date(today.getTime() + 90 * 86400000));

  const term = await AcademicTerm.create({
    name: '2026-27 Odd Semester',
    academicYear: '2026-27',
    termType: 'ODD',
    startDate: termStart,
    endDate: termEnd,
    policy: {
      minAttendancePercent: 75,
      condonationFloorPercent: 65,
      excusedCountsAsPresent: true,
      lateCountsAsPresent: true,
      editWindowHours: 24,
      lockAfterHours: 48,
      defaultMark: ATT_STATUS.PRESENT,
    },
    isCurrent: true,
  });

  const holidays = [
    { date: '2026-10-02', name: 'Gandhi Jayanti' },
    { date: '2026-10-20', name: 'Diwali' },
    { date: '2026-11-14', name: 'Institution Day' },
    { date: '2026-12-25', name: 'Christmas' },
  ].filter((h) => h.date >= termStart && h.date <= termEnd)
    .map((h) => ({ ...h, termId: term._id, scope: 'INSTITUTION' }));
  if (holidays.length) await Holiday.insertMany(holidays);

  /* ---------------------------------------------------------------- *
   *  2. Departments and programmes
   * ---------------------------------------------------------------- */
  const departments = await Department.insertMany([
    { name: 'Computer Science and Engineering', code: 'CSE', email: 'cse@college.edu' },
    { name: 'Electronics and Communication Engineering', code: 'ECE', email: 'ece@college.edu' },
    { name: 'Mechanical Engineering', code: 'MECH', email: 'mech@college.edu' },
    { name: 'Information Technology', code: 'IT', email: 'it@college.edu' },
    { name: 'Civil Engineering', code: 'CIVIL', email: 'civil@college.edu' },
  ]);
  const byCode = Object.fromEntries(departments.map((d) => [d.code, d]));

  const programmes = await Programme.insertMany(departments.map((d) => ({
    name: `B.E. ${d.name}`,
    code: `BE-${d.code}`,
    departmentId: d._id,
    degreeType: 'UG',
    durationYears: 4,
    totalSemesters: 8,
  })));
  const progByDept = Object.fromEntries(programmes.map((p) => [String(p.departmentId), p]));

  /* ---------------------------------------------------------------- *
   *  3. Staff: admin, attendance officer, HODs
   * ---------------------------------------------------------------- */
  const mk = (o) => ({ ...o, passwordHash: PASSWORD, status: 'ACTIVE' });

  const admin = await User.create(mk({
    code: 'EMP0001',
    name: 'System Administrator',
    email: 'admin@college.edu',
    role: ROLES.ADMIN,
    departmentId: byCode.CSE._id,
  }));

  const officer = await User.create(mk({
    code: 'EMP0002',
    name: 'Dr. Meera Krishnan',
    email: 'officer@college.edu',
    role: ROLES.ATTENDANCE_OFFICER,
    staff: { designation: 'Attendance Officer' },
  }));

  const hods = {};
  for (const [i, d] of departments.entries()) {
    const hod = await User.create(mk({
      code: `EMP01${String(i + 1).padStart(2, '0')}`,
      name: `Dr. ${pick(FIRST)} ${pick(LAST)}`,
      email: `hod.${d.code.toLowerCase()}@college.edu`,
      role: ROLES.HOD,
      departmentId: d._id,
      staff: { designation: `Head of Department, ${d.code}` },
    }));
    await Department.updateOne({ _id: d._id }, { $set: { hodUserId: hod._id } });
    hods[d.code] = hod;
  }

  /* ---------------------------------------------------------------- *
   *  4. Batches, sections and students
   * ---------------------------------------------------------------- */
  const sections = [];
  const allStudents = [];
  let registerCounter = 0;
  const currentYear = 2026;

  for (const dept of departments) {
    const programme = progByDept[String(dept._id)];

    // Two live batches per department: semester 5 and semester 3
    for (const [bi, admissionYear] of [currentYear - 2, currentYear - 1].entries()) {
      const semester = bi === 0 ? 5 : 3;

      const batch = await Batch.create({
        name: `${admissionYear}-${admissionYear + 4}`,
        programmeId: programme._id,
        admissionYear,
        graduationYear: admissionYear + 4,
        currentSemester: semester,
      });

      for (const secName of ['A', 'B']) {
        const section = await Section.create({
          name: secName,
          code: `${dept.code}-${admissionYear}-${secName}`,
          departmentId: dept._id,
          programmeId: programme._id,
          batchId: batch._id,
          currentSemester: semester,
          roomNumber: `${dept.code}-${100 + sections.length}`,
        });

        const batchOfStudents = [];
        for (let i = 1; i <= STUDENTS_PER_SECTION; i += 1) {
          registerCounter += 1;
          const roll = `${String(admissionYear).slice(2)}${dept.code}${String(i).padStart(3, '0')}`;
          batchOfStudents.push({
            code: roll,
            name: studentName(),
            email: `${roll.toLowerCase()}@student.college.edu`,
            passwordHash: PASSWORD,
            role: ROLES.STUDENT,
            departmentId: dept._id,
            status: 'ACTIVE',
            student: {
              programmeId: programme._id,
              batchId: batch._id,
              sectionId: section._id,
              rollNumber: roll,
              registerNumber: `${admissionYear}${String(registerCounter).padStart(5, '0')}`,
              admissionYear,
              currentSemester: semester,
              guardianName: `${pick(LAST)} (Guardian)`,
              guardianPhone: `9${String(400000000 + rand(99999999))}`,
              guardianEmail: `guardian.${roll.toLowerCase()}@example.com`,
              hostelResident: Math.random() > 0.6,
            },
          });
        }

        const created = await User.insertMany(batchOfStudents);
        allStudents.push(...created);
        await Section.updateOne({ _id: section._id }, { $set: { strength: created.length } });
        sections.push({ ...section.toObject(), semester, deptCode: dept.code });
      }
    }
  }
  console.log(`Created ${sections.length} sections and ${allStudents.length} students`);

  /* ---------------------------------------------------------------- *
   *  5. Faculty
   * ---------------------------------------------------------------- */
  const facultyDefs = [];
  for (const [i, dept] of departments.entries()) {
    for (let f = 1; f <= 8; f += 1) {
      facultyDefs.push({
        code: `EMP${String(200 + i * 10 + f).padStart(4, '0')}`,
        name: `Prof. ${pick(FIRST)} ${pick(LAST)}`,
        email: `faculty${i * 10 + f}@college.edu`,
        passwordHash: PASSWORD,
        role: f <= 2 ? ROLES.CLASS_ADVISOR : ROLES.FACULTY,
        departmentId: dept._id,
        status: 'ACTIVE',
        staff: { designation: f <= 3 ? 'Associate Professor' : 'Assistant Professor' },
      });
    }
  }

  // One predictable demo login
  facultyDefs[0] = {
    ...facultyDefs[0],
    code: 'EMP0201',
    name: 'Prof. Anand Subramanian',
    email: 'faculty@college.edu',
    role: ROLES.CLASS_ADVISOR,
  };

  const facultyDocs = await User.insertMany(facultyDefs);
  const facultyByDept = {};
  facultyDocs.forEach((f) => {
    const k = String(f.departmentId);
    if (!facultyByDept[k]) facultyByDept[k] = [];
    facultyByDept[k].push(f);
  });

  // Assign a class advisor to every section
  for (const [i, section] of sections.entries()) {
    const pool = facultyByDept[String(section.departmentId)] || [];
    const advisor = pool[i % Math.max(pool.length, 1)];
    if (!advisor) continue;
    await Section.updateOne({ _id: section._id }, { $set: { classAdvisorId: advisor._id } });
    await User.updateOne({ _id: advisor._id }, {
      $addToSet: { 'staff.advisorOfSectionIds': section._id },
      $set: { role: ROLES.CLASS_ADVISOR },
    });
    section.classAdvisorId = advisor._id;
  }
  console.log(`Created ${facultyDocs.length} faculty members`);

  /* ---------------------------------------------------------------- *
   *  6. Subjects
   * ---------------------------------------------------------------- */
  const SUBJECT_BANK = {
    3: [
      ['Data Structures', 'THEORY', 4],
      ['Digital Logic Design', 'THEORY', 4],
      ['Object Oriented Programming', 'THEORY', 4],
      ['Discrete Mathematics', 'THEORY', 3],
      ['Data Structures Laboratory', 'LAB', 3],
    ],
    5: [
      ['Operating Systems', 'THEORY', 4],
      ['Database Management Systems', 'THEORY', 4],
      ['Computer Networks', 'THEORY', 4],
      ['Software Engineering', 'THEORY', 3],
      ['DBMS Laboratory', 'LAB', 3],
    ],
  };

  const subjectDefs = [];
  for (const dept of departments) {
    for (const sem of [3, 5]) {
      SUBJECT_BANK[sem].forEach(([name, type, hours], idx) => {
        subjectDefs.push({
          name,
          code: `${dept.code}${sem}${String(idx + 1).padStart(2, '0')}`,
          departmentId: dept._id,
          semester: sem,
          credits: type === 'LAB' ? 2 : 3,
          subjectType: type,
          weeklyHours: hours,
        });
      });
    }
  }
  const subjectDocs = await Subject.insertMany(subjectDefs);
  console.log(`Created ${subjectDocs.length} subjects`);

  /* ---------------------------------------------------------------- *
   *  7. Course offerings with weekly timetables
   * ---------------------------------------------------------------- */
  const PERIOD_TIMES = [
    ['09:00', '09:50'], ['09:50', '10:40'], ['11:00', '11:50'],
    ['11:50', '12:40'], ['13:30', '14:20'], ['14:20', '15:10'], ['15:10', '16:00'],
  ];

  const offeringDefs = [];
  const slotTaken = new Set(); // prevents two subjects landing on the same section/day/period

  for (const [sectionIndex, section] of sections.entries()) {
    const deptSubjects = subjectDocs.filter(
      (s) => String(s.departmentId) === String(section.departmentId) && s.semester === section.semester
    );
    const pool = facultyByDept[String(section.departmentId)] || [];

    deptSubjects.forEach((subject, si) => {
      const teacher = pool[(si + sectionIndex) % Math.max(pool.length, 1)];
      if (!teacher) return;

      const timetable = [];

      if (subject.subjectType === 'LAB') {
        // One three-period lab block each week
        const day = 1 + ((si + 2) % 5);
        const key = `${section._id}:${day}:5`;
        if (!slotTaken.has(key)) {
          slotTaken.add(key);
          timetable.push({
            dayOfWeek: day,
            startTime: '13:30',
            endTime: '16:00',
            periodNumber: 5,
            roomNumber: `LAB-${section.deptCode}-1`,
            sessionType: SESSION_TYPE.LAB,
            periodsCounted: 3,
          });
        }
      } else {
        // Four single periods spread Monday to Friday
        for (let k = 0; k < 4; k += 1) {
          const day = 1 + ((si + k) % 5);
          const period = 1 + ((si + k) % 4);
          const key = `${section._id}:${day}:${period}`;
          if (slotTaken.has(key)) continue;
          slotTaken.add(key);

          const [start, end] = PERIOD_TIMES[period - 1];
          timetable.push({
            dayOfWeek: day,
            startTime: start,
            endTime: end,
            periodNumber: period,
            roomNumber: section.roomNumber,
            sessionType: SESSION_TYPE.LECTURE,
            periodsCounted: 1,
          });
        }
      }

      if (!timetable.length) return;

      offeringDefs.push({
        termId: term._id,
        subjectId: subject._id,
        sectionId: section._id,
        departmentId: section.departmentId,
        facultyId: teacher._id,
        timetable,
        subjectCode: subject.code,
        subjectName: subject.name,
        sectionCode: section.code,
        facultyName: teacher.name,
      });
    });
  }

  const offeringDocs = await CourseOffering.insertMany(offeringDefs);
  console.log(`Created ${offeringDocs.length} course offerings`);

  /* ---------------------------------------------------------------- *
   *  8. Expand timetables into class sessions
   * ---------------------------------------------------------------- */
  const generateTo = toDateKey(new Date(today.getTime() + 14 * 86400000));
  const gen = await sessionService.generateSessions({
    termId: term._id,
    fromDate: termStart,
    toDate: generateTo,
  });
  console.log(`Generated ${gen.created} class sessions`);

  /* ---------------------------------------------------------------- *
   *  9. Mark historical attendance
   * ---------------------------------------------------------------- */
  const todayKey = toDateKey(today);
  const pastSessions = await ClassSession.find({
    date: { $lt: todayKey },
    status: SESSION_STATUS.SCHEDULED,
  }).lean();

  /**
   * Give each student a stable attendance "personality" so the data looks
   * real: mostly regular, with a genuine tail of defaulters.
   */
  const profile = new Map();
  allStudents.forEach((s) => {
    const r = Math.random();
    let rate;
    if (r < 0.55) rate = 0.93 + Math.random() * 0.07;       // regular
    else if (r < 0.80) rate = 0.82 + Math.random() * 0.10;  // average
    else if (r < 0.93) rate = 0.68 + Math.random() * 0.12;  // borderline
    else rate = 0.45 + Math.random() * 0.20;                // defaulter
    profile.set(String(s._id), rate);
  });

  const studentsBySection = new Map();
  allStudents.forEach((s) => {
    const k = String(s.student.sectionId);
    if (!studentsBySection.has(k)) studentsBySection.set(k, []);
    studentsBySection.get(k).push(s);
  });

  let buffer = [];
  const sessionUpdates = [];
  let markedCount = 0;

  for (const session of pastSessions) {
    // Leave ~6% genuinely unmarked so the "missed marking" report is meaningful
    if (Math.random() < 0.06) continue;

    const roster = studentsBySection.get(String(session.sectionId)) || [];
    if (!roster.length) continue;

    const markedAt = new Date(`${session.date}T${session.startTime || '09:00'}:00.000Z`);

    const entries = roster.map((s) => {
      const rate = profile.get(String(s._id));
      const r = Math.random();
      let status;
      if (r < rate) status = ATT_STATUS.PRESENT;
      else if (r < rate + 0.03) status = ATT_STATUS.LATE;
      else if (r < rate + 0.05) status = ATT_STATUS.EXCUSED;
      else status = ATT_STATUS.ABSENT;

      return {
        sessionId: session._id,
        studentId: s._id,
        offeringId: session.offeringId,
        termId: session.termId,
        sectionId: session.sectionId,
        subjectId: session.subjectId,
        departmentId: session.departmentId,
        date: session.date,
        periodNumber: session.periodNumber,
        periodsCounted: session.periodsCounted || 1,
        status,
        studentCode: s.code,
        studentName: s.name,
        rollNumber: s.student.rollNumber,
        markedBy: session.facultyId,
        markedAt,
      };
    });

    buffer.push(...entries);

    sessionUpdates.push({
      updateOne: {
        filter: { _id: session._id },
        update: {
          $set: {
            status: SESSION_STATUS.LOCKED,
            stats: attendancePolicy.sessionStats(entries),
            markedBy: session.facultyId,
            markedByName: session.facultyName,
            markedAt,
            lockedAt: new Date(`${session.date}T23:59:00.000Z`),
            topic: `${session.subjectName} — session on ${session.date}`,
          },
        },
      },
    });
    markedCount += 1;

    if (buffer.length >= 5000) {
      await AttendanceRecord.insertMany(buffer, { ordered: false });
      buffer = [];
      process.stdout.write('.');
    }
  }

  if (buffer.length) await AttendanceRecord.insertMany(buffer, { ordered: false });
  if (sessionUpdates.length) await ClassSession.bulkWrite(sessionUpdates, { ordered: false });

  const totalRecords = await AttendanceRecord.countDocuments();
  console.log(`\nMarked ${markedCount} sessions with ${totalRecords} attendance records`);

  /* ---------------------------------------------------------------- *
   *  10. Build attendance summaries
   * ---------------------------------------------------------------- */
  process.stdout.write('Computing attendance summaries');
  for (const [i, offering] of offeringDocs.entries()) {
    await attendanceService.recomputeOffering(offering._id, term._id);
    if (i % 20 === 0) process.stdout.write('.');
  }
  console.log(' done');

  /* ---------------------------------------------------------------- *
   *  11. Sample correction and leave requests
   * ---------------------------------------------------------------- */
  const recentLocked = await ClassSession.find({ status: SESSION_STATUS.LOCKED })
    .sort({ date: -1 }).limit(5).lean();

  let correctionNo = 0;
  for (const session of recentLocked.slice(0, 3)) {
    const absentRecords = await AttendanceRecord.find({
      sessionId: session._id, status: ATT_STATUS.ABSENT,
    }).limit(2).lean();
    if (!absentRecords.length) continue;

    correctionNo += 1;
    await CorrectionRequest.create({
      requestNo: `COR-2026-${String(correctionNo).padStart(6, '0')}`,
      sessionId: session._id,
      offeringId: session.offeringId,
      termId: session.termId,
      sectionId: session.sectionId,
      departmentId: session.departmentId,
      date: session.date,
      subjectCode: session.subjectCode,
      subjectName: session.subjectName,
      sectionCode: session.sectionCode,
      raisedBy: session.facultyId,
      raisedByName: session.facultyName,
      raisedByRole: ROLES.FACULTY,
      reason: 'Students were present but attendance was submitted before they arrived from a college event.',
      changes: absentRecords.map((r) => ({
        studentId: r.studentId,
        studentCode: r.studentCode,
        studentName: r.studentName,
        fromStatus: ATT_STATUS.ABSENT,
        toStatus: ATT_STATUS.EXCUSED,
      })),
    });
  }

  const leaveStudents = allStudents.slice(0, 4);
  for (const [i, s] of leaveStudents.entries()) {
    await LeaveRequest.create({
      requestNo: `LV-2026-${String(i + 1).padStart(6, '0')}`,
      studentId: s._id,
      studentCode: s.code,
      studentName: s.name,
      sectionId: s.student.sectionId,
      departmentId: s.departmentId,
      termId: term._id,
      leaveType: i % 2 === 0 ? 'MEDICAL' : 'ON_DUTY',
      fromDate: toDateKey(new Date(today.getTime() - (5 - i) * 86400000)),
      toDate: toDateKey(new Date(today.getTime() - (4 - i) * 86400000)),
      reason: i % 2 === 0
        ? 'Hospitalised with viral fever; medical certificate attached.'
        : 'Represented the college at an inter-collegiate technical symposium.',
      status: i < 2 ? 'PENDING' : 'APPROVED',
    });
  }

  /* ---------------------------------------------------------------- *
   *  12. Default Excel export templates
   * ---------------------------------------------------------------- */
  await ExportTemplate.insertMany([
    {
      name: 'Standard Daily Register',
      reportType: 'DAILY_ATTENDANCE',
      columns: [
        { key: 'serial', header: 'S.No', width: 7, order: 0 },
        { key: 'studentCode', header: 'Roll Number', width: 16, order: 1 },
        { key: 'studentName', header: 'Student Name', width: 28, order: 2 },
        { key: 'sectionCode', header: 'Section', width: 14, order: 3 },
        { key: 'subjectCode', header: 'Subject Code', width: 15, order: 4 },
        { key: 'periodNumber', header: 'Period', width: 9, order: 5 },
        { key: 'status', header: 'Attendance', width: 16, order: 6 },
        { key: 'remarks', header: 'Remarks', width: 26, order: 7 },
      ],
      options: {
        sheetName: 'Daily Register', includeSummaryRow: true,
        freezeHeader: true, autoFilter: true,
      },
      ownerId: admin._id,
      scope: 'GLOBAL',
      isDefault: true,
    },
    {
      name: 'Guardian Contact Defaulters',
      reportType: 'DEFAULTERS',
      columns: [
        { key: 'serial', header: 'S.No', width: 7, order: 0 },
        { key: 'studentCode', header: 'Roll No', width: 16, order: 1 },
        { key: 'studentName', header: 'Name of Student', width: 28, order: 2 },
        { key: 'sectionCode', header: 'Class', width: 14, order: 3 },
        { key: 'percent', header: 'Attendance Percentage', width: 20, order: 4, format: '0.00' },
        { key: 'periodsToReachThreshold', header: 'Classes Needed', width: 16, order: 5 },
        { key: 'guardianName', header: 'Parent / Guardian', width: 24, order: 6 },
        { key: 'guardianPhone', header: 'Contact Number', width: 16, order: 7 },
      ],
      options: { sheetName: 'Defaulters', highlightBelowThreshold: true },
      ownerId: officer._id,
      scope: 'GLOBAL',
      isDefault: true,
    },
  ]);

  /* ---------------------------------------------------------------- *
   *  13. Report
   * ---------------------------------------------------------------- */
  const [sessionCount, defaulterCount, avgRows] = await Promise.all([
    ClassSession.countDocuments(),
    AttendanceSummary.countDocuments({ scope: 'OVERALL', percent: { $lt: 75 } }),
    AttendanceSummary.aggregate([
      { $match: { scope: 'OVERALL' } },
      { $group: { _id: null, avg: { $avg: '$percent' } } },
    ]),
  ]);

  const demoStudent = allStudents[0];

  console.log(`
=================================================================
  SEED COMPLETE  (${((Date.now() - t0) / 1000).toFixed(1)}s)
=================================================================
  Departments      ${departments.length}
  Sections         ${sections.length}
  Students         ${allStudents.length}
  Faculty          ${facultyDocs.length}
  Subjects         ${subjectDocs.length}
  Offerings        ${offeringDocs.length}
  Class sessions   ${sessionCount}
  Attendance rows  ${totalRecords}
  Average overall  ${avgRows[0] ? avgRows[0].avg.toFixed(2) : '0'}%
  Below 75%        ${defaulterCount} students

  All accounts use the password: ${PASSWORD}

  Admin                admin@college.edu
  Attendance Officer   officer@college.edu
  HOD (CSE)            ${hods.CSE.email}
  Faculty / Advisor    faculty@college.edu
  Student              ${demoStudent.email}  (${demoStudent.code})
=================================================================
`);

  await mongoose.connection.close();
  process.exit(0);
}

seed().catch(async (err) => {
  console.error('\nSeed failed:', err);
  try { await mongoose.connection.close(); } catch { /* ignore */ }
  process.exit(1);
});
