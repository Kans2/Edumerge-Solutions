import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardCheck, AlertTriangle, FileEdit, CalendarDays, Clock } from 'lucide-react';
import { useGetDashboardQuery, useGetMyScheduleQuery } from '../../api/endpoints';
import { Spinner, ErrorState, StatTile, EmptyState, SessionStatusBadge, InfoNote } from '../../components/Common';
import { todayKey, fmtDate } from '../../utils/format';
import { useAuth } from '../../hooks/useAuth';

export default function TodayPage() {
  const { isManager, isAdvisor } = useAuth();
  const [date, setDate] = useState(todayKey());
  const { data: dash, isLoading, error } = useGetDashboardQuery(undefined, { pollingInterval: 120000 });
  const { data: schedule } = useGetMyScheduleQuery(date, { skip: date === todayKey() });

  if (isLoading) return <Spinner label="Loading your day" />;
  if (error) return <ErrorState error={error} />;

  const today = date === todayKey() ? dash?.today : schedule;
  const sessions = today?.sessions || [];
  const pending = sessions.filter((s) => s.status === 'SCHEDULED');

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">
            {today?.dayName}, {fmtDate(date)}
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {sessions.length === 0
              ? 'No classes scheduled.'
              : `${today?.counts?.marked ?? 0} of ${sessions.length} classes marked.`}
          </p>
        </div>
        <div>
          <label htmlFor="day-picker" className="sr-only">Choose a date</label>
          <input
            id="day-picker"
            type="date"
            className="input w-auto"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile label="Classes today" value={sessions.length} icon={CalendarDays} />
        <StatTile
          label="Still to mark"
          value={pending.length}
          tone={pending.length ? 'warn' : 'good'}
          icon={ClipboardCheck}
        />
        <StatTile
          label="Missed earlier"
          value={dash?.unmarked?.total ?? 0}
          tone={dash?.unmarked?.total ? 'danger' : 'good'}
          sub="Unmarked past classes"
          icon={AlertTriangle}
        />
        <StatTile
          label="Pending approvals"
          value={(dash?.pendingCorrections ?? 0) + (dash?.pendingLeaves ?? 0)}
          sub={`${dash?.pendingCorrections ?? 0} corrections, ${dash?.pendingLeaves ?? 0} leave`}
          icon={FileEdit}
        />
      </div>

      {dash?.defaulters && (
        <InfoNote tone={dash.defaulters.total ? 'amber' : 'slate'}>
          <strong>{dash.defaulters.total}</strong> students are below {dash.defaulters.threshold}%
          {dash.defaulters.byBand?.DETAINED ? ` — ${dash.defaulters.byBand.DETAINED} are in the detained band.` : '.'}
          {' '}
          <Link to="/defaulters" className="font-medium underline">Review the list</Link>
        </InfoNote>
      )}

      <section aria-labelledby="classes-heading">
        <h2 id="classes-heading" className="font-medium text-slate-900 mb-3">Your classes</h2>

        {sessions.length === 0 ? (
          <EmptyState
            title="Nothing scheduled"
            message="You have no classes on this day. Pick another date to look ahead or back."
          />
        ) : (
          <div className="space-y-2">
            {sessions.map((s) => (
              <div key={s._id} className="card p-4 flex flex-wrap items-center gap-4">
                <div className="flex flex-col items-center justify-center rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 min-w-[68px]">
                  <span className="text-xs text-slate-500">Period</span>
                  <span className="text-lg font-semibold text-slate-900">{s.periodNumber || '-'}</span>
                </div>

                <div className="flex-1 min-w-[200px]">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-slate-500">{s.subjectCode}</span>
                    <SessionStatusBadge status={s.status} />
                    {s.sessionType === 'LAB' && (
                      <span className="badge bg-brand-50 text-brand-700">Lab · {s.periodsCounted} periods</span>
                    )}
                  </div>
                  <p className="font-medium text-slate-900 mt-0.5">{s.subjectName}</p>
                  <p className="text-sm text-slate-500">
                    {s.sectionCode}
                    {s.startTime ? ` · ${s.startTime}${s.endTime ? `-${s.endTime}` : ''}` : ''}
                    {s.roomNumber ? ` · Room ${s.roomNumber}` : ''}
                  </p>
                </div>

                {s.status === 'MARKED' || s.status === 'LOCKED' ? (
                  <div className="text-right">
                    <p className="text-sm font-semibold text-slate-900">
                      {s.stats?.present ?? 0}/{s.stats?.total ?? 0} present
                    </p>
                    <p className="text-xs text-slate-500">
                      {s.stats?.absent ?? 0} absent · {(s.stats?.percent ?? 0).toFixed(1)}%
                    </p>
                  </div>
                ) : (
                  <span className="inline-flex items-center gap-1 text-sm text-amber-700">
                    <Clock size={14} aria-hidden="true" /> Not marked
                  </span>
                )}

                <Link
                  to={`/mark/${s._id}`}
                  className={s.status === 'SCHEDULED' ? 'btn-primary' : 'btn-secondary'}
                >
                  {s.status === 'SCHEDULED' ? 'Mark attendance' : 'View roster'}
                </Link>
              </div>
            ))}
          </div>
        )}
      </section>

      {dash?.unmarked?.total > 0 && (isAdvisor || isManager) && (
        <section className="card p-5" aria-labelledby="unmarked-heading">
          <h2 id="unmarked-heading" className="font-medium text-slate-900">
            Unmarked classes from earlier days
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Attendance was never captured for these. The percentages are incomplete until they are.
          </p>
          <ul className="mt-3 space-y-1">
            {(dash.unmarked.byFaculty || []).map((f) => (
              <li key={f.facultyId} className="flex items-center justify-between text-sm py-1.5 border-b border-slate-100 last:border-0">
                <span className="text-slate-700">{f.facultyName}</span>
                <span className="font-medium text-amber-700">{f.count} classes</span>
              </li>
            ))}
          </ul>
          <Link to="/sessions?status=SCHEDULED" className="btn-secondary btn-sm mt-3 inline-flex">
            View all
          </Link>
        </section>
      )}
    </div>
  );
}
