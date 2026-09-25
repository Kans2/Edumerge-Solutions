import { useState } from 'react';
import { FileEdit, Check, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { useGetCorrectionsQuery, useReviewCorrectionMutation } from '../api/endpoints';
import { Spinner, ErrorState, EmptyState, Modal, StatusBadge } from '../components/Common';
import { fmtDate, fmtDateTime } from '../utils/format';
import { useAuth } from '../hooks/useAuth';

const STATUS_CLS = {
  PENDING: 'bg-amber-50 text-amber-800',
  APPROVED: 'bg-emerald-50 text-emerald-800',
  REJECTED: 'bg-red-50 text-red-800',
  WITHDRAWN: 'bg-slate-100 text-slate-600',
};

export default function Corrections() {
  const { can } = useAuth();
  const [status, setStatus] = useState('PENDING');
  const [review, setReview] = useState(null);      // { request, decision }
  const [note, setNote] = useState('');

  const { data, isLoading, error } = useGetCorrectionsQuery({ status, limit: 50 });
  const [reviewCorrection, { isLoading: reviewing }] = useReviewCorrectionMutation();

  const submit = async () => {
    try {
      await reviewCorrection({ id: review.request._id, decision: review.decision, note }).unwrap();
      toast.success(`Request ${review.decision === 'APPROVE' ? 'approved and applied' : 'rejected'}`);
      setReview(null);
      setNote('');
    } catch (err) {
      toast.error(err?.data?.error?.message || 'Could not complete the review');
    }
  };

  if (isLoading) return <Spinner label="Loading correction requests" />;
  if (error) return <ErrorState error={error} />;

  const items = data?.items || [];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Attendance corrections</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Locked sessions can only be changed through an approved correction.
        </p>
      </div>

      <div className="flex gap-1 border-b border-slate-200" role="tablist" aria-label="Filter by status">
        {['PENDING', 'APPROVED', 'REJECTED', ''].map((s) => (
          <button
            key={s || 'all'}
            type="button"
            role="tab"
            aria-selected={status === s}
            onClick={() => setStatus(s)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
              status === s ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {s ? s.charAt(0) + s.slice(1).toLowerCase() : 'All'}
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={FileEdit}
          title="No correction requests"
          message={status === 'PENDING' ? 'Nothing is waiting for your review.' : 'Nothing matches this filter.'}
        />
      ) : (
        <div className="space-y-3">
          {items.map((r) => (
            <article key={r._id} className="card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-slate-500">{r.requestNo}</span>
                    <span className={`badge ${STATUS_CLS[r.status]}`}>{r.status}</span>
                  </div>
                  <h2 className="font-medium text-slate-900 mt-1">
                    {r.subjectName} <span className="font-mono text-xs text-slate-500">{r.subjectCode}</span>
                  </h2>
                  <p className="text-sm text-slate-500">
                    {r.sectionCode} · {fmtDate(r.date)} · raised by {r.raisedByName} ({r.raisedByRole?.replace(/_/g, ' ').toLowerCase()})
                  </p>
                </div>

                {r.status === 'PENDING' && can('correction:approve') && (
                  <div className="flex gap-2">
                    <button type="button" className="btn-secondary btn-sm"
                      onClick={() => setReview({ request: r, decision: 'REJECT' })}>
                      <X size={14} aria-hidden="true" /> Reject
                    </button>
                    <button type="button" className="btn-primary btn-sm"
                      onClick={() => setReview({ request: r, decision: 'APPROVE' })}>
                      <Check size={14} aria-hidden="true" /> Approve
                    </button>
                  </div>
                )}
              </div>

              <p className="text-sm text-slate-700 mt-3 bg-slate-50 rounded-lg p-3">{r.reason}</p>

              <table className="w-full mt-3">
                <caption className="sr-only">Requested changes</caption>
                <thead>
                  <tr>
                    <th scope="col" className="th">Student</th>
                    <th scope="col" className="th">Currently</th>
                    <th scope="col" className="th">Change to</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {r.changes.map((c) => (
                    <tr key={c.studentId}>
                      <td className="td">
                        <span className="font-medium text-slate-800">{c.studentName}</span>
                        <span className="block font-mono text-xs text-slate-500">{c.studentCode}</span>
                      </td>
                      <td className="td"><StatusBadge status={c.fromStatus} /></td>
                      <td className="td"><StatusBadge status={c.toStatus} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {r.reviewedAt && (
                <p className="text-xs text-slate-500 mt-3 border-t border-slate-100 pt-2">
                  Reviewed by {r.reviewedByName} on {fmtDateTime(r.reviewedAt)}
                  {r.reviewNote ? ` — ${r.reviewNote}` : ''}
                </p>
              )}
            </article>
          ))}
        </div>
      )}

      <Modal
        open={Boolean(review)}
        onClose={() => setReview(null)}
        title={review?.decision === 'APPROVE' ? 'Approve this correction' : 'Reject this correction'}
        description={review
          ? `${review.request.requestNo} — ${review.request.changes.length} records will ${review.decision === 'APPROVE' ? 'be updated' : 'stay unchanged'}.`
          : ''}
        footer={(
          <>
            <button type="button" className="btn-secondary" onClick={() => setReview(null)}>Cancel</button>
            <button
              type="button"
              className={review?.decision === 'APPROVE' ? 'btn-primary' : 'btn-danger'}
              onClick={submit}
              disabled={reviewing}
            >
              {reviewing ? 'Working...' : review?.decision === 'APPROVE' ? 'Approve and apply' : 'Reject'}
            </button>
          </>
        )}
      >
        <label htmlFor="review-note" className="label">Note (optional, shared with the requester)</label>
        <textarea id="review-note" rows={3} className="input" value={note} onChange={(e) => setNote(e.target.value)} />
        {review?.decision === 'APPROVE' && (
          <p className="text-xs text-slate-500 mt-2">
            The original status is preserved on each record, and every affected student is notified.
            Attendance percentages recompute immediately.
          </p>
        )}
      </Modal>
    </div>
  );
}
