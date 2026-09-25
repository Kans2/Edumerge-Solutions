import { Loader2, InboxIcon, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { percentTone } from '../utils/format';
import { STATUS_META, RISK_META, SESSION_STATUS_META } from '../utils/constants';

export function Spinner({ label = 'Loading' }) {
  return (
    <div className="flex items-center justify-center py-12 text-slate-500" role="status" aria-live="polite">
      <Loader2 className="animate-spin mr-2" size={20} aria-hidden="true" />
      <span>{label}...</span>
    </div>
  );
}

export function EmptyState({ title, message, action, icon: Icon = InboxIcon }) {
  return (
    <div className="card p-10 text-center">
      <Icon className="mx-auto text-slate-300" size={40} aria-hidden="true" />
      <h2 className="mt-3 font-semibold text-slate-800">{title}</h2>
      {message && <p className="mt-1 text-sm text-slate-500 max-w-md mx-auto">{message}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ error }) {
  const message = error?.data?.error?.message || error?.error || 'Something went wrong. Please try again.';
  const details = error?.data?.error?.details;
  return (
    <div className="card p-5 border-red-200 bg-red-50" role="alert">
      <div className="flex gap-3">
        <AlertTriangle className="text-red-600 shrink-0" size={20} aria-hidden="true" />
        <div>
          <p className="font-medium text-red-800">We could not complete that</p>
          <p className="text-sm text-red-700 mt-1">{message}</p>
          {Array.isArray(details) && details.length > 0 && (
            <ul className="mt-2 text-sm text-red-700 list-disc list-inside">
              {details.map((d, i) => <li key={i}>{d.field}: {d.message}</li>)}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

export function StatTile({ label, value, sub, tone = 'default', icon: Icon }) {
  const tones = {
    default: 'text-slate-900', danger: 'text-red-600',
    warn: 'text-amber-600', good: 'text-emerald-600', brand: 'text-brand-600',
  };
  return (
    <div className="card p-4">
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
        {Icon && <Icon size={16} className="text-slate-300" aria-hidden="true" />}
      </div>
      <p className={`text-2xl font-semibold mt-1 ${tones[tone]}`}>{value ?? '-'}</p>
      {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
    </div>
  );
}

export function Modal({ open, onClose, title, description, children, footer, wide = false }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" aria-label="Close dialog" className="absolute inset-0 bg-slate-900/30" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative card w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} p-5 max-h-[90vh] overflow-y-auto`}
      >
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        {description && <p className="text-sm text-slate-500 mt-1">{description}</p>}
        <div className="mt-4">{children}</div>
        {footer && <div className="mt-5 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}

export function FieldError({ error, id }) {
  if (!error) return null;
  return <p id={id} className="error-text" role="alert">{error.message}</p>;
}

/* ---------------- Badges: always icon + text ---------------- */

export function StatusBadge({ status }) {
  const m = STATUS_META[status] || { label: status, icon: '', cls: 'bg-slate-100 text-slate-700' };
  return (
    <span className={`badge border ${m.cls}`}>
      <span aria-hidden="true">{m.icon}</span>{m.label}
    </span>
  );
}

export function SessionStatusBadge({ status }) {
  const m = SESSION_STATUS_META[status] || { label: status, icon: '', cls: 'bg-slate-100 text-slate-700' };
  return <span className={`badge ${m.cls}`}><span aria-hidden="true">{m.icon}</span>{m.label}</span>;
}

export function RiskBadge({ band }) {
  const m = RISK_META[band] || RISK_META.SAFE;
  return <span className={`badge border ${m.cls}`}><span aria-hidden="true">{m.icon}</span>{m.label}</span>;
}

export function PercentBar({ value, threshold = 75, showLabel = true }) {
  const v = Math.max(0, Math.min(value ?? 0, 100));
  const bar = v >= threshold ? 'bg-emerald-500' : v >= threshold - 5 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2 min-w-[140px]">
      <div
        role="progressbar"
        aria-valuenow={Math.round(v)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Attendance ${v.toFixed(1)} percent against a threshold of ${threshold} percent`}
        className="relative h-2 flex-1 rounded-full bg-slate-100 overflow-hidden"
      >
        <div className={`h-full ${bar} transition-all`} style={{ width: `${v}%` }} />
        <span
          className="absolute top-0 bottom-0 w-px bg-slate-400"
          style={{ left: `${threshold}%` }}
          aria-hidden="true"
          title={`Required: ${threshold}%`}
        />
      </div>
      {showLabel && (
        <span className={`text-sm font-semibold tabular-nums ${percentTone(value, threshold)}`}>
          {value == null ? '-' : `${value.toFixed(1)}%`}
        </span>
      )}
    </div>
  );
}

export function SuccessNote({ children }) {
  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 flex gap-2" role="status">
      <CheckCircle2 size={18} className="text-emerald-600 shrink-0" aria-hidden="true" />
      <p className="text-sm text-emerald-800">{children}</p>
    </div>
  );
}

export function InfoNote({ children, tone = 'slate' }) {
  const map = {
    slate: 'border-slate-200 bg-slate-50 text-slate-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-800',
    blue: 'border-brand-200 bg-brand-50 text-brand-800',
  };
  return <div className={`rounded-lg border p-3 text-sm ${map[tone]}`} role="note">{children}</div>;
}
