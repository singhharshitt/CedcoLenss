import { AlertTriangle, Loader2, RotateCw } from 'lucide-react';
import { SENTIMENT_STYLES, STATUS_LABELS, TOPIC_LABELS } from '../utils/format.js';
import { WaveDivider, WaveMark } from './waves.jsx';

/** Small presentational building blocks shared by all pages. */

const CARD_TONES = {
  default: 'border-slate-200 bg-white text-slate-800',
  cream: 'border-brand-100 bg-cream text-slate-800',
  navy: 'on-navy border-navy-800 bg-navy-900 text-cream',
};

/**
 * Card. `tone="navy"` gives a deep navy panel with cream type (used for the
 * moments that matter); `decoration` renders behind the content (e.g. <WaveLines/>).
 */
export function Card({ title, description, action, children, className = '', tone = 'default', decoration = null }) {
  const navy = tone === 'navy';
  return (
    <section className={`relative overflow-hidden rounded-2xl border shadow-sm ${CARD_TONES[tone]} ${className}`}>
      {decoration}
      {(title || action) && (
        <header
          className={`relative flex flex-wrap items-start justify-between gap-3 border-b px-5 py-4 sm:px-6 ${
            navy ? 'border-white/10' : 'border-slate-200/70'
          }`}
        >
          <div className="min-w-0">
            {title && (
              <h2 className={`font-display text-lg font-semibold uppercase leading-tight tracking-wide ${navy ? 'text-cream' : 'text-slate-900'}`}>
                {title}
              </h2>
            )}
            {description && <p className={`mt-1 text-sm ${navy ? 'text-navy-200' : 'text-slate-500'}`}>{description}</p>}
          </div>
          {action}
        </header>
      )}
      <div className="relative p-5 sm:p-6">{children}</div>
    </section>
  );
}

const BUTTON_VARIANTS = {
  primary: 'bg-brand-300 text-navy-900 shadow-sm hover:bg-brand-400 active:bg-brand-500',
  secondary: 'bg-white text-slate-800 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 hover:ring-navy-300',
  navy: 'bg-navy-900 text-cream shadow-sm hover:bg-navy-800',
  ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
  danger: 'bg-rose-600 text-white hover:bg-rose-700',
};

export function Button({ variant = 'primary', size = 'md', loading = false, icon: Icon, children, className = '', ...props }) {
  const sizes = size === 'sm' ? 'h-8 px-3 text-xs' : 'h-10 px-4 text-sm';
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-[background-color,color,box-shadow,transform] duration-150 ease-[var(--ease-brand)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-55 disabled:active:scale-100 ${sizes} ${BUTTON_VARIANTS[variant]} ${className}`}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : Icon && <Icon className="size-4" strokeWidth={1.75} aria-hidden />}
      {children}
    </button>
  );
}

export function SentimentBadge({ sentiment }) {
  if (!sentiment) return <span className="text-xs text-slate-400">—</span>;
  const style = SENTIMENT_STYLES[sentiment];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${style.badge}`}>
      <span className="size-1.5 rounded-full" style={{ backgroundColor: style.color }} aria-hidden />
      {style.label}
    </span>
  );
}

export function TopicChip({ topic }) {
  return (
    <span className="inline-flex rounded-md bg-navy-50 px-1.5 py-0.5 text-xs font-medium text-navy-700 ring-1 ring-inset ring-navy-100">
      {TOPIC_LABELS[topic] ?? topic}
    </span>
  );
}

const STATUS_STYLES = {
  completed: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  analysed: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  completed_with_errors: 'bg-amber-50 text-amber-800 ring-amber-200',
  processing: 'bg-brand-50 text-brand-700 ring-brand-200',
  queued: 'bg-slate-100 text-slate-600 ring-slate-200',
  pending: 'bg-slate-100 text-slate-600 ring-slate-200',
  skipped: 'bg-slate-100 text-slate-600 ring-slate-200',
  failed: 'bg-rose-50 text-rose-700 ring-rose-200',
  analysis_failed: 'bg-rose-50 text-rose-700 ring-rose-200',
};

