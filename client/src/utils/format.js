export const TOPIC_LABELS = {
  quality: 'Quality',
  delivery: 'Delivery',
  price: 'Price',
  packaging: 'Packaging',
  support: 'Support',
  size_fit: 'Size & fit',
  other: 'Other',
};
export const TOPICS = Object.keys(TOPIC_LABELS);
export const SENTIMENTS = ['positive', 'neutral', 'negative'];

export const SENTIMENT_STYLES = {
  positive: { label: 'Positive', color: '#10b981', badge: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20' },
  neutral: { label: 'Neutral', color: '#94a3b8', badge: 'bg-slate-100 text-slate-700 ring-slate-500/20' },
  negative: { label: 'Negative', color: '#f43f5e', badge: 'bg-rose-50 text-rose-700 ring-rose-600/20' },
};

export const STATUS_LABELS = {
  queued: 'Queued',
  processing: 'Processing',
  completed: 'Completed',
  completed_with_errors: 'Completed with errors',
  failed: 'Failed',
  pending: 'Pending',
  analysed: 'Analysed',
  analysis_failed: 'Analysis failed',
  skipped: 'Skipped',
};

export const ISSUE_LABELS = {
  empty_review: 'Empty review text',
  missing_rating: 'Missing rating',
  invalid_rating: 'Invalid rating',
  missing_date: 'Missing date',
  invalid_date: 'Invalid date',
  missing_review_id: 'Missing review ID',
  missing_product: 'Missing product',
  duplicate_review_id: 'Repeated review ID',
  malformed_row: 'Malformed row',
};

export const isActiveStatus = (status) => status === 'queued' || status === 'processing';

export function formatPercent(value) {
  if (value == null) return '—';
  return `${Number.isInteger(value) ? value : value.toFixed(1)}%`;
}

export function formatDuration(ms) {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms} ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)} s`;
  return `${Math.floor(seconds / 60)} min ${Math.round(seconds % 60)} s`;
}

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}
