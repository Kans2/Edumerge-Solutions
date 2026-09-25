import { useState } from 'react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { Download } from 'lucide-react';
import {
  useGetDailyReportQuery, useGetTrendQuery, useGetDepartmentReportQuery,
  useGetSectionsQuery, useGetSectionReportQuery, useGetDepartmentsQuery,
} from '../api/endpoints';
import { downloadExcel } from '../api/download';
import {
  Spinner, ErrorState, StatTile, PercentBar, RiskBadge, EmptyState,
} from '../components/Common';
import { todayKey, fmtDate } from '../utils/format';

export default function Reports() {
  const [date, setDate] = useState(todayKey());
  const [departmentId, setDepartmentId] = useState('');
  const [sectionId, setSectionId] = useState('');

  const scope = { ...(departmentId ? { departmentId } : {}), ...(sectionId ? { sectionId } : {}) };

  const { data: daily, isLoading, error } = useGetDailyReportQuery({ date, ...scope });
  const { data: trend = [] } = useGetTrendQuery({ days: 30, ...scope });
  const { data: deptReport } = useGetDepartmentReportQuery(scope);
  const { data: sections = [] } = useGetSectionsQuery({});
  const { data: departments = [] } = useGetDepartmentsQuery();
  const { data: sectionReport } = useGetSectionReportQuery({ sectionId }, { skip: !sectionId });

  if (isLoading) return <Spinner label="Building reports" />;
  if (error) return <ErrorState error={error} />;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Reports</h1>
          <p className="text-sm text-slate-500 mt-0.5">Marking compliance, trends and section performance.</p>
        </div>
        <button
          type="button"
          className="btn-primary"
          onClick={() => downloadExcel({ path: '/exports/summary', query: scope })}
        >
          <Download size={16} aria-hidden="true" /> Export summary
        </button>
      </div>

      <div className="card p-3 flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="r-date" className="label">Day</label>
          <input id="r-date" type="date" className="input w-auto" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <label htmlFor="r-dept" className="label">Department</label>
          <select id="r-dept" className="input w-auto" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
            <option value="">All departments</option>
            {departments.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="r-section" className="label">Section</label>
          <select id="r-section" className="input w-auto" value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
            <option value="">All sections</option>
            {sections.map((s) => <option key={s._id} value={s._id}>{s.code}</option>)}
          </select>
        </div>
      </div>

      {/* Day snapshot */}
      <section aria-labelledby="day-heading">
        <h2 id="day-heading" className="font-medium text-slate-900 mb-3">{fmtDate(date)}</h2>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <StatTile
            label="Attendance"
            value={daily?.attendancePercent != null ? `${daily.attendancePercent.toFixed(1)}%` : '-'}
            tone={daily?.attendancePercent >= 75 ? 'good' : 'warn'}
          />
          <StatTile
            label="Marking compliance"
            value={daily?.markingCompliance != null ? `${daily.markingCompliance.toFixed(0)}%` : '-'}
            tone={daily?.markingCompliance >= 95 ? 'good' : 'warn'}
            sub={`${daily?.sessions?.scheduled ?? 0} still unmarked`}
          />
          <StatTile label="Classes held" value={daily?.sessions?.total ?? 0} />
          <StatTile label="Present" value={daily?.marks?.present ?? 0} tone="good" />
          <StatTile label="Absent" value={daily?.marks?.absent ?? 0} tone={daily?.marks?.absent ? 'danger' : 'good'} />
        </div>
      </section>

      {/* Trend */}
      <section className="card p-4" aria-label="Attendance trend">
        <h2 className="font-medium text-slate-900 mb-3">Attendance over the last 30 days</h2>
        {trend.length === 0 ? (
          <EmptyState title="No data yet" message="Once classes are marked the trend appears here." />
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(d) => d.slice(5)} />
              <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} />
              <Tooltip formatter={(v) => (v == null ? '-' : `${Number(v).toFixed(1)}%`)} />
              <Legend />
              <Line type="monotone" dataKey="percent" name="Attendance %" stroke="#2563eb" strokeWidth={2} dot={false} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        )}
      </section>

      {/* Section comparison */}
      {deptReport?.bySection?.length > 0 && (
        <section className="card p-4" aria-label="Section comparison">
          <h2 className="font-medium text-slate-900 mb-3">Average attendance by section</h2>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={deptReport.bySection.slice(0, 15)}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="sectionCode" tick={{ fontSize: 10 }} angle={-25} textAnchor="end" height={70} />
              <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} />
              <Tooltip />
              <Legend />
              <Bar dataKey="avgPercent" name="Average %" fill="#2563eb" radius={[4, 4, 0, 0]} />
              <Bar dataKey="below" name="Below threshold" fill="#ef4444" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </section>
      )}

      {/* Section drill-down */}
      {sectionReport && (
        <section className="card overflow-hidden" aria-label="Section detail">
          <div className="p-4 border-b border-slate-200">
            <h2 className="font-medium text-slate-900">{sectionReport.section?.code}</h2>
            <p className="text-sm text-slate-500">
              {sectionReport.studentCount} students · average {sectionReport.averagePercent}% ·
              threshold {sectionReport.threshold}%
            </p>
          </div>

          <div className="overflow-x-auto max-h-[480px]">
            <table className="w-full">
              <caption className="sr-only">Student attendance in this section</caption>
              <thead className="sticky top-0">
                <tr>
                  <th scope="col" className="th">Roll number</th>
                  <th scope="col" className="th">Student</th>
                  <th scope="col" className="th">Held</th>
                  <th scope="col" className="th">Absent</th>
                  <th scope="col" className="th">Attendance</th>
                  <th scope="col" className="th">Band</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sectionReport.students.map((s) => (
                  <tr key={s._id} className="hover:bg-slate-50">
                    <td className="td font-mono text-xs">{s.rollNumber || s.studentCode}</td>
                    <td className="td font-medium text-slate-800">{s.studentName}</td>
                    <td className="td tabular-nums">{s.heldPeriods}</td>
                    <td className="td tabular-nums">{s.absentPeriods}</td>
                    <td className="td"><PercentBar value={s.percent} threshold={sectionReport.threshold} /></td>
                    <td className="td"><RiskBadge band={s.riskBand} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
