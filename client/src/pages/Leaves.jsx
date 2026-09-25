import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { FileEdit, Plus, Check, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { useGetLeavesQuery, useRaiseLeaveMutation, useReviewLeaveMutation } from '../api/endpoints';
import { Spinner, ErrorState, EmptyState, Modal, FieldError, InfoNote } from '../components/Common';
import { fmtDate, fmtDateTime, todayKey } from '../utils/format';
import { LEAVE_TYPES } from '../utils/constants';
import { useAuth } from '../hooks/useAuth';

const STATUS_CLS = {
  PENDING: 'bg-amber-50 text-amber-800',
  APPROVED: 'bg-emerald-50 text-emerald-800',
  REJECTED: 'bg-red-50 text-red-800',
  CANCELLED: 'bg-slate-100 text-slate-600',
};

export default function Leaves() {
  const { isStudent, can } = useAuth();
  const [status, setStatus] = useState(isStudent ? '' : 'PENDING');
  const [newOpen, setNewOpen] = useState(false);
  const [review, setReview] = useState(null);
  const [note, setNote] = useState('');

  const { data, isLoading, error } = useGetLeavesQuery({ ...(status ? { status } : {}), limit: 50 });
  const [raiseLeave, { isLoading: raising }] = useRaiseLeaveMutation();
  const [reviewLeave, { isLoading: reviewing }] = useReviewLeaveMutation();

  const { register, handleSubmit, reset, formState: { errors } } = useForm({
    defaultValues: { leaveType: 'MEDICAL', fromDate: todayKey(), toDate: todayKey() },
  });

  const submitNew = async (values) => {
    try {
      const leave = await raiseLeave(values).unwrap();
      toast.success(`Request ${leave.requestNo} submitted`);
      setNewOpen(false);
      reset();
    } catch (err) {
      toast.error(err?.data?.error?.message || 'Could not submit the request');
    }
  };

  const submitReview = async () => {
    try {
      const result = await reviewLeave({ id: review.leave._id, decision: review.decision, note }).unwrap();
      toast.success(review.decision === 'APPROVE'
        ? `Approved — ${result.data?.appliedRecordCount ?? 0} attendance records updated`
        : 'Request rejected');
      setReview(null);
      setNote('');
    } catch (err) {
      toast.error(err?.data?.error?.message || 'Could not complete the review');
    }
  };

  if (isLoading) return <Spinner label="Loading leave requests" />;
  if (error) return <ErrorState error={error} />;

  const items = data?.items || [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Leave and on-duty</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Approved requests are removed from the attendance calculation automatically.
          </p>
        </div>
        {isStudent && (
          <button type="button" className="btn-primary" onClick={() => setNewOpen(true)}>
            <Plus size={16} aria-hidden="true" /> New request
          </button>
        )}
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
          title="No leave requests"
          message={isStudent
            ? 'Raise a request when you are unwell or representing the college.'
            : 'Nothing is waiting for your review.'}
        />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <caption className="sr-only">Leave and on-duty requests</caption>
              <thead>
                <tr>
                  <th scope="col" className="th">Request</th>
                  {!isStudent && <th scope="col" className="th">Student</th>}
                  <th scope="col" className="th">Type</th>
                  <th scope="col" className="th">Dates</th>
                  <th scope="col" className="th">Reason</th>
                  <th scope="col" className="th">Status</th>
                  {can('leave:approve') && <th scope="col" className="th">Action</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((l) => (
                  <tr key={l._id} className="hover:bg-slate-50">
                    <td className="td font-mono text-xs">{l.requestNo}</td>
                    {!isStudent && (
                      <td className="td">
                        <span className="font-medium text-slate-800">{l.studentName}</span>
                        <span className="block font-mono text-xs text-slate-500">{l.studentCode}</span>
                      </td>
                    )}
                    <td className="td">{LEAVE_TYPES.find((t) => t.value === l.leaveType)?.label || l.leaveType}</td>
                    <td className="td whitespace-nowrap text-sm">
                      {fmtDate(l.fromDate)}
                      {l.fromDate !== l.toDate && <> &ndash; {fmtDate(l.toDate)}</>}
                    </td>
                    <td className="td text-sm max-w-xs">{l.reason}</td>
                    <td className="td">
                      <span className={`badge ${STATUS_CLS[l.status]}`}>{l.status}</span>
                      {l.status === 'APPROVED' && l.appliedRecordCount > 0 && (
                        <span className="block text-xs text-slate-500 mt-1">
                          {l.appliedRecordCount} records updated
                        </span>
                      )}
                    </td>
                    {can('leave:approve') && (
                      <td className="td">
                        {l.status === 'PENDING' ? (
                          <div className="flex gap-1">
                            <button type="button" className="btn-secondary btn-sm"
                              onClick={() => setReview({ leave: l, decision: 'REJECT' })}>
                              <X size={13} aria-hidden="true" />
                            </button>
                            <button type="button" className="btn-primary btn-sm"
                              onClick={() => setReview({ leave: l, decision: 'APPROVE' })}>
                              <Check size={13} aria-hidden="true" />
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-500">
                            {l.reviewedByName ? `by ${l.reviewedByName}` : '-'}
                          </span>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* New request */}
      <Modal
        open={newOpen}
        onClose={() => setNewOpen(false)}
        title="Request leave or on-duty"
        footer={(
          <>
            <button type="button" className="btn-secondary" onClick={() => setNewOpen(false)}>Cancel</button>
            <button type="submit" form="leave-form" className="btn-primary" disabled={raising}>
              {raising ? 'Submitting...' : 'Submit request'}
            </button>
          </>
        )}
      >
        <form id="leave-form" onSubmit={handleSubmit(submitNew)} className="space-y-4" noValidate>
          <div>
            <label htmlFor="leaveType" className="label">Type</label>
            <select id="leaveType" className="input" {...register('leaveType')}>
              {LEAVE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="fromDate" className="label">From</label>
              <input id="fromDate" type="date" className="input"
                aria-invalid={Boolean(errors.fromDate)}
                {...register('fromDate', { required: 'Start date is required' })} />
              <FieldError error={errors.fromDate} id="fromDate-error" />
            </div>
            <div>
              <label htmlFor="toDate" className="label">To</label>
              <input id="toDate" type="date" className="input"
                aria-invalid={Boolean(errors.toDate)}
                {...register('toDate', { required: 'End date is required' })} />
              <FieldError error={errors.toDate} id="toDate-error" />
            </div>
          </div>

          <div>
            <label htmlFor="reason" className="label">Reason</label>
            <textarea id="reason" rows={3} className="input"
              placeholder="Explain why you were or will be away."
              aria-invalid={Boolean(errors.reason)}
              aria-describedby={errors.reason ? 'reason-error' : undefined}
              {...register('reason', {
                required: 'Please give a reason',
                minLength: { value: 10, message: 'Please add a little more detail' },
              })} />
            <FieldError error={errors.reason} id="reason-error" />
          </div>

          <InfoNote tone="blue">
            Once approved, any absence already recorded in these dates is converted automatically,
            and your percentage is recalculated.
          </InfoNote>
        </form>
      </Modal>

      {/* Review */}
      <Modal
        open={Boolean(review)}
        onClose={() => setReview(null)}
        title={review?.decision === 'APPROVE' ? 'Approve this request' : 'Reject this request'}
        description={review ? `${review.leave.studentName} — ${review.leave.leaveType.replace('_', ' ').toLowerCase()}` : ''}
        footer={(
          <>
            <button type="button" className="btn-secondary" onClick={() => setReview(null)}>Cancel</button>
            <button
              type="button"
              className={review?.decision === 'APPROVE' ? 'btn-primary' : 'btn-danger'}
              onClick={submitReview}
              disabled={reviewing}
            >
              {reviewing ? 'Working...' : review?.decision === 'APPROVE' ? 'Approve' : 'Reject'}
            </button>
          </>
        )}
      >
        {review && (
          <>
            <p className="text-sm text-slate-700 bg-slate-50 rounded-lg p-3">{review.leave.reason}</p>
            <p className="text-sm text-slate-500 mt-2">
              {fmtDate(review.leave.fromDate)} to {fmtDate(review.leave.toDate)}
            </p>
          </>
        )}
        <label htmlFor="leave-note" className="label mt-3">Note (optional)</label>
        <textarea id="leave-note" rows={2} className="input" value={note} onChange={(e) => setNote(e.target.value)} />
        {review?.decision === 'APPROVE' && (
          <p className="text-xs text-slate-500 mt-2">
            Every absence already recorded in this date range will be converted and percentages recomputed.
          </p>
        )}
      </Modal>
    </div>
  );
}
