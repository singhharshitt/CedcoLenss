import { Link } from 'react-router';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Activity, Clock, Cpu, Database, XCircle, Zap } from 'lucide-react';
import { useDatasetContext } from '../context/DatasetContext.jsx';
import { useDashboard } from '../hooks/queries.js';
import { CHART, ISSUE_LABELS, SENTIMENT_STYLES, STATUS_LABELS, formatDuration } from '../utils/format.js';
import { usePrefersReducedMotion } from '../utils/motion.js';
import { CHART_TOOLTIP, RatingAgreementCard, StatCard, ThemeList } from '../components/insights.jsx';
import { AiThemesCard, CallsByModel, ExportButtons } from '../components/aiThemes.jsx';
import { Welcome } from './OverviewPage.jsx';
import { Card, EmptyState, ErrorState, LoadingState, SentimentBadge, PageHeader } from '../components/ui.jsx';

function TopicChart({ data }) {
  const reducedMotion = usePrefersReducedMotion();
  if (data.length === 0) return <EmptyState title="No topics yet" />;
  const tick = { fontSize: 12, fill: CHART.axis, fontFamily: CHART.font };
  return (
    <div className="h-80">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }} barCategoryGap="28%">
          <CartesianGrid strokeDasharray="2 4" vertical={false} stroke={CHART.grid} />
          <XAxis dataKey="label" tick={tick} tickLine={false} axisLine={{ stroke: CHART.grid }} interval={0} />
          <YAxis allowDecimals={false} tick={tick} tickLine={false} axisLine={false} />
          <Tooltip {...CHART_TOOLTIP} cursor={{ fill: CHART.cursor }} />
          <Legend iconType="square" iconSize={10} wrapperStyle={{ fontSize: 13, fontFamily: CHART.font, color: CHART.axis, paddingTop: 8 }} />
          {['positive', 'neutral', 'negative'].map((s, i, all) => (
            <Bar
              key={s}
              dataKey={s}
              stackId="a"
              name={SENTIMENT_STYLES[s].label}
              fill={SENTIMENT_STYLES[s].color}
              radius={i === all.length - 1 ? [4, 4, 0, 0] : 0}
              isAnimationActive={!reducedMotion}
              animationDuration={600}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function InsightsPage() {
  const { selectedId, isProcessing, datasets, datasetsLoading } = useDatasetContext();
  const query = useDashboard(selectedId, isProcessing);

  if (datasetsLoading) return <LoadingState />;
  if (datasets.length === 0) return <Welcome />;
  if (query.isLoading) return <LoadingState label="Loading insights…" />;
  if (query.isError) return <ErrorState error={query.error} onRetry={query.refetch} />;

  const { topComplaints, topPraises, topicBreakdown, ratingAgreement, dataQuality, usage } = query.data;
  const avgPerCall = usage.aiCalls > 0 && usage.processingTimeMs ? Math.round(usage.processingTimeMs / usage.aiCalls) : null;
  const qualityRows = [
    ['Rows in file', dataQuality.totalRows],
    [ISSUE_LABELS.empty_review, dataQuality.emptyReviews],
    [ISSUE_LABELS.malformed_row, dataQuality.malformedRows],
    ['Duplicate text (analysed once)', dataQuality.duplicates],
    ['…of which near-identical', dataQuality.nearDuplicates ?? 0],
    ['Very similar reviews (flagged)', dataQuality.possibleDuplicates ?? 0],
    [ISSUE_LABELS.missing_rating, dataQuality.missingRating],
    [ISSUE_LABELS.invalid_rating, dataQuality.invalidRating],
    ['Missing / invalid date', dataQuality.invalidOrMissingDate],
    ['AI analysis failed', dataQuality.failedAnalyses],
  ];

  return (
    <div className="stagger space-y-6">
      <PageHeader
        eyebrow="Beyond the numbers"
        title="AI Insights"
        description="Themes, rating agreement, data quality and AI usage for this dataset."
        action={<ExportButtons datasetId={selectedId} disabled={isProcessing} />}
      />

      <section aria-labelledby="usage-heading" className="space-y-3">
        <h2 id="usage-heading" className="text-sm font-semibold text-slate-900">AI usage &amp; performance</h2>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
          <StatCard label="LLM calls" value={usage.aiCalls} icon={Cpu} hint="HTTP requests incl. retries" />
          <StatCard label="Cache hits" value={usage.cacheHits} icon={Database} tone="positive" hint="Reviews with no AI call" />
          <StatCard label="Sent to AI" value={usage.sentToAi} icon={Zap} hint={`of ${usage.uniqueReviews} unique reviews`} />
          <StatCard label="Analysed" value={usage.analysed} icon={Activity} tone="positive" />
          <StatCard label="Failed" value={usage.failed} icon={XCircle} tone={usage.failed ? 'negative' : 'neutral'} />
          <StatCard label="Processing time" value={formatDuration(usage.processingTimeMs)} icon={Clock} hint={avgPerCall ? `~${formatDuration(avgPerCall)} per call · ${STATUS_LABELS[usage.status]}` : STATUS_LABELS[usage.status]} />
        </div>
      </section>

      <Card title="AI calls by model" description="Every HTTP request to an AI provider for this dataset, incl. retries, split by the model that served it (primary or fallback)">
        <CallsByModel rows={usage.byModel} />
      </Card>

      <AiThemesCard datasetId={selectedId} isProcessing={isProcessing} />

      <div className="grid gap-6 lg:grid-cols-2">
        <ThemeList kind="complaints" themes={topComplaints} />
        <ThemeList kind="praises" themes={topPraises} />
      </div>

      <Card title="Topics by sentiment" description="How often each topic is mentioned in unique analysed reviews">
        <TopicChart data={topicBreakdown} />
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <RatingAgreementCard agreement={ratingAgreement} />
        <Card title="Rating mismatches" description="Reviews whose stars disagree with the AI sentiment" className="lg:col-span-2">
          {ratingAgreement.mismatchReviews.length === 0 ? (
            <EmptyState title="No mismatches" />
          ) : (
            <ul className="divide-y divide-slate-200/70">
              {ratingAgreement.mismatchReviews.map((m) => (
                <li key={m.id} className="flex flex-col gap-1 py-2.5 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:gap-3">
                  <div className="flex shrink-0 items-center gap-2 text-sm sm:w-64">
                    <span className="font-medium text-slate-900">{m.reviewId}</span>
                    <span className="text-amber-500" aria-label={`${m.rating} stars`}>{'★'.repeat(m.rating)}</span>
                    <SentimentBadge sentiment={m.sentiment} />
                  </div>
                  <p className="min-w-0 flex-1 text-sm text-slate-600">
                    {m.summary} <span className="text-xs text-slate-400">· {m.product}</span>
                  </p>
                </li>
              ))}
            </ul>
          )}
          {ratingAgreement.mismatches > 0 && (
            <Link to="/reviews?mismatch=true" className="mt-3 inline-block text-xs font-medium text-brand-600 hover:text-brand-700">
              Open in the reviews table →
            </Link>
          )}
        </Card>
      </div>

      <Card title="Data quality" description="How the uploaded file was cleaned before analysis">
        <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {qualityRows.map(([label, value]) => (
            <div key={label} className="rounded-xl border border-slate-200/70 bg-slate-50 px-4 py-3">
              <dt className="text-xs text-slate-500">{label}</dt>
              <dd className="display mt-1 text-2xl tabular-nums text-navy-900">{value}</dd>
            </div>
          ))}
        </dl>
      </Card>
    </div>
  );
}
