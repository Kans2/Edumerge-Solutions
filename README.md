# Smart Attendance Management System

Production-grade MERN application for a college of ~5,000 students and ~200 faculty across multiple departments, programmes, batches, sections and subjects. Covers attendance recording, corrections, review, history, low-attendance identification, and Excel export with fully customisable columns.

---

## Quick start

### Option A — Docker

```bash
docker compose up --build
docker compose exec server npm run seed
```

Open **http://localhost:8080**

### Option B — Local development

**Prerequisites:** Node.js 18+, MongoDB 6+.

```bash
# 1. API
cd server
cp .env.example .env          # change the JWT secrets before production
npm install
npm run seed                  # ~5,000 students, 6 weeks of marked attendance
npm run dev                   # http://localhost:5000

# 2. Web app (new terminal)
cd client
cp .env.example .env
npm install
npm run dev                   # http://localhost:5173
```

### Demo accounts

All seeded accounts use the password **`Password@123`**.

| Role | Email | What they can do |
|---|---|---|
| Faculty / advisor | `faculty@college.edu` | Mark own classes, edit inside the window, approve for their section |
| HOD | `hod.cse@college.edu` | Department-wide edits, unlock sessions, approve corrections, grant condonation |
| Attendance officer | `officer@college.edu` | Institution-wide visibility, all approvals, all reports |
| Admin | `admin@college.edu` | Master data, term policy, timetable generation, jobs |
| Student | shown at the end of the seed output | Own attendance, history, leave requests |

Student emails follow the roll number, e.g. `24cse001@student.college.edu`.

---

## What the seed creates

5 departments · 20 sections · ~1,200 students · 40 faculty · 50 subjects · ~200 course offerings with weekly timetables · ~6 weeks of class sessions with realistic marked attendance (including a deliberate tail of genuine defaulters and a few unmarked classes so every report is meaningful).

> Adjust `STUDENTS_PER_SECTION` in `server/scripts/seed.js` to reach the full 5,000-student scale.

---

## Design decisions

### Roles

| Role | Scope |
|---|---|
| `STUDENT` | Own attendance, history, leave/OD requests, correction requests for own marks |
| `FACULTY` | Mark and edit own classes within the edit window |
| `CLASS_ADVISOR` | Faculty rights + approve corrections and leave for their section |
| `HOD` | Department-wide edit, unlock locked sessions, grant condonation, department reports |
| `ATTENDANCE_OFFICER` | Institution-wide read and edit, all approvals, all reports |
| `ADMIN` | Master data, term policy, timetable generation, job triggers |

Permissions are **capability-based** (`attendance:mark`, `attendance:unlock`, `condonation:grant`, …) rather than role-string checks, so a new role is composed rather than coded. Row-level scoping is applied in the repository layer — a faculty query is narrowed before it reaches Mongo.

### Attendance statuses

| Status | Numerator | Denominator |
|---|---|---|
| `PRESENT` | Counts | Counts |
| `LATE` | Counts (configurable) | Counts |
| `ABSENT` | — | Counts |
| `EXCUSED` (on duty) | — | **Removed** (configurable) |
| `LEAVE` (approved) | — | **Removed** (configurable) |

Percentage is always `credited / countable`, never `credited / total`. That single choice is what stops approved on-duty from quietly damaging a student's record.

### Session lifecycle

```
SCHEDULED ──► MARKED ──► LOCKED
     │           │          │
     │           │          └──► unlock (HOD+, reason logged) ──► MARKED
     └──► CANCELLED              └──► correction request ──► approved ──► records rewritten
```

- Sessions are **generated ahead of time** from each offering's timetable, so a class that was never marked shows up as an unmarked session rather than a silent gap.
- Faculty may edit their own marking for **24 hours**; after **48 hours** the session locks automatically.
- A locked session can only change through an **approved correction request**, and the original status is preserved on every record.

### Correctness guarantees

- **Idempotent marking.** A unique index on `(sessionId, studentId)` plus bulk upserts means re-submitting a roster updates rather than duplicates.
- **Period weighting.** A three-hour lab is one record carrying `periodsCounted: 3`, so it counts as three periods in every calculation.
- **Defaults.** Everyone starts `PRESENT`; faculty tap only the absentees. Students omitted from a payload still receive the default mark, so the roster can never be partially saved.
- **Approved leave wins.** Students with approved OD/medical leave covering a date are pre-set and locked in the roster so they cannot be silently overwritten.
- **Cancelled classes are deleted, not zeroed.** A class that did not happen must not appear in any denominator.
- **Append-only audit.** Every mark, edit, correction, unlock and condonation is written to an immutable `AuditLog` with Mongoose hooks blocking update and delete.

### Performance at 5,000 students

- `AttendanceSummary` is **materialised** per student per subject, plus an `OVERALL` roll-up. Reports and dashboards read this collection instead of aggregating millions of raw records.
- Summaries recompute incrementally after each marking (off the request path) and are fully rebuilt nightly as a safety net.
- Compound indexes cover the faculty queue, the student portal, daily exports, the SLA-style scanners and every dashboard filter.
- Roster reads use `.lean()` and denormalised student snapshots, so opening a class is a single indexed query.

