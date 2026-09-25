import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft, Save, Search, Users, CheckCheck, Lock, RotateCcw, FileSpreadsheet,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  useGetRosterQuery, useMarkSessionMutation, useUpdateRecordsMutation,
} from '../../api/endpoints';
import { downloadExcel } from '../../api/download';
import {
  Spinner, ErrorState, InfoNote, SessionStatusBadge, Modal,
} from '../../components/Common';
import { STATUS_META, MARK_ORDER } from '../../utils/constants';
import { fmtDate, fmtDateTime } from '../../utils/format';

export default function MarkAttendance() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const { data, isLoading, error, refetch } = useGetRosterQuery(sessionId);
  const [markSession, { isLoading: saving }] = useMarkSessionMutation();
  const [updateRecords] = useUpdateRecordsMutation();

  const [marks, setMarks] = useState({});      // studentId -> status
  const [remarks, setRemarks] = useState({});
  const [search, setSearch] = useState('');
  const [topic, setTopic] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);

  /* Seed local state from the server roster (defaults already applied). */
  useEffect(() => {
    if (!data?.roster) return;
    const m = {};
    const r = {};
    data.roster.forEach((row) => {
      m[row.studentId] = row.status;
      if (row.remarks) r[row.studentId] = row.remarks;
    });
    setMarks(m);
    setRemarks(r);
    setTopic(data.session?.topic || '');
  }, [data]);

  const roster = data?.roster || [];
  const session = data?.session;
  const editable = data?.editable;

  const filtered = useMemo(() => {
    if (!search.trim()) return roster;
    const q = search.trim().toLowerCase();
    return roster.filter((r) =>
      String(r.studentName || '').toLowerCase().includes(q)
      || String(r.rollNumber || '').toLowerCase().includes(q)
      || String(r.studentCode || '').toLowerCase().includes(q));
  }, [roster, search]);

  const counts = useMemo(() => {
    const c = { PRESENT: 0, ABSENT: 0, LATE: 0, EXCUSED: 0, LEAVE: 0 };
    Object.values(marks).forEach((s) => { c[s] = (c[s] || 0) + 1; });
    const countable = c.PRESENT + c.ABSENT + c.LATE;
    return { ...c, total: roster.length, percent: countable ? ((c.PRESENT + c.LATE) / countable) * 100 : 100 };
  }, [marks, roster.length]);

  const setMark = (studentId, status) => {
    const row = roster.find((r) => r.studentId === studentId);
    if (row?.locked) {
      toast('This student has approved leave for today and cannot be changed here.', { icon: '\u2139' });
      return;
    }
    setMarks((prev) => ({ ...prev, [studentId]: status }));
  };

  const markAll = (status) => {
    const next = { ...marks };
    roster.forEach((r) => { if (!r.locked) next[r.studentId] = status; });
    setMarks(next);
  };

  const resetToDefault = () => {
    const next = {};
    roster.forEach((r) => { next[r.studentId] = r.locked ? r.status : (data.defaultMark || 'PRESENT'); });
    setMarks(next);
    toast.success(`Reset everyone to ${STATUS_META[data.defaultMark || 'PRESENT'].label.toLowerCase()}`);
  };

  const submit = async () => {
    try {
      // Send the whole roster; the server treats it idempotently.
      const entries = roster.map((r) => ({
        studentId: r.studentId,
        status: marks[r.studentId] || 'PRESENT',
        remarks: remarks[r.studentId] || undefined,
      }));
      const result = await markSession({ sessionId, entries, topic }).unwrap();
      toast.success(
        `Saved: ${result.data?.stats?.present ?? counts.PRESENT} present, ${result.data?.stats?.absent ?? counts.ABSENT} absent`
      );
      setConfirmOpen(false);
      refetch();
    } catch (err) {
      toast.error(err?.data?.error?.message || 'Could not save attendance');
      setConfirmOpen(false);
    }
  };

  if (isLoading) return <Spinner label="Loading the class roster" />;
  if (error) return <ErrorState error={error} />;
  if (!session) return null;

  const absentList = roster.filter((r) => marks[r.studentId] === 'ABSENT');

  return (
    <div className="space-y-4">
      <button type="button" onClick={() => navigate(-1)} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft size={16} aria-hidden="true" /> Back
      </button>

      {/* Header */}
      <header className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm text-slate-500">{session.subjectCode}</span>
              <SessionStatusBadge status={session.status} />
              {session.editCount > 0 && (
                <span className="badge bg-amber-50 text-amber-800">Edited {session.editCount}x</span>
              )}
            </div>
            <h1 className="text-lg font-semibold text-slate-900 mt-1">{session.subjectName}</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              {session.sectionCode} · {fmtDate(session.date)} · Period {session.periodNumber || '-'}
              {session.startTime ? ` · ${session.startTime}${session.endTime ? `-${session.endTime}` : ''}` : ''}
              {session.roomNumber ? ` · Room ${session.roomNumber}` : ''}
            </p>
            {session.markedAt && (
              <p className="text-xs text-slate-400 mt-1">
                Marked by {session.markedByName} on {fmtDateTime(session.markedAt)}
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => downloadExcel({ path: `/exports/session/${sessionId}` })}
            >
              <FileSpreadsheet size={16} aria-hidden="true" /> Export sheet
            </button>
            {editable && (
              <button type="button" className="btn-primary" onClick={() => setConfirmOpen(true)} disabled={saving}>
                <Save size={16} aria-hidden="true" />
                {saving ? 'Saving...' : data.isMarked ? 'Update attendance' : 'Save attendance'}
              </button>
            )}
          </div>
        </div>

        {!editable && (
          <div className="mt-4">
            <InfoNote tone="amber">
              <span className="inline-flex items-center gap-2">
                <Lock size={15} aria-hidden="true" />
                {data.editBlockedReason}
              </span>
              {session.status === 'LOCKED' && (
                <Link to={`/corrections/new?sessionId=${sessionId}`} className="ml-2 font-medium underline">
                  Raise a correction request
                </Link>
              )}
            </InfoNote>
          </div>
        )}
      </header>

      {/* Live tally */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { key: 'total', label: 'Students', value: counts.total, cls: 'text-slate-900' },
          { key: 'PRESENT', label: 'Present', value: counts.PRESENT, cls: 'text-emerald-600' },
          { key: 'ABSENT', label: 'Absent', value: counts.ABSENT, cls: 'text-red-600' },
          { key: 'LATE', label: 'Late', value: counts.LATE, cls: 'text-amber-600' },
          { key: 'EXCUSED', label: 'On duty', value: counts.EXCUSED + counts.LEAVE, cls: 'text-brand-600' },
        ].map((t) => (
          <div key={t.key} className="card p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{t.label}</p>
            <p className={`text-xl font-semibold mt-0.5 ${t.cls}`}>{t.value}</p>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="card p-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} aria-hidden="true" />
          <label htmlFor="roster-search" className="sr-only">Search students</label>
          <input
            id="roster-search"
            className="input pl-9"
            placeholder="Search by name or roll number"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {editable && (
          <>
            <button type="button" className="btn-secondary btn-sm" onClick={() => markAll('PRESENT')}>
              <CheckCheck size={14} aria-hidden="true" /> All present
            </button>
            <button type="button" className="btn-secondary btn-sm" onClick={resetToDefault}>
              <RotateCcw size={14} aria-hidden="true" /> Reset
            </button>
          </>
        )}
      </div>

      {editable && !data.isMarked && (
        <InfoNote tone="blue">
          Everyone starts as <strong>{STATUS_META[data.defaultMark || 'PRESENT'].label}</strong>.
          Mark only the students who are absent, then save — that is usually a handful of taps.
        </InfoNote>
      )}

      {/* Roster */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <caption className="sr-only">
              Attendance roster for {session.subjectName} on {session.date}
            </caption>
            <thead>
              <tr>
                <th scope="col" className="th w-14">#</th>
                <th scope="col" className="th">Roll number</th>
                <th scope="col" className="th">Student</th>
                <th scope="col" className="th">Attendance</th>
                <th scope="col" className="th">Remarks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((row, i) => {
                const current = marks[row.studentId];
                return (
                  <tr key={row.studentId} className={row.locked ? 'bg-brand-50/40' : 'hover:bg-slate-50'}>
                    <td className="td text-slate-400 tabular-nums">{i + 1}</td>
                    <td className="td font-mono text-xs">{row.rollNumber || row.studentCode}</td>
                    <td className="td">
                      <span className="font-medium text-slate-800">{row.studentName}</span>
                      {row.locked && (
                        <span className="ml-2 badge bg-brand-50 text-brand-700 border border-brand-200">
                          <span aria-hidden="true">&#9873;</span> Approved leave
                        </span>
                      )}
                      {row.isCorrected && (
                        <span className="ml-2 badge bg-amber-50 text-amber-800">Corrected</span>
                      )}
                    </td>
                    <td className="td">
                      <div className="flex flex-wrap gap-1" role="group" aria-label={`Attendance for ${row.studentName}`}>
                        {MARK_ORDER.map((status) => {
                          const meta = STATUS_META[status];
                          const active = current === status;
                          return (
                            <button
                              key={status}
                              type="button"
                              disabled={!editable || row.locked}
                              aria-pressed={active}
                              aria-label={`Mark ${row.studentName} as ${meta.label}`}
                              onClick={() => setMark(row.studentId, status)}
                              className={active ? meta.btn : 'mark-idle'}
                            >
                              <span aria-hidden="true">{meta.icon}</span> {meta.short}
                            </button>
                          );
                        })}
                      </div>
                    </td>
                    <td className="td">
                      <label htmlFor={`remark-${row.studentId}`} className="sr-only">
                        Remarks for {row.studentName}
                      </label>
                      <input
                        id={`remark-${row.studentId}`}
                        className="input py-1 text-xs"
                        placeholder="Optional"
                        disabled={!editable || row.locked}
                        value={remarks[row.studentId] || ''}
                        onChange={(e) => setRemarks((p) => ({ ...p, [row.studentId]: e.target.value }))}
                      />
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td className="td text-slate-500" colSpan={5}>No students match that search.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editable && (
        <div className="flex items-center justify-between gap-3 sticky bottom-0 bg-white border-t border-slate-200 py-3">
          <div>
            <label htmlFor="session-topic" className="sr-only">Topic covered</label>
            <input
              id="session-topic"
              className="input max-w-md"
              placeholder="Topic covered today (optional)"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
            />
          </div>
          <button type="button" className="btn-primary" onClick={() => setConfirmOpen(true)} disabled={saving}>
            <Save size={16} aria-hidden="true" />
            {saving ? 'Saving...' : data.isMarked ? 'Update attendance' : 'Save attendance'}
          </button>
        </div>
      )}

      {/* Confirmation */}
      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Confirm attendance"
        description={`${session.subjectName} · ${session.sectionCode} · ${fmtDate(session.date)}`}
        footer={(
          <>
            <button type="button" className="btn-secondary" onClick={() => setConfirmOpen(false)}>Go back</button>
            <button type="button" className="btn-primary" onClick={submit} disabled={saving}>
              {saving ? 'Saving...' : 'Confirm and save'}
            </button>
          </>
        )}
      >
        <div className="grid grid-cols-4 gap-2 text-center">
          {['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'].map((s) => (
            <div key={s} className={`rounded-lg border p-2 ${STATUS_META[s].cls}`}>
              <p className="text-xs">{STATUS_META[s].label}</p>
              <p className="text-lg font-semibold">
                {s === 'EXCUSED' ? counts.EXCUSED + counts.LEAVE : counts[s]}
              </p>
            </div>
          ))}
        </div>

        {absentList.length > 0 && (
          <div className="mt-4">
            <p className="text-sm font-medium text-slate-700">
              Marking absent ({absentList.length}):
            </p>
            <ul className="mt-1 max-h-40 overflow-y-auto text-sm text-slate-600 space-y-0.5">
              {absentList.map((a) => (
                <li key={a.studentId}>{a.rollNumber || a.studentCode} — {a.studentName}</li>
              ))}
            </ul>
            <p className="text-xs text-slate-500 mt-2">
              Each of these students receives a notification immediately.
            </p>
          </div>
        )}

        {absentList.length === 0 && (
          <p className="mt-4 text-sm text-emerald-700">Full attendance — nobody is marked absent.</p>
        )}
      </Modal>
    </div>
  );
}
