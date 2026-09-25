import { useState } from 'react';
import { AlertTriangle, Download, ShieldCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  useGetDefaultersQuery, useGetSectionsQuery, useGetDepartmentsQuery, useCondoneMutation,
} from '../api/endpoints';
import { downloadExcel } from '../api/download';
import {
  Spinner, ErrorState, StatTile, PercentBar, RiskBadge, EmptyState, Modal,
} from '../components/Common';
import { useAuth } from '../hooks/useAuth';

export default function Defaulters() {
  const { isManager, can } = useAuth();
  const [filters, setFilters] = useState({ sectionId: '', departmentId: '', scope: 'OVERALL', threshold: '' });
  const [page, setPage] = useState(1);
  const [condoneTarget, setCondoneTarget] = useState(null);
  const [reason, setReason] = useState('');

  const { data, isLoading, error } = useGetDefaultersQuery({
    ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)),
    page, limit: 50,
  });
  const { data: sections = [] } = useGetSectionsQuery({});
  const { data: departments = [] } = useGetDepartmentsQuery(undefined, { skip: !isManager });
  const [condone, { isLoading: condoning }] = useCondoneMutation();

  const submitCondone = async () => {
    try {
      await condone({ summaryId: condoneTarget._id, reason }).unwrap();
      toast.success(`Condonation granted to ${condoneTarget.studentName}`);
      setCondoneTarget(null);
      setReason('');
    } catch (err) {
      toast.error(err?.data?.error?.message || 'Could not grant condonation');
    }
  };

  if (isLoading) return <Spinner label="Finding students below the threshold" />;
  if (error) return <ErrorState error={error} />;

  const items = data?.items || [];
  const summary = data?.summary || {};
  const bands = summary.byBand || {};

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Low attendance</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Students below {summary.threshold ?? 75}% in {summary.termName || 'the current term'}.
          </p>
        </div>
        <button
          type="button"
          className="btn-primary"
          onClick={() => downloadExcel({
            path: '/exports/defaulters',
            query: Object.fromEntries(Object.entries(filters).filter(([, v]) => v)),
          })}
        >
          <Download size={16} aria-hidden="true" /> Export to Excel
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile label="Below threshold" value={summary.total ?? 0} tone={summary.total ? 'danger' : 'good'} icon={AlertTriangle} />
        <StatTile label="Warning band" value={bands.WARNING ?? 0} tone="warn" sub="Within 5 points" />
        <StatTile label="Condonable" value={bands.CONDONABLE ?? 0} tone="warn" sub="Above the floor" />
        <StatTile label="Detained" value={bands.DETAINED ?? 0} tone="danger" sub="Below the floor" />
      </div>

      <div className="card p-3 flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="d-scope" className="label">View</label>
          <select id="d-scope" className="input w-auto" value={filters.scope}
            onChange={(e) => { setFilters({ ...filters, scope: e.target.value }); setPage(1); }}>
            <option value="OVERALL">Overall attendance</option>
            <option value="SUBJECT">Per subject</option>
          </select>
        </div>
        <div>
          <label htmlFor="d-section" className="label">Section</label>
          <select id="d-section" className="input w-auto" value={filters.sectionId}
            onChange={(e) => { setFilters({ ...filters, sectionId: e.target.value }); setPage(1); }}>
            <option value="">All sections</option>
            {sections.map((s) => <option key={s._id} value={s._id}>{s.code}</option>)}
          </select>
        </div>
        {isManager && (
          <div>
            <label htmlFor="d-dept" className="label">Department</label>
            <select id="d-dept" className="input w-auto" value={filters.departmentId}
              onChange={(e) => { setFilters({ ...filters, departmentId: e.target.value }); setPage(1); }}>
              <option value="">All departments</option>
              {departments.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
            </select>
          </div>
        )}
        <div>
          <label htmlFor="d-threshold" className="label">Threshold %</label>
          <input id="d-threshold" type="number" min="0" max="100" className="input w-28"
            placeholder={String(summary.threshold ?? 75)} value={filters.threshold}
            onChange={(e) => { setFilters({ ...filters, threshold: e.target.value }); setPage(1); }} />
        </div>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title="Nobody is below the threshold"
          message="Every student in this scope currently meets the attendance requirement."
        />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <caption className="sr-only">Students below the attendance threshold</caption>
              <thead>
                <tr>
                  <th scope="col" className="th">Roll number</th>
                  <th scope="col" className="th">Student</th>
                  <th scope="col" className="th">Section</th>
                  {filters.scope === 'SUBJECT' && <th scope="col" className="th">Subject</th>}
                  <th scope="col" className="th">Held</th>
                  <th scope="col" className="th">Absent</th>
                  <th scope="col" className="th">Attendance</th>
                  <th scope="col" className="th">Band</th>
                  <th scope="col" className="th">Recovery</th>
                  <th scope="col" className="th">Guardian</th>
                  {can('condonation:grant') && <th scope="col" className="th">Action</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((s) => (
                  <tr key={s._id} className="hover:bg-slate-50">
                    <td className="td font-mono text-xs">{s.rollNumber || s.studentCode}</td>
                    <td className="td font-medium text-slate-900">{s.studentName}</td>
                    <td className="td">{s.sectionCode}</td>
                    {filters.scope === 'SUBJECT' && (
                      <td className="td">
                        <span className="text-slate-800">{s.subjectName}</span>
                        <span className="block font-mono text-xs text-slate-500">{s.subjectCode}</span>
                      </td>
                    )}
                    <td className="td tabular-nums">{s.heldPeriods}</td>
                    <td className="td tabular-nums text-red-600 font-medium">{s.absentPeriods}</td>
                    <td className="td"><PercentBar value={s.percent} threshold={summary.threshold} /></td>
                    <td className="td"><RiskBadge band={s.riskBand} /></td>
                    <td className="td text-sm">
                      {s.periodsToReachThreshold == null
                        ? <span className="text-red-700 font-medium">Not recoverable</span>
                        : <span className="text-slate-600">{s.periodsToReachThreshold} classes</span>}
                    </td>
                    <td className="td text-sm">
                      <span className="text-slate-700">{s.guardianName || '-'}</span>
                      <span className="block text-xs text-slate-500">{s.guardianPhone || ''}</span>
                    </td>
                    {can('condonation:grant') && (
                      <td className="td">
                        {s.condonation?.granted ? (
                          <span className="badge bg-emerald-50 text-emerald-800">
                            <span aria-hidden="true">&#10003;</span> Condoned
                          </span>
                        ) : (
                          <button
                            type="button"
                            className="btn-secondary btn-sm"
                            onClick={() => setCondoneTarget(s)}
                          >
                            Condone
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {data?.meta?.totalPages > 1 && (
            <nav className="flex items-center justify-between px-4 py-3 border-t border-slate-200" aria-label="Pagination">
              <p className="text-sm text-slate-600">
                Page {data.meta.page} of {data.meta.totalPages} · {data.meta.total} students
              </p>
              <div className="flex gap-2">
                <button type="button" className="btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
                <button type="button" className="btn-secondary btn-sm" disabled={page >= data.meta.totalPages} onClick={() => setPage(page + 1)}>Next</button>
              </div>
            </nav>
          )}
        </div>
      )}

      <Modal
        open={Boolean(condoneTarget)}
        onClose={() => setCondoneTarget(null)}
        title="Grant attendance condonation"
        description={condoneTarget
          ? `${condoneTarget.studentName} — currently ${condoneTarget.percent?.toFixed(2)}%`
          : ''}
        footer={(
          <>
            <button type="button" className="btn-secondary" onClick={() => setCondoneTarget(null)}>Cancel</button>
            <button type="button" className="btn-primary" disabled={!reason.trim() || condoning} onClick={submitCondone}>
              {condoning ? 'Granting...' : 'Grant condonation'}
            </button>
          </>
        )}
      >
        <label htmlFor="condone-reason" className="label">Reason (recorded permanently)</label>
        <textarea
          id="condone-reason"
          rows={3}
          className="input"
          placeholder="e.g. Prolonged hospitalisation with documentation on file."
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <p className="text-xs text-slate-500 mt-2">
          Condonation can only be granted above the floor set in the term policy.
          The student is notified automatically.
        </p>
      </Modal>
    </div>
  );
}