---

## Excel export

### Endpoints

| Method | Endpoint | Report |
|---|---|---|
| GET/POST | `/exports/daily?date=YYYY-MM-DD` | **One day's attendance register** |
| GET | `/exports/session/:sessionId` | A single class sheet |
| GET | `/exports/summary` | Per-student per-subject summary |
| GET | `/exports/defaulters` | Students below the threshold |
| GET | `/exports/monthly-register` | Monthly register |
| POST | `/exports/custom` | Any report with a full column spec |
| GET | `/exports/columns` | Column catalogue with default labels |
| GET/POST | `/exports/preview` | JSON preview of the exact rows and headers |
| GET/POST/DELETE | `/exports/templates` | Saved column layouts |

### Customising columns

Column selection resolves in this order: **request columns → saved template → report defaults.**

Daily export with the default columns:

```bash
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:5000/api/v1/exports/daily?date=2026-09-22" \
  -o attendance.xlsx
```

Pick columns and rename the headers:

```bash
curl -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  http://localhost:5000/api/v1/exports/daily \
  -d '{
        "query": { "date": "2026-09-22", "sectionId": "..." },
        "columns": [
          { "key": "serial",      "header": "S.No",         "width": 6  },
          { "key": "studentCode", "header": "Admission No", "width": 16 },
          { "key": "studentName", "header": "Name of Student" },
          { "key": "subjectName", "header": "Paper" },
          { "key": "status",      "header": "P / A",        "width": 10 },
          { "key": "remarks",     "header": "Staff Remarks" }
        ],
        "options": { "sheetName": "Register", "includeSummaryRow": true }
      }' \
  -o custom.xlsx
```

Or pass a simple comma list on a GET:

```
/exports/daily?date=2026-09-22&columns=studentCode,studentName,status,remarks
```

**Available columns** (daily/session): `serial`, `date`, `dayName`, `studentCode`, `registerNumber`, `studentName`, `departmentName`, `programmeName`, `sectionCode`, `semester`, `subjectCode`, `subjectName`, `facultyName`, `periodNumber`, `startTime`, `endTime`, `sessionType`, `roomNumber`, `status`, `statusShort`, `remarks`, `markedByName`, `markedAt`, `isCorrected`, `originalStatus`, `guardianName`, `guardianPhone`, `cumulativePercent`.

**Summary/defaulters** add: `heldPeriods`, `presentPeriods`, `absentPeriods`, `latePeriods`, `excusedPeriods`, `leavePeriods`, `countablePeriods`, `percent`, `riskBand`, `periodsToReachThreshold`, `condonationGranted`, `guardianEmail`, `lastComputedAt`.

`GET /exports/columns?reportType=DAILY_ATTENDANCE` returns the full catalogue with each column's default label, which is what the UI column picker renders. Unknown keys are ignored rather than throwing, so a stale saved template never breaks a download.

### Workbook output

White-theme styling to match the UI: slate header band, thin borders, frozen header row, auto-filter, landscape fit-to-width, a totals row, and conditional highlighting (absences in red, sub-threshold percentages in red, near-threshold in amber). A title block prints the report name, active filters and who generated it.

---

## Architecture

```
app/
├── server/
│   ├── src/
│   │   ├── config/          env, db, logger, constants (roles, capabilities, statuses)
│   │   ├── models/          17 Mongoose schemas with compound indexes
│   │   ├── modules/
│   │   │   ├── auth/        JWT access + rotating refresh with reuse detection
│   │   │   ├── academics/   departments, programmes, batches, sections, subjects, terms, holidays
│   │   │   ├── sessions/    timetable expansion, locking, cancellation, unmarked report
│   │   │   ├── attendance/  attendancePolicy (pure) · attendanceService (I/O)
│   │   │   ├── corrections/ correction + leave workflows with retro-application
│   │   │   ├── reports/     defaulters, section, department, trend, condonation
│   │   │   ├── exports/     columnRegistry · excelBuilder · exportService
│   │   │   └── audit/       append-only trail
│   │   ├── jobs/            lock (hourly) · summaries (nightly) · session-gen (weekly) · alerts (weekly)
│   │   ├── middlewares/     auth · rbac · validate · rateLimit · upload · errorHandler
│   │   └── sockets/         rooms per user / section / department
│   ├── scripts/seed.js
│   └── tests/               policy, column registry, date utils
│
└── client/                  React 18 + Vite, white theme
    └── src/
        ├── api/             RTK Query + a dedicated binary download helper
        ├── components/      Layout, badges, percent bars, modals
        ├── pages/
        │   ├── faculty/     TodayPage, MarkAttendance
        │   ├── student/     MyAttendance, MyHistory
        │   ├── admin/       Administration
        │   └─ Sessions, Defaulters, Corrections, Leaves, Reports, ExportCentre
        └── hooks/           useAuth, useSocket
```

**Layering rule:** Controller (HTTP only) → Service (business rules) → Model. The attendance policy is a **pure module** with no database access, which is why it can be unit-tested exhaustively.

---

## Screens

