import { Link } from 'react-router-dom';
import { TrendingDown, CalendarDays, FileEdit, Info } from 'lucide-react';
import { useGetMyAttendanceQuery, useGetDashboardQuery } from '../../api/endpoints';
import {
  Spinner, ErrorState, StatTile, PercentBar, RiskBadge, EmptyState, InfoNote,
} from '../../components/Common';
import { percentTone } from '../../utils/format';

export default function MyAttendance() {
  const { data, isLoading, error } = useGetMyAttendanceQuery({});
  const { data: dash } = useGetDashboardQuery();

  if (isLoading) return <Spinner label="Loading your attendance" />;
  if (error) return <ErrorState error={error} />;

  const threshold = data?.threshold ?? 75;
  const overall = data?.overall;
  const subjects = data?.subjects || [];

  if (!overall && subjects.length === 0) {
    return (
      <EmptyState
        title="No attendance recorded yet"
        message="Once your classes begin and faculty mark attendance, your percentages will appear here."
      />
    );
  }

  const atRisk = subjects.filter((s) => s.percent < threshold);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">My attendance</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          You need at least <strong>{threshold}%</strong> in each subject.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile
          label="Overall"
          value={overall ? `${overall.percent.toFixed(1)}%` : '-'}
          tone={overall ? (overall.percent >= threshold ? 'good' : 'danger') : 'default'}
          sub={overall ? `${overall.presentPeriods + overall.latePeriods} of ${overall.countablePeriods} classes` : undefined}
        />
        <StatTile label="Classes held" value={overall?.heldPeriods ?? 0} />
        <StatTile label="Absent" value={overall?.absentPeriods ?? 0} tone={overall?.absentPeriods ? 'warn' : 'good'} />
        <StatTile
          label="On duty / leave"
          value={(overall?.excusedPeriods ?? 0) + (overall?.leavePeriods ?? 0)}
          sub="Not counted against you"
        />
      </div>

      {overall && overall.percent < threshold && (
        <InfoNote tone="amber">
          <strong>You are below the required {threshold}%.</strong>{' '}
          {overall.periodsToReachThreshold == null
            ? 'It is no longer mathematically possible to reach the threshold this term. Please speak to your class advisor.'
            : `Attend the next ${overall.periodsToReachThreshold} classes without missing any to get back above ${threshold}%.`}
        </InfoNote>
      )}

      <div className="flex flex-wrap gap-2">
        <Link to="/my-history" className="btn-secondary">
          <CalendarDays size={16} aria-hidden="true" /> Day-by-day history
        </Link>
        <Link to="/leaves" className="btn-secondary">
          <FileEdit size={16} aria-hidden="true" /> Apply for leave or on-duty
        </Link>
      </div>

      <section aria-labelledby="subjects-heading">
        <h2 id="subjects-heading" className="font-medium text-slate-900 mb-3">
          By subject
          {atRisk.length > 0 && (
            <span className="ml-2 badge bg-red-50 text-red-800 border border-red-200">
              <TrendingDown size={12} aria-hidden="true" /> {atRisk.length} below {threshold}%
            </span>
          )}
        </h2>

        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <caption className="sr-only">Attendance percentage for each subject</caption>
              <thead>
                <tr>
                  <th scope="col" className="th">Subject</th>
                  <th scope="col" className="th">Held</th>
                  <th scope="col" className="th">Present</th>
                  <th scope="col" className="th">Absent</th>
                  <th scope="col" className="th">Attendance</th>
                  <th scope="col" className="th">Status</th>
                  <th scope="col" className="th">Action needed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {subjects.map((s) => (
                  <tr key={s._id} className="hover:bg-slate-50">
                    <td className="td">
                      <span className="font-medium text-slate-900">{s.subjectName}</span>
                      <span className="block font-mono text-xs text-slate-500">{s.subjectCode}</span>
                    </td>
                    <td className="td tabular-nums">{s.heldPeriods}</td>
                    <td className="td tabular-nums">{s.presentPeriods + s.latePeriods}</td>
                    <td className={`td tabular-nums ${s.absentPeriods ? 'text-red-600 font-medium' : ''}`}>
                      {s.absentPeriods}
                    </td>
                    <td className="td"><PercentBar value={s.percent} threshold={threshold} /></td>
                    <td className="td"><RiskBadge band={s.riskBand} /></td>
                    <td className="td text-sm">
                      {s.percent >= threshold ? (
                        <span className="text-slate-500">
                          Can miss {s.canMiss === Infinity ? 'many' : s.canMiss} more
                        </span>
                      ) : s.periodsToReachThreshold == null ? (
                        <span className="text-red-700 font-medium">Not recoverable</span>
                      ) : (
                        <span className="text-amber-700 font-medium">
                          Attend {s.periodsToReachThreshold} in a row
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <InfoNote>
        <Info size={14} className="inline mr-1" aria-hidden="true" />
        Approved on-duty and medical leave are removed from the calculation entirely — they neither
        help nor hurt your percentage. If a mark looks wrong, raise a correction request from the
        day-by-day history.
      </InfoNote>
    </div>
  );
}
