import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CalendarDays, Download, Unlock } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  useGetSessionsQuery, useGetSectionsQuery, useUnlockSessionMutation,
} from '../api/endpoints';
import { downloadExcel } from '../api/download';
import {
  Spinner, ErrorState, EmptyState, SessionStatusBadge, Modal,
} from '../components/Common';
import { fmtDate, todayKey } from '../utils/format';
import { useAuth } from '../hooks/useAuth';

export default function Sessions() {
  const [params] = useSearchParams();
  const { can } = useAuth();
  const [filters, setFilters] = useState({
    from: new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10),
    to: todayKey(),
    status: params.get('status') || '',
    sectionId: '',
  });
  const [page, setPage] = useState(1);
  const [unlockTarget, setUnlockTarget] = useState(null);
  const [reason, setReason] = useState('');

  const { data, isLoading, error } = useGetSessionsQuery({
    ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)), page, limit: 50,
  });
  const { data: sections = [] } = useGetSectionsQuery({});
  const [unlockSession, { isLoading: unlocking }] = useUnlockSessionMutation();

  const submitUnlock = async () => {
    try {
      await unlockSession({ id: unlockTarget._id, reason }).unwrap();
      toast.success('Session unlocked — the edit window has restarted');
      setUnlockTarget(null);
      setReason('');
    } catch (err) {
      toast.error(err?.data?.error?.message || 'Could not unlock the session');
    }
  };

  if (isLoading) return <Spinner label="Loading classes" />;
  if (error) return <ErrorState error={error} />;

  const items = data?.items || [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Classes</h1>
          <p className="text-sm text-slate-500 mt-0.5">{data?.meta?.total ?? 0} classes in this range.</p>
        </div>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => downloadExcel({
            path: '/exports/daily',
            query: { date: filters.to, sectionId: filters.sectionId || undefined },
          })}
        >
          <Download size={16} aria-hidden="true" /> Export {fmtDate(filters.to)}
        </button>
      </div>

      <div className="card p-3 flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="s-from" className="label">From</label>
          <input id="s-from" type="date" className="input w-auto" value={filters.from}
            onChange={(e) => { setFilters({ ...filters, from: e.target.value }); setPage(1); }} />
        </div>
        <div>
          <label htmlFor="s-to" className="label">To</label>
          <input id="s-to" type="date" className="input w-auto" value={filters.to}
            onChange={(e) => { setFilters({ ...filters, to: e.target.value }); setPage(1); }} />
        </div>
        <div>
          <label htmlFor="s-status" className="label">Status</label>
          <select id="s-status" className="input w-auto" value={filters.status}
            onChange={(e) => { setFilters({ ...filters, status: e.target.value }); setPage(1); }}>
            <option value="">Any status</option>
            <option value="SCHEDULED">Not marked</option>
            <option value="MARKED">Marked</option>
            <option value="LOCKED">Locked</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </div>
        <div>
          <label htmlFor="s-section" className="label">Section</label>
          <select id="s-section" className="input w-auto" value={filters.sectionId}
            onChange={(e) => { setFilters({ ...filters, sectionId: e.target.value }); setPage(1); }}>
            <option value="">All sections</option>
            {sections.map((s) => <option key={s._id} value={s._id}>{s.code}</option>)}
          </select>
        </div>
      </div>

      {items.length === 0 ? (
        <EmptyState icon={CalendarDays} title="No classes found" message="Try widening the date range." />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <caption className="sr-only">Class sessions</caption>
              <thead>
                <tr>
                  <th scope="col" className="th">Date</th>
                  <th scope="col" className="th">Subject</th>
                  <th scope="col" className="th">Section</th>
                  <th scope="col" className="th">Period</th>
                  <th scope="col" className="th">Faculty</th>
                  <th scope="col" className="th">Status</th>
                  <th scope="col" className="th">Attendance</th>
                  <th scope="col" className="th">Open</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((s) => (
                  <tr key={s._id} className="hover:bg-slate-50">
                    <td className="td whitespace-nowrap">
                      {fmtDate(s.date)}
                      <span className="block text-xs text-slate-500">{s.dayName}</span>
                    </td>
                    <td className="td">
                      <span className="font-medium text-slate-800">{s.subjectName}</span>
                      <span className="block font-mono text-xs text-slate-500">{s.subjectCode}</span>
                    </td>
                    <td className="td">{s.sectionCode}</td>
                    <td className="td text-center">{s.periodNumber || '-'}</td>
                    <td className="td text-sm">{s.facultyName}</td>
                    <td className="td"><SessionStatusBadge status={s.status} /></td>
                    <td className="td text-sm">
                      {s.status === 'SCHEDULED' || s.status === 'CANCELLED' ? (
                        <span className="text-slate-400">-</span>
                      ) : (
                        <>
                          <span className="font-medium">{s.stats?.present ?? 0}/{s.stats?.total ?? 0}</span>
                          <span className="block text-xs text-slate-500">
                            {(s.stats?.percent ?? 0).toFixed(1)}%
                          </span>
                        </>
                      )}
                    </td>
                    <td className="td">
                      <div className="flex gap-1">
                        <Link to={`/mark/${s._id}`} className="btn-secondary btn-sm">
                          {s.status === 'SCHEDULED' ? 'Mark' : 'View'}
                        </Link>
                        {s.status === 'LOCKED' && can('attendance:unlock') && (
                          <button type="button" className="btn-ghost btn-sm"
                            aria-label={`Unlock ${s.subjectCode} on ${s.date}`}
                            onClick={() => setUnlockTarget(s)}>
                            <Unlock size={14} aria-hidden="true" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {data?.meta?.totalPages > 1 && (
            <nav className="flex items-center justify-between px-4 py-3 border-t border-slate-200" aria-label="Pagination">
              <p className="text-sm text-slate-600">Page {data.meta.page} of {data.meta.totalPages}</p>
              <div className="flex gap-2">
                <button type="button" className="btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
                <button type="button" className="btn-secondary btn-sm" disabled={page >= data.meta.totalPages} onClick={() => setPage(page + 1)}>Next</button>
              </div>
            </nav>
          )}
        </div>
      )}

      <Modal
        open={Boolean(unlockTarget)}
        onClose={() => setUnlockTarget(null)}
        title="Unlock this session"
        description={unlockTarget ? `${unlockTarget.subjectName} · ${fmtDate(unlockTarget.date)}` : ''}
        footer={(
          <>
            <button type="button" className="btn-secondary" onClick={() => setUnlockTarget(null)}>Cancel</button>
            <button type="button" className="btn-primary" disabled={!reason.trim() || unlocking} onClick={submitUnlock}>
              {unlocking ? 'Unlocking...' : 'Unlock'}
            </button>
          </>
        )}
      >
        <label htmlFor="unlock-reason" className="label">Reason (recorded in the audit trail)</label>
        <textarea id="unlock-reason" rows={3} className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
        <p className="text-xs text-slate-500 mt-2">
          Unlocking restarts the edit window so the faculty member can correct the roster directly.
        </p>
      </Modal>
    </div>
  );
}
