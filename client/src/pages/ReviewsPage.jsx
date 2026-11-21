import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { AlertTriangle, ChevronLeft, ChevronRight, Copy, Eye, FilterX, MessageCircleReply, Search, SearchX } from 'lucide-react';
import { useDatasetContext } from '../context/DatasetContext.jsx';
import { useReviews } from '../hooks/queries.js';
import { ISSUE_LABELS, SENTIMENTS, SENTIMENT_STYLES, STATUS_LABELS, TOPICS, TOPIC_LABELS } from '../utils/format.js';
import { ReviewDrawer } from '../components/ReviewDrawer.jsx';
import { Welcome } from './OverviewPage.jsx';
import { Button, Card, EmptyState, ErrorState, LoadingState, RatingStars, SentimentBadge, StatusBadge, TopicChip, PageHeader } from '../components/ui.jsx';

const FILTER_KEYS = ['search', 'product', 'sentiment', 'topic', 'status', 'needsReply', 'mismatch'];

function Select({ id, label, value, onChange, options }) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-slate-600">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-full rounded-lg border border-slate-300 bg-white pl-3 pr-8 text-sm text-slate-800 transition-colors hover:border-navy-300 focus:border-navy-600"
      >
        <option value="">All</option>
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Small indicators for duplicates, rating mismatches and data-quality issues. */
function Flags({ review }) {
  const flags = [];
  if (review.isDuplicate) flags.push({ icon: Copy, text: `Duplicate of ${review.duplicateOf}`, tone: 'text-slate-500' });
  if (review.ratingMismatch) flags.push({ icon: AlertTriangle, text: 'Rating mismatch', tone: 'text-amber-600' });
  for (const issue of review.dataIssues) {
    if (issue !== 'empty_review') flags.push({ icon: AlertTriangle, text: ISSUE_LABELS[issue] ?? issue, tone: 'text-slate-400' });
  }
  if (flags.length === 0) return <span className="text-xs text-slate-300">—</span>;
  return (
    <ul className="space-y-0.5">
      {flags.map((f) => (
        <li key={f.text} className={`flex items-center gap-1 whitespace-nowrap text-xs ${f.tone}`}>
          <f.icon className="size-3" aria-hidden /> {f.text}
        </li>
      ))}
    </ul>
  );
}

