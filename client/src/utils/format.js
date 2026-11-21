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

/**
 * Sentiment colours come from the brand palette: ocean navy = positive,
 * sand = neutral, burnt sunset = negative (the thing that needs attention).
 * Keep in sync with the tokens in index.css.
 */
export const SENTIMENT_STYLES = {
  positive: { label: 'Positive', color: '#263f70', badge: 'bg-navy-50 text-navy-700 ring-navy-200' },
  neutral: { label: 'Neutral', color: '#c4b59d', badge: 'bg-slate-100 text-slate-700 ring-slate-300' },
  negative: { label: 'Negative', color: '#e0782f', badge: 'bg-brand-50 text-brand-700 ring-brand-200' },
};

/** Chart tokens (Recharts takes plain values, not classes). */
export const CHART = {
  grid: '#e8dfd0',
  axis: '#6e6862',
  cursor: '#fff5e5',
  navy: '#263f70',
  sunset: '#f5bd76',
  amber: '#e99a42',
  font: "'DM Sans', ui-sans-serif, system-ui, sans-serif",
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
  near_duplicate: 'Near-identical to another review (only case / punctuation differ)',
  possible_duplicate: 'Very similar to another review',
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
