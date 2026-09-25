import { useState } from 'react';
import { useGetMyHistoryQuery } from '../../api/endpoints';
import { Spinner, ErrorState, EmptyState, StatusBadge } from '../../components/Common';
import { fmtDate, todayKey } from '../../utils/format';

export default function MyHistory() {
  const [range, setRange] = useState({
    from: new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10),
    to: todayKey(),
  });
  const [statusFilter, setStatusFilter] = useState('');

  const { data: days = [], isLoading, error } = useGetMyHistoryQuery({
    ...range, ...(statusFilter ? { status: statusFilter } : {}),
  });

  if (isLoading) return <Spinner label="Loading your history" />;
  if (error) return <ErrorState error={error} />;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Day-by-day history</h1>
        <p className="text-sm text-slate-500 mt-0.5">Every period, exactly as it was recorded.</p>
      </div>

      <div className="card p-3 flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="h-from" className="label">From</label>
          <input id="h-from" type="date" className="input w-auto" value={range.from}
            onChange={(e) => setRange({ ...range, from: e.target.value })} />
        </div>
        <div>
          <label htmlFor="h-to" className="label">To</label>
          <input id="h-to" type="date" className="input w-auto" value={range.to}
            onChange={(e) => setRange({ ...range, to: e.target.value })} />
        </div>
        <div>
          <label htmlFor="h-status" className="label">Show only</label>
          <select id="h-status" className="input w-auto" value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All periods</option>
            <option value="ABSENT">Absences</option>
            <option value="LATE">Late arrivals</option>
            <option value="EXCUSED,LEAVE">On duty / leave</option>
          </select>
        </div>
      </div>

      {days.length === 0 ? (
        <EmptyState title="Nothing in this range" message="Try widening the dates or clearing the filter." />
      ) : (
        <div className="space-y-3">
          {days.map((day) => (
            <section key={day.date} className="card overflow-hidden" aria-label={`Attendance on ${day.date}`}>
              <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 bg-slate-50 border-b border-slate-200">
                <div>
                  <h2 className="font-medium text-slate-900">{fmtDate(day.date)}</h2>
                  <p className="text-xs text-slate-500">{day.dayName}</p>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <span className="text-emerald-700">{day.summary.present} present</span>
                  {day.summary.absent > 0 && <span className="text-red-700">{day.summary.absent} absent</span>}
                  {day.summary.excused > 0 && <span className="text-brand-700">{day.summary.excused} on duty</span>}
                </div>
              </div>

              <table className="w-full">
                <caption className="sr-only">Periods on {day.date}</caption>
                <thead className="sr-only">
                  <tr><th scope="col">Period</th><th scope="col">Subject</th><th scope="col">Faculty</th><th scope="col">Status</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {day.periods.map((p) => (
                    <tr key={p.recordId} className="hover:bg-slate-50">
                      <td className="td w-20 text-slate-500">P{p.periodNumber || '-'}</td>
                      <td className="td">
                        <span className="font-medium text-slate-800">{p.subjectName}</span>
                        <span className="block font-mono text-xs text-slate-500">{p.subjectCode}</span>
                      </td>
                      <td className="td text-slate-600">{p.facultyName || '-'}</td>
                      <td className="td">
                        <StatusBadge status={p.status} />
                        {p.isCorrected && (
                          <span className="ml-2 badge bg-amber-50 text-amber-800">
                            Corrected from {p.originalStatus}
                          </span>
                        )}
                        {p.remarks && <span className="block text-xs text-slate-500 mt-1">{p.remarks}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