export function StatusBadge({ status }) {
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${STATUS_STYLES[status] ?? ''}`}
    >
      {status === 'processing' && <Loader2 className="size-3 animate-spin" aria-hidden />}
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

export function RatingStars({ rating, raw }) {
  if (rating == null) {
    return (
      <span className="text-xs font-medium text-amber-700" title={raw ? `Invalid rating "${raw}"` : 'No rating given'}>
        {raw ? `Invalid ("${raw}")` : 'Missing'}
      </span>
    );
  }
  return (
    <span className="whitespace-nowrap text-sm tracking-tight" aria-label={`${rating} out of 5 stars`}>
      <span className="text-brand-500">{'★'.repeat(rating)}</span>
      <span className="text-slate-300">{'★'.repeat(5 - rating)}</span>
    </span>
  );
}

/** Skeleton block: a quiet sand shimmer-free placeholder. */
export function Skeleton({ className = '' }) {
  return <div aria-hidden className={`rounded-lg bg-slate-200/70 ${className}`} />;
}

/** Page-level loading: skeleton cards that match the layout, plus a readable label. */
export function LoadingState({ label = 'Loading…' }) {
  return (
    <div role="status" className="animate-fade space-y-4 py-6">
      <p className="flex items-center gap-2 text-sm font-medium text-slate-600">
        <Loader2 className="size-4 animate-spin text-brand-500" aria-hidden />
        {label}
      </p>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-48" />
    </div>
  );
}

/** Empty state with the small sun-over-waves mark. */
export function EmptyState({ title, description, action }) {
  return (
    <div className="flex flex-col items-center px-4 py-10 text-center">
      <WaveMark className="mb-3" />
      <p className="font-display text-lg font-semibold uppercase tracking-wide text-slate-900">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Short headline for an ApiError, by HTTP status (0 = network/CORS/timeout). */
export function errorTitle(error) {
  const status = error?.status ?? 0;
  if (error?.code === 'TIMEOUT') return 'The server is taking too long';
  if (error?.code === 'WRONG_HOST') return 'Not connected to the API';
  if (status === 0) return 'Cannot reach the server';
  if (status === 404) return 'Not found';
  if (status === 400 || status === 422) return 'Invalid request';
  if (status === 401 || status === 403) return 'Access denied';
  if (status === 429) return 'Too many requests';
  if (status === 502 || status === 503 || status === 504) return 'Backend unavailable';
  if (status >= 500) return 'Server error';
  return 'Something went wrong';
}

export function ErrorState({ error, onRetry }) {
  return (
    <div role="alert" className="mx-auto flex max-w-md flex-col items-center rounded-2xl border border-rose-200 bg-rose-50 px-6 py-8 text-center">
      <AlertTriangle className="mb-2 size-6 text-rose-600" strokeWidth={1.75} aria-hidden />
      <p className="font-display text-lg font-semibold uppercase tracking-wide text-rose-800">{errorTitle(error)}</p>
      <p className="mt-1 text-sm text-rose-700">{error?.message ?? 'Unknown error'}</p>
      {error?.status ? <p className="mt-2 font-mono text-xs text-rose-600">HTTP {error.status}</p> : null}
      {onRetry && (
        <Button variant="secondary" size="sm" icon={RotateCw} className="mt-4" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

/** A horizontal bar split by sentiment counts. */
export function SentimentBar({ sentiment }) {
  const total = sentiment.reduce((sum, s) => sum + s.count, 0);
  if (total === 0) return <div className="h-2 rounded-full bg-slate-100" />;
  return (
    <div className="flex h-2 gap-0.5 overflow-hidden rounded-full bg-slate-100" aria-hidden>
      {sentiment.map((s) => (
        <div key={s.sentiment} style={{ width: `${(s.count / total) * 100}%`, backgroundColor: SENTIMENT_STYLES[s.sentiment].color }} />
      ))}
    </div>
  );
}

/**
 * Page title block: editorial eyebrow, tall condensed title, short description,
 * optional actions on the right, and the wave divider underneath.
 */
export function PageHeader({ eyebrow, title, description, action }) {
  return (
    <header>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          {eyebrow && <p className="eyebrow text-brand-700">{eyebrow}</p>}
          <h1 className="display mt-1 text-4xl uppercase text-navy-900 sm:text-5xl">{title}</h1>
          {description && <p className="mt-2 max-w-2xl text-base text-slate-600">{description}</p>}
        </div>
        {action}
      </div>
      <WaveDivider className="mt-4" />
    </header>
  );
}
