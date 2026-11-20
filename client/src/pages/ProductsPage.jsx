import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { AlertTriangle, ArrowLeft, ArrowRight, Boxes, MessageCircleReply, Star } from 'lucide-react';
import { useDatasetContext } from '../context/DatasetContext.jsx';
import { useProduct, useProducts } from '../hooks/queries.js';
import { formatPercent } from '../utils/format.js';
import { RatingAgreementCard, SentimentChart, StatCard, ThemeList } from '../components/insights.jsx';
import { ReviewDrawer } from '../components/ReviewDrawer.jsx';
import { Welcome } from './OverviewPage.jsx';
import { Button, Card, EmptyState, ErrorState, LoadingState, SentimentBadge, SentimentBar, TopicChip } from '../components/ui.jsx';

export function ProductsPage() {
  const { selectedId, isProcessing, datasets, datasetsLoading } = useDatasetContext();
  const query = useProducts(selectedId, isProcessing);

  if (datasetsLoading) return <LoadingState />;
  if (datasets.length === 0) return <Welcome />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Products</h1>
        <p className="text-sm text-slate-500">Sentiment, top issues and reply workload for each product.</p>
      </div>
      {query.isLoading ? (
        <LoadingState label="Loading products…" />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={query.refetch} />
      ) : query.data.length === 0 ? (
        <Card>
          <EmptyState icon={Boxes} title="No products in this dataset" />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {query.data.map((p) => {
            const negative = p.sentiment.find((s) => s.sentiment === 'negative');
            const positive = p.sentiment.find((s) => s.sentiment === 'positive');
            return (
              <Link
                key={p.id}
                to={`/products/${p.id}`}
                className="group rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-brand-300 hover:shadow"
              >
                <div className="flex items-start justify-between gap-2">
                  <h2 className="font-semibold text-slate-900 group-hover:text-brand-700">{p.name}</h2>
                  <ArrowRight className="size-4 shrink-0 text-slate-300 group-hover:text-brand-500" aria-hidden />
                </div>
                <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                  <Star className="size-3 fill-amber-400 text-amber-400" aria-hidden />
                  {p.averageRating ?? '—'} avg · {p.analysedReviews} analysed of {p.totalRows} rows
                </p>
                <div className="mt-4">
                  <SentimentBar sentiment={p.sentiment} />
                  <div className="mt-1.5 flex justify-between text-xs text-slate-500">
                    <span className="text-emerald-700">{formatPercent(positive.percentage)} positive</span>
                    <span className="text-rose-700">{formatPercent(negative.percentage)} negative</span>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                  <span className="flex items-center gap-1">
                    <MessageCircleReply className="size-3.5 text-amber-600" aria-hidden /> {p.needsReply} need reply
                  </span>
                  <span className="flex items-center gap-1">
                    <AlertTriangle className="size-3.5 text-amber-500" aria-hidden /> {p.mismatches} rating mismatch{p.mismatches === 1 ? '' : 'es'}
                  </span>
                </div>
                {p.topComplaints[0] && (
                  <p className="mt-3 text-xs text-slate-500">
                    Top complaint: <span className="font-medium text-slate-700">{p.topComplaints[0].label}</span> ({p.topComplaints[0].count})
                  </p>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function ProductDetailPage() {
  const { productId } = useParams();
  const { selectedId, isProcessing } = useDatasetContext();
  const query = useProduct(selectedId, productId ? encodeURIComponent(productId) : null, isProcessing);
  const [selected, setSelected] = useState(null);

  const back = (
    <Link to="/products" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
      <ArrowLeft className="size-4" aria-hidden /> All products
    </Link>
  );

  if (query.isLoading) return <LoadingState label="Loading product…" />;
  if (query.isError) {
    return (
      <div className="space-y-4">
        {back}
        <Card>
          <ErrorState error={query.error} onRetry={query.error.status === 404 ? undefined : query.refetch} />
        </Card>
      </div>
    );
  }
  if (!query.data) return null;

  const p = query.data;
  const bySentiment = Object.fromEntries(p.sentiment.map((s) => [s.sentiment, s]));

  return (
    <div className="space-y-6">
      {back}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">{p.name}</h1>
          <p className="text-sm text-slate-500">
            {p.analysedReviews} unique analysed reviews · {p.totalRows} rows in file
          </p>
        </div>
        <Link to={`/reviews?product=${encodeURIComponent(p.name)}`} className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700">
          See all reviews <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Average rating" value={p.averageRating ?? '—'} icon={Star} tone="warning" hint="Valid ratings, unique reviews" />
        <StatCard label="Positive" value={formatPercent(bySentiment.positive.percentage)} tone="positive" hint={`${bySentiment.positive.count} reviews`} />
        <StatCard label="Negative" value={formatPercent(bySentiment.negative.percentage)} tone="negative" hint={`${bySentiment.negative.count} reviews`} />
        <StatCard label="Need a reply" value={p.needsReply} icon={MessageCircleReply} tone="warning" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Sentiment split" className="lg:col-span-2">
          <SentimentChart sentiment={p.sentiment} total={p.analysedReviews} />
        </Card>
        <RatingAgreementCard agreement={p.ratingAgreement} compact />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ThemeList kind="complaints" themes={p.topComplaints} productFilter={p.name} />
        <ThemeList kind="praises" themes={p.topPraises} productFilter={p.name} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Rating mismatches" description="Star rating disagrees with what the review says">
          {p.mismatchReviews.length === 0 ? (
            <EmptyState title="No mismatches" description="Every rated review agrees with its sentiment." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {p.mismatchReviews.map((m) => (
                <li key={m.id} className="py-2.5 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-medium text-slate-900">{m.reviewId}</span>
                    <span className="text-amber-500">{'★'.repeat(m.rating)}</span>
                    <span className="text-xs text-slate-500">expected {m.expected}, text is</span>
                    <SentimentBadge sentiment={m.sentiment} />
                  </div>
                  <p className="mt-0.5 text-sm text-slate-600">{m.summary}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Reply queue" description="Reviews for this product that need a response">
          {p.replyQueue.length === 0 ? (
            <EmptyState icon={MessageCircleReply} title="No replies needed" />
          ) : (
            <ul className="divide-y divide-slate-100">
              {p.replyQueue.map((r) => (
                <li key={r.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs font-semibold text-slate-500">{r.reviewId}</span>
                      {r.topics.map((t) => <TopicChip key={t} topic={t} />)}
                    </div>
                    <p className="mt-0.5 text-sm text-slate-700">{r.summary}</p>
                  </div>
                  <Button size="sm" variant={r.suggestedReply ? 'secondary' : 'primary'} onClick={() => setSelected(r)}>
                    {r.suggestedReply ? 'View reply' : 'Reply'}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <ReviewDrawer review={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
