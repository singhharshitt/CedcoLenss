import { AlertTriangle, Inbox, Loader2, RotateCw } from 'lucide-react';
import { SENTIMENT_STYLES, STATUS_LABELS, TOPIC_LABELS } from '../utils/format.js';

/** Small presentational building blocks shared by all pages. */

export function Card({ title, description, action, children, className = '' }) {
  return (
    <section className={`rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}>
      {(title || action) && (
        <header className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0">
            {title && <h2 className="text-sm font-semibold text-slate-900">{title}</h2>}
            {description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}
          </div>
          {action}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

const BUTTON_VARIANTS = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 shadow-sm',
  secondary: 'bg-white text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50',
  ghost: 'text-slate-600 hover:bg-slate-100',
  danger: 'bg-rose-600 text-white hover:bg-rose-700',
};

export function Button({ variant = 'primary', size = 'md', loading = false, icon: Icon, children, className = '', ...props }) {
  const sizes = size === 'sm' ? 'px-2.5 py-1.5 text-xs' : 'px-3.5 py-2 text-sm';
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${sizes} ${BUTTON_VARIANTS[variant]} ${className}`}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : Icon && <Icon className="size-4" aria-hidden />}
      {children}
    </button>
  );
}

export function SentimentBadge({ sentiment }) {
  if (!sentiment) return <span className="text-xs text-slate-400">—</span>;
  const style = SENTIMENT_STYLES[sentiment];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${style.badge}`}>
      <span className="size-1.5 rounded-full" style={{ backgroundColor: style.color }} aria-hidden />
      {style.label}
    </span>
  );
}

export function TopicChip({ topic }) {
  return (
    <span className="inline-flex rounded-md bg-brand-50 px-1.5 py-0.5 text-xs font-medium text-brand-700">
      {TOPIC_LABELS[topic] ?? topic}
    </span>
  );
}

const STATUS_STYLES = {
  completed: 'bg-emerald-50 text-emerald-700',
  analysed: 'bg-emerald-50 text-emerald-700',
  completed_with_errors: 'bg-amber-50 text-amber-700',
  processing: 'bg-brand-50 text-brand-700',
  queued: 'bg-slate-100 text-slate-600',
  pending: 'bg-slate-100 text-slate-600',
  skipped: 'bg-slate-100 text-slate-600',
  failed: 'bg-rose-50 text-rose-700',
  analysis_failed: 'bg-rose-50 text-rose-700',
};

export function StatusBadge({ status }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[status] ?? ''}`}>
      {status === 'processing' && <Loader2 className="size-3 animate-spin" aria-hidden />}
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

export function RatingStars({ rating, raw }) {
  if (rating == null) {
    return (
      <span className="text-xs text-amber-700" title={raw ? `Invalid rating "${raw}"` : 'No rating given'}>
        {raw ? `Invalid ("${raw}")` : 'Missing'}
      </span>
    );
  }
  return (
    <span className="whitespace-nowrap text-sm" aria-label={`${rating} out of 5 stars`}>
      <span className="text-amber-400">{'★'.repeat(rating)}</span>
      <span className="text-slate-200">{'★'.repeat(5 - rating)}</span>
    </span>
  );
}

export function LoadingState({ label = 'Loading…' }) {
  return (
    <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500" role="status">
      <Loader2 className="size-5 animate-spin text-brand-500" aria-hidden />
      {label}
    </div>
  );
}

export function EmptyState({ icon: Icon = Inbox, title, description, action }) {
  return (
    <div className="flex flex-col items-center px-4 py-12 text-center">
      <div className="mb-3 rounded-full bg-slate-100 p-3">
        <Icon className="size-6 text-slate-400" aria-hidden />
      </div>
      <p className="text-sm font-medium text-slate-900">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }) {
  return (
    <div role="alert" className="flex flex-col items-center px-4 py-10 text-center">
      <AlertTriangle className="mb-2 size-6 text-rose-500" aria-hidden />
      <p className="text-sm font-medium text-slate-900">Something went wrong</p>
      <p className="mt-1 max-w-md text-sm text-slate-500">{error?.message ?? 'Unknown error'}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" icon={RotateCw} className="mt-4" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

/** A coloured horizontal bar split by sentiment counts. */
export function SentimentBar({ sentiment }) {
  const total = sentiment.reduce((sum, s) => sum + s.count, 0);
  if (total === 0) return <div className="h-2 rounded-full bg-slate-100" />;
  return (
    <div className="flex h-2 overflow-hidden rounded-full bg-slate-100" aria-hidden>
      {sentiment.map((s) => (
        <div key={s.sentiment} style={{ width: `${(s.count / total) * 100}%`, backgroundColor: SENTIMENT_STYLES[s.sentiment].color }} />
      ))}
    </div>
  );
}
