import { useState } from 'react';
import { Play, CalendarPlus } from 'lucide-react';
import toast from 'react-hot-toast';
import { useGenerateSessionsMutation, useGetCurrentTermQuery, useGetDepartmentsQuery } from '../../api/endpoints';
import { Spinner, StatTile, InfoNote } from '../../components/Common';
import { API_URL } from '../../api/baseApi';
import { fmtDate, todayKey } from '../../utils/format';

const JOBS = [
  { path: 'lock-sessions', label: 'Lock expired sessions', desc: 'Closes the edit window on sessions older than the policy allows. Runs hourly.' },
  { path: 'recompute-summaries', label: 'Rebuild summaries', desc: 'Full recalculation of every attendance percentage. Runs nightly.' },
  { path: 'generate-sessions', label: 'Generate sessions', desc: 'Materialises the next four weeks of classes from the timetable. Runs weekly.' },
  { path: 'low-attendance-alerts', label: 'Low attendance alerts', desc: 'Notifies every student below the threshold. Runs Monday mornings.' },
];

export default function Administration() {
  const { data: term, isLoading } = useGetCurrentTermQuery();
  const { data: departments = [] } = useGetDepartmentsQuery();
  const [generateSessions, { isLoading: generating }] = useGenerateSessionsMutation();
  const [range, setRange] = useState({
    fromDate: todayKey(),
    toDate: new Date(Date.now() + 28 * 86400000).toISOString().slice(0, 10),
  });

  const runJob = async (path, label) => {
    try {
      const token = JSON.parse(localStorage.getItem('att_auth') || '{}').accessToken;
      const res = await fetch(`${API_URL}/admin/jobs/${path}`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({}),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message || 'Job failed');
      toast.success(`${label} complete`);
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleGenerate = async () => {
    try {
      const result = await generateSessions(range).unwrap();
      toast.success(`Created ${result.data?.created ?? 0} sessions (${result.data?.skipped ?? 0} already existed)`);
    } catch (err) {
      toast.error(err?.data?.error?.message || 'Generation failed');
    }
  };

  if (isLoading) return <Spinner />;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Administration</h1>
        <p className="text-sm text-slate-500 mt-0.5">Term policy, timetable generation and scheduled jobs.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile label="Current term" value={term?.name || 'Not set'} sub={term ? `${fmtDate(term.startDate)} to ${fmtDate(term.endDate)}` : undefined} />
        <StatTile label="Required attendance" value={term ? `${term.policy?.minAttendancePercent}%` : '-'} />
        <StatTile label="Condonation floor" value={term ? `${term.policy?.condonationFloorPercent}%` : '-'} />
        <StatTile label="Departments" value={departments.length} />
      </div>

      {term && (
        <section className="card p-5" aria-labelledby="policy-heading">
          <h2 id="policy-heading" className="font-medium text-slate-900">Attendance policy in force</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            The policy is stored on the term, so changing it next semester never rewrites past percentages.
          </p>
          <dl className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-4 text-sm">
            <div><dt className="text-slate-500">Minimum required</dt><dd className="font-medium">{term.policy.minAttendancePercent}%</dd></div>
            <div><dt className="text-slate-500">Condonation floor</dt><dd className="font-medium">{term.policy.condonationFloorPercent}%</dd></div>
            <div><dt className="text-slate-500">Default mark</dt><dd className="font-medium">{term.policy.defaultMark}</dd></div>
            <div><dt className="text-slate-500">Edit window</dt><dd className="font-medium">{term.policy.editWindowHours} hours</dd></div>
            <div><dt className="text-slate-500">Auto-lock after</dt><dd className="font-medium">{term.policy.lockAfterHours} hours</dd></div>
            <div>
              <dt className="text-slate-500">On-duty treatment</dt>
              <dd className="font-medium">
                {term.policy.excusedCountsAsPresent ? 'Excluded from the calculation' : 'Counted as absent'}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Late arrivals</dt>
              <dd className="font-medium">{term.policy.lateCountsAsPresent ? 'Count as present' : 'Count as absent'}</dd>
            </div>
          </dl>
        </section>
      )}

      <section className="card p-5" aria-labelledby="generate-heading">
        <h2 id="generate-heading" className="font-medium text-slate-900">Generate class sessions</h2>
        <p className="text-sm text-slate-500 mt-0.5">
          Expands every timetable into concrete classes, skipping declared holidays.
        </p>
        <div className="flex flex-wrap items-end gap-3 mt-3">
          <div>
            <label htmlFor="g-from" className="label">From</label>
            <input id="g-from" type="date" className="input w-auto" value={range.fromDate}
              onChange={(e) => setRange({ ...range, fromDate: e.target.value })} />
          </div>
          <div>
            <label htmlFor="g-to" className="label">To</label>
            <input id="g-to" type="date" className="input w-auto" value={range.toDate}
              onChange={(e) => setRange({ ...range, toDate: e.target.value })} />
          </div>
          <button type="button" className="btn-primary" onClick={handleGenerate} disabled={generating}>
            <CalendarPlus size={16} aria-hidden="true" /> {generating ? 'Generating...' : 'Generate'}
          </button>
        </div>
        <div className="mt-3">
          <InfoNote>
            Safe to run repeatedly — existing sessions are left untouched and only gaps are filled.
          </InfoNote>
        </div>
      </section>

      <section aria-labelledby="jobs-heading">
        <h2 id="jobs-heading" className="font-medium text-slate-900 mb-3">Scheduled jobs</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          {JOBS.map((j) => (
            <div key={j.path} className="card p-4">
              <h3 className="font-medium text-slate-900">{j.label}</h3>
              <p className="text-sm text-slate-500 mt-1">{j.desc}</p>
              <button type="button" className="btn-secondary btn-sm mt-3" onClick={() => runJob(j.path, j.label)}>
                <Play size={14} aria-hidden="true" /> Run now
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