**Faculty** — Today (classes with mark/view actions, missed-class warnings) · Mark attendance (everyone present by default, one-tap absentee toggles, live tally, confirmation listing exactly who is being marked absent).

**Student** — My attendance (overall + per subject, how many classes to recover or how many can still be missed) · Day-by-day history with correction flags · Leave and on-duty requests.

**Advisor / HOD / Officer** — Low attendance with risk bands and guardian contacts · Corrections queue · Leave approvals · Reports with trend and section comparison · Export centre.

**Admin** — Term policy, timetable generation, job triggers.

---

## Accessibility

Built to WCAG 2.1 AA:

- Visible focus rings everywhere; skip-to-content link.
- Form errors carry `role="alert"` and are linked with `aria-describedby`.
- Icon-only controls carry `aria-label` (each attendance toggle announces the student's name and the target status).
- Attendance status, session status and risk bands use **icon + text + colour** — never colour alone.
- Percent bars expose `role="progressbar"` with value, min, max and a descriptive label including the threshold.
- Tables use `<caption>` and `scope` attributes throughout.

---

## Testing

```bash
cd server
npm test
```

Covers the attendance policy (status classification, exemption handling, lab weighting, risk banding, recovery maths, default rosters, roster validation, edit-window and lock rules), the export column registry (defaults, renames, ordering, templates, unknown-key tolerance, resolver output) and date-key utilities.

---

## API reference

Base URL `/api/v1` · Bearer token in `Authorization`, refresh token in an httpOnly cookie.

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/auth/login` · `/auth/refresh` · `/auth/logout` | Session |
| GET | `/dashboard` | Role-aware home payload |
| GET | `/sessions/my-schedule?date=` | A day's classes |
| GET | `/sessions` · `/sessions/unmarked` | Class list, missed-marking report |
| POST | `/sessions` · `/sessions/generate` | Extra class, timetable expansion |
| PATCH | `/sessions/:id/cancel` · `/sessions/:id/unlock` | Cancel, reopen |
| GET | `/attendance/sessions/:id/roster` | Roster with defaults applied |
| POST | `/attendance/sessions/:id/mark` | Idempotent bulk marking |
| PATCH | `/attendance/sessions/:id/records` | Inline per-student edit |
| GET | `/attendance/me` · `/attendance/me/history` | Student views |
| GET/POST/PATCH | `/corrections` · `/corrections/:id/review` | Correction workflow |
| GET/POST/PATCH | `/corrections/leaves` · `/corrections/leaves/:id/review` | Leave workflow |
| GET | `/reports/daily` · `/trend` · `/defaulters` · `/sections/:id` · `/departments` | Reports |
| PATCH | `/reports/summaries/:id/condone` | Grant condonation |
| GET/POST | `/exports/*` | Excel (see above) |
| GET | `/audit` | Immutable change history |
| POST | `/admin/jobs/*` | Manual job triggers |

**Response envelope**

```json
{ "success": true, "data": {}, "meta": { "page":1, "limit":25, "total":340, "totalPages":14 },
  "error": null, "traceId": "..." }
```

**Error codes:** `AUTH_401`, `FORBIDDEN_403`, `NOT_FOUND_404`, `SESSION_LOCKED_409`, `DUPLICATE_409`, `VALIDATION_422`, `RATE_LIMIT_429`, `INTERNAL_500`.

---

## Security

- JWT access tokens (15 min) + rotating httpOnly refresh cookies (7 days) with **reuse detection** — a replayed token invalidates the session.
- bcrypt cost 12, Helmet, CORS allow-list, `express-mongo-sanitize`, Zod validation on every write.
- Rate limits: 600 req/15 min globally, **5 sign-in attempts/15 min**, 40 exports/10 min (workbooks are built in memory).
- Capability-based RBAC plus repository-level row scoping.
- Uploads capped at 10 MB with a MIME allow-list and randomised filenames.

---

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `MONGO_URI` | `mongodb://127.0.0.1:27017/smart_attendance` | Database |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | — | **Change for production** |
| `MIN_ATTENDANCE_PERCENT` | `75` | Fallback threshold (term policy wins) |
| `CONDONATION_FLOOR_PERCENT` | `65` | Below this, no condonation is possible |
| `EDIT_WINDOW_HOURS` | `24` | How long faculty may edit their own marking |
| `LOCK_AFTER_HOURS` | `48` | When a session auto-locks |
| `DEFAULT_MARK` | `PRESENT` | Roster default |
| `EXCUSED_COUNTS_AS_PRESENT` | `true` | Whether OD is removed from the denominator |

The term's stored `policy` block overrides these per semester, so a rule change never retroactively rewrites past percentages.

---

## Production checklist

1. Replace both JWT secrets with 32+ byte random strings.
2. Set `COOKIE_SECURE=true` and serve over HTTPS.
3. Point `MONGO_URI` at a replica set.
4. Configure SMTP for absence and low-attendance emails.
5. Raise `STUDENTS_PER_SECTION` in the seed, or import real rosters, before go-live.
6. Set `CLIENT_ORIGIN` to the real front-end domain.
7. Run `npm run seed` only once on a fresh database — it wipes existing data.
