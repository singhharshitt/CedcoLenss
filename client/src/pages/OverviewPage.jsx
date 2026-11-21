import { useState } from 'react';
import { Link } from 'react-router';
import { ArrowRight, BarChart3, MessageCircleReply, Minus, ScanSearch, ThumbsDown, ThumbsUp } from 'lucide-react';
import { useDatasetContext } from '../context/DatasetContext.jsx';
import { useDashboard, useReviews } from '../hooks/queries.js';
import { formatDateTime, formatDuration, formatPercent, isActiveStatus } from '../utils/format.js';
import { FailureBanner, ProcessingPanel } from '../components/ProcessingPanel.jsx';
import { RatingAgreementCard, SentimentChart, StatCard, ThemeList } from '../components/insights.jsx';
import { ReviewDrawer } from '../components/ReviewDrawer.jsx';
import { ExportButtons } from '../components/aiThemes.jsx';
import { UploadDropzone } from '../components/UploadDialog.jsx';
import { Button, Card, EmptyState, ErrorState, LoadingState, SentimentBadge, TopicChip } from '../components/ui.jsx';

export function Welcome() {
  return (
    <div className="mx-auto max-w-2xl py-6">
      <div className="mb-6 text-center">
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl bg-brand-600 text-white shadow">
          <ScanSearch className="size-7" aria-hidden />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Turn reviews into actions</h1>
        <p className="mt-2 text-sm text-slate-600">
          Upload a CSV of product reviews. ReviewLens cleans it, analyses every unique review with AI and shows what customers love,
          what they complain about and which reviews need a reply.
        </p>
      </div>
      <Card>
        <UploadDropzone />
      </Card>
    </div>
  );
}

function ReplyQueue({ datasetId, live }) {
  const [selected, setSelected] = useState(null);
  const query = useReviews(datasetId, { needsReply: 'true', limit: 5 }, live);
  const data = query.data;

  return (
    <Card
      title="Reviews needing a reply"
      description="Generate a suggested response on demand"
      action={
        data?.total > 0 && (
          <Link to="/reviews?needsReply=true" className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700">
            View all {data.total} <ArrowRight className="size-3" aria-hidden />
          </Link>
        )
      }
    >
      {query.isLoading ? (
        <LoadingState />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={query.refetch} />
      ) : data.items.length === 0 ? (
        <EmptyState icon={MessageCircleReply} title="No reviews need a reply" description="Nice — nothing is waiting for a response." />
      ) : (
        <ul className="divide-y divide-slate-100">
          {data.items.map((review) => (
            <li key={review.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-slate-500">{review.reviewId}</span>
                  <SentimentBadge sentiment={review.sentiment} />
                  {review.topics.map((t) => (
                    <TopicChip key={t} topic={t} />
                  ))}
                </div>
                <p className="mt-1 text-sm text-slate-800">{review.summary}</p>
                <p className="text-xs text-slate-500">{review.product}</p>
              </div>
              <Button size="sm" variant={review.suggestedReply ? 'secondary' : 'primary'} icon={MessageCircleReply} onClick={() => setSelected(review)}>
                {review.suggestedReply ? 'View reply' : 'Reply'}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <ReviewDrawer review={selected} onClose={() => setSelected(null)} />
    </Card>
  );
}

export function OverviewPage() {
  const { selectedId, dataset, isProcessing, datasets, datasetsLoading, datasetsError } = useDatasetContext();
  const dashboard = useDashboard(selectedId, isProcessing);

  if (datasetsLoading) return <LoadingState label="Loading datasets…" />;
  if (datasetsError) return <ErrorState error={datasetsError} onRetry={() => window.location.reload()} />;
  if (datasets.length === 0) return <Welcome />;
  if (!dataset || dashboard.isLoading) return <LoadingState label="Loading dashboard…" />;
  if (dashboard.isError) return <ErrorState error={dashboard.error} onRetry={dashboard.refetch} />;

  const { summary, sentiment, topComplaints, topPraises, ratingAgreement, dataQuality, usage } = dashboard.data;
  const excluded = [
    dataQuality.emptyReviews + dataQuality.malformedRows > 0 && `${dataQuality.emptyReviews + dataQuality.malformedRows} skipped`,
    dataQuality.duplicates > 0 && `${dataQuality.duplicates} duplicate`,
    dataQuality.failedAnalyses > 0 && `${dataQuality.failedAnalyses} failed`,
  ].filter(Boolean);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">Overview</h1>
          <p className="text-sm text-slate-500">
            {dataset.filename} · uploaded {formatDateTime(dataset.createdAt)}
          </p>
        </div>
        {!isActiveStatus(dataset.status) && (
          <div className="flex flex-col items-end gap-2">
            <ExportButtons datasetId={dataset.id} />
            <p className="text-xs text-slate-500">
              {usage.aiCalls} AI call(s) · {usage.cacheHits} from cache · {formatDuration(usage.processingTimeMs)}
            </p>
          </div>
        )}
      </div>

      {isProcessing && <ProcessingPanel dataset={dataset} />}
      <FailureBanner dataset={dataset} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard
          label="Reviews analysed"
          value={summary.analysedReviews}
          icon={BarChart3}
          hint={excluded.length ? `Unique reviews · excludes ${excluded.join(', ')}` : 'Unique reviews'}
        />
        <StatCard label="Positive" value={formatPercent(summary.positive.percentage)} icon={ThumbsUp} tone="positive" hint={`${summary.positive.count} reviews`} />
        <StatCard label="Neutral" value={formatPercent(summary.neutral.percentage)} icon={Minus} tone="neutral" hint={`${summary.neutral.count} reviews`} />
        <StatCard label="Negative" value={formatPercent(summary.negative.percentage)} icon={ThumbsDown} tone="negative" hint={`${summary.negative.count} reviews`} />
        <StatCard
          label="Need a reply"
          value={summary.needsReply}
          icon={MessageCircleReply}
          tone="warning"
          hint={summary.analysedReviews ? `${formatPercent(Math.round((summary.needsReply / summary.analysedReviews) * 1000) / 10)} of analysed` : '—'}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Sentiment distribution" description="Unique analysed reviews" className="lg:col-span-2">
          <SentimentChart sentiment={sentiment} total={summary.analysedReviews} />
        </Card>
        <RatingAgreementCard agreement={ratingAgreement} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ThemeList kind="complaints" themes={topComplaints} />
        <ThemeList kind="praises" themes={topPraises} />
      </div>

      <ReplyQueue datasetId={selectedId} live={isProcessing} />

      {!isProcessing && <ProcessingPanel dataset={dataset} />}
    </div>
  );
}