export function ReviewsPage() {
  const { selectedId, isProcessing, datasets, datasetsLoading } = useDatasetContext();
  const [params, setParams] = useSearchParams();
  const [selected, setSelected] = useState(null);
  const [searchInput, setSearchInput] = useState(params.get('search') ?? '');

  const filters = Object.fromEntries(FILTER_KEYS.map((k) => [k, params.get(k) ?? '']));
  const page = Number(params.get('page') ?? 1) || 1;
  const limit = Number(params.get('limit') ?? 10) || 10;
  const query = useReviews(selectedId, { ...filters, page, limit }, isProcessing);

  const update = (changes) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value === '' || value == null) next.delete(key);
      else next.set(key, String(value));
    }
    if (!('page' in changes)) next.delete('page'); // new filter -> back to page 1
    setParams(next, { replace: true });
  };

  // Debounce typing in the search box.
  useEffect(() => {
    const current = params.get('search') ?? '';
    if (searchInput.trim() === current) return undefined;
    const timer = setTimeout(() => update({ search: searchInput.trim() }), 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const clearAll = () => {
    setSearchInput('');
    setParams(new URLSearchParams(), { replace: true });
  };

  if (datasetsLoading) return <LoadingState />;
  if (datasets.length === 0) return <Welcome />;

  const data = query.data;
  const activeFilters = FILTER_KEYS.some((k) => filters[k]);
  const from = data ? (data.page - 1) * data.limit + 1 : 0;
  const to = data ? Math.min(data.page * data.limit, data.total) : 0;

  return (
    <div className="stagger space-y-6">
      <PageHeader
        eyebrow="Every row, every verdict"
        title="Reviews"
        description="Every uploaded row, including skipped and duplicate ones, with its AI analysis."
      />

      <Card>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <div className="sm:col-span-2">
            <label htmlFor="review-search" className="mb-1 block text-xs font-medium text-slate-600">
              Search
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" aria-hidden />
              <input
                id="review-search"
                type="search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Review text, product, ID…"
                className="h-10 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm text-slate-800 placeholder:text-slate-400 transition-colors hover:border-navy-300 focus:border-navy-600"
              />
            </div>
          </div>
          <Select id="f-product" label="Product" value={filters.product} onChange={(v) => update({ product: v })} options={(data?.products ?? []).map((p) => [p, p])} />
          <Select
            id="f-sentiment"
            label="Sentiment"
            value={filters.sentiment}
            onChange={(v) => update({ sentiment: v })}
            options={SENTIMENTS.map((s) => [s, SENTIMENT_STYLES[s].label])}
          />
          <Select id="f-topic" label="Topic" value={filters.topic} onChange={(v) => update({ topic: v })} options={TOPICS.map((t) => [t, TOPIC_LABELS[t]])} />
          <Select
            id="f-status"
            label="Status"
            value={filters.status}
            onChange={(v) => update({ status: v })}
            options={['analysed', 'analysis_failed', 'skipped', 'pending'].map((s) => [s, STATUS_LABELS[s]])}
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" className="size-4 rounded accent-navy-700" checked={filters.needsReply === 'true'} onChange={(e) => update({ needsReply: e.target.checked ? 'true' : '' })} />
            Needs reply
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" className="size-4 rounded accent-navy-700" checked={filters.mismatch === 'true'} onChange={(e) => update({ mismatch: e.target.checked ? 'true' : '' })} />
            Rating mismatch
          </label>
          {activeFilters && (
            <Button variant="ghost" size="sm" icon={FilterX} onClick={clearAll}>
              Clear all filters
            </Button>
          )}
        </div>
      </Card>

      <Card className="overflow-hidden" title={data ? `${data.total} review${data.total === 1 ? '' : 's'}` : 'Reviews'}>
        {query.isLoading ? (
          <LoadingState label="Loading reviews…" />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={query.refetch} />
        ) : data.items.length === 0 ? (
          <EmptyState
            icon={SearchX}
            title="No reviews match these filters"
            description="Try removing a filter or searching for something else."
            action={activeFilters && <Button variant="secondary" size="sm" onClick={clearAll}>Clear all filters</Button>}
          />
        ) : (
          <>
            <div className="relative -mx-5 -mt-5 sm:-mx-6 sm:-mt-6 overflow-x-auto">
              <table className="min-w-[1100px] w-full text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-100/80 text-xs font-semibold text-slate-600">
                  <tr>
                    <th scope="col" className="px-4 py-2.5 font-medium">ID</th>
                    <th scope="col" className="px-4 py-2.5 font-medium">Product</th>
                    <th scope="col" className="px-4 py-2.5 font-medium">Rating</th>
                    <th scope="col" className="px-4 py-2.5 font-medium">Date</th>
                    <th scope="col" className="px-4 py-2.5 font-medium">Sentiment</th>
                    <th scope="col" className="px-4 py-2.5 font-medium">Topics</th>
                    <th scope="col" className="min-w-64 px-4 py-2.5 font-medium">AI summary</th>
                    <th scope="col" className="px-4 py-2.5 font-medium">Reply</th>
                    <th scope="col" className="px-4 py-2.5 font-medium">Status</th>
                    <th scope="col" className="px-4 py-2.5 font-medium">Flags</th>
                    <th scope="col" className="px-4 py-2.5 font-medium"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/70">
                  {data.items.map((r) => (
                    <tr key={r.id} className="align-top transition-colors hover:bg-brand-50/70">
                      <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-900">{r.reviewId}</td>
                      <td className="px-4 py-3 text-slate-700">{r.product}</td>
                      <td className="px-4 py-3"><RatingStars rating={r.rating} raw={r.rawRating} /></td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">{r.date ?? '—'}</td>
                      <td className="px-4 py-3"><SentimentBadge sentiment={r.sentiment} /></td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">{r.topics.map((t) => <TopicChip key={t} topic={t} />)}</div>
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {r.summary ?? <span className="text-slate-400">{r.status === 'skipped' ? 'Skipped: empty text' : r.failureReason ? 'No analysis' : '—'}</span>}
                      </td>
                      <td className="px-4 py-3">
                        {r.needsReply ? (
                          <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium text-amber-700">
                            <MessageCircleReply className="size-3.5" aria-hidden /> {r.suggestedReply ? 'Drafted' : 'Needed'}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">{r.needsReply === false ? 'No' : '—'}</span>
                        )}
                      </td>
                      <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                      <td className="px-4 py-3"><Flags review={r} /></td>
                      <td className="px-4 py-3 text-right">
                        <Button variant={r.needsReply ? 'primary' : 'secondary'} size="sm" icon={r.needsReply ? MessageCircleReply : Eye} onClick={() => setSelected(r)} aria-label={`Open review ${r.reviewId}`}>
                          {r.needsReply ? 'Reply' : 'View'}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
              <p className="text-slate-600">
                Showing <span className="font-medium">{from}</span>–<span className="font-medium">{to}</span> of <span className="font-medium">{data.total}</span>
              </p>
              <div className="flex items-center gap-2">
                <label htmlFor="page-size" className="text-xs text-slate-500">Rows</label>
                <select id="page-size" value={limit} onChange={(e) => update({ limit: e.target.value })} className="h-9 rounded-lg border border-slate-300 bg-white pl-2.5 pr-7 text-sm">
                  {[10, 25, 50].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
                <Button variant="secondary" size="sm" icon={ChevronLeft} disabled={data.page <= 1} onClick={() => update({ page: data.page - 1 })} aria-label="Previous page">
                  Prev
                </Button>
                <span className="text-xs text-slate-500">Page {data.page} / {data.totalPages}</span>
                <Button variant="secondary" size="sm" disabled={data.page >= data.totalPages} onClick={() => update({ page: data.page + 1 })} aria-label="Next page">
                  Next <ChevronRight className="size-4" aria-hidden />
                </Button>
              </div>
            </div>
          </>
        )}
      </Card>

      <ReviewDrawer review={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
