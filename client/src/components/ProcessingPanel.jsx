import { useEffect, useState } from 'react';
import { AlertTriangle, ArrowRightLeft, Cpu, Loader2, RotateCw } from 'lucide-react';
import { useRetryFailed } from '../hooks/queries.js';
import { useToast } from '../context/ToastContext.jsx';
import { formatDuration, isActiveStatus } from '../utils/format.js';
import { Button, Card, StatusBadge } from './ui.jsx';

/** Live processing counters straight from GET /api/datasets/:id/status. */
export function ProcessingPanel({ dataset }) {
  const { counts, progress } = dataset;
  const active = isActiveStatus(dataset.status);
  const items = [
    ['Rows in file', counts.totalRows],
    ['Valid reviews', counts.validRows],
    ['Skipped (empty / malformed)', counts.skippedRows],
    ['Duplicates (reused)', counts.duplicateRows],
    ['Served from cache', counts.cacheHits],
    ['Sent for AI analysis', counts.sentToAi],
    ['Analysed', counts.analysed],
    ['Analysis failed', counts.failed],
    ['AI calls (incl. retries)', counts.aiCalls],
  ];

  return (
    <Card
      title={active ? 'Analysing reviews…' : 'Processing summary'}
      description={
        active
          ? `Batches of reviews are being sent to the AI one after another. ${progress.processed} of ${progress.total} unique reviews done.`
          : `Finished in ${formatDuration(dataset.processingTimeMs)} with ${counts.aiCalls} AI call(s).`
      }
      action={<StatusBadge status={dataset.status} />}
    >
      <div className="mb-5">
        <div className="mb-1.5 flex items-center justify-between text-sm">
          <span className="flex items-center gap-2 font-semibold text-slate-800">
            {active && <Loader2 className="size-4 animate-spin text-brand-500" aria-hidden />}
            {progress.percentage}% complete
          </span>
          <span className="text-xs text-slate-500">
            {progress.processed}/{progress.total} unique reviews
          </span>
        </div>
        <div
          className="relative h-3 overflow-hidden rounded-full bg-slate-200"
          role="progressbar"
          aria-valuenow={progress.percentage}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Analysis progress"
        >
          <div className="h-full rounded-full bg-navy-700 transition-[width] duration-500 ease-[var(--ease-brand)]" style={{ width: `${progress.percentage}%` }}>
            {active && <span className="block h-full w-full animate-pulse rounded-full bg-brand-300/30" />}
          </div>
        </div>
        {active && dataset.live && <LiveBatch live={dataset.live} />}
      </div>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {items.map(([label, value]) => (
          <div key={label} className="rounded-xl border border-slate-200/70 bg-slate-50 px-4 py-3">
            <dt className="text-xs font-medium text-slate-500">{label}</dt>
            <dd className="display mt-1 text-2xl tabular-nums text-navy-900">{value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

/** Seconds since `iso`, re-rendered every second so the UI never looks frozen during a slow batch. */
function useElapsedSeconds(iso) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
}

/** The batch the server is analysing right now: which one, which model, how long it has been running. */
export function LiveBatch({ live }) {
  const elapsed = useElapsedSeconds(live.batchStartedAt);
  return (
    <div className="mt-3 space-y-2" aria-live="polite">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-600">
        <Cpu className="size-3.5 text-navy-500" aria-hidden />
        <span className="font-medium text-slate-800">
          Batch {live.batch} of {live.totalBatches}
        </span>
        <span>· {live.reviewsInBatch} review(s)</span>
        <span>
          · <code className="rounded bg-navy-50 px-1.5 py-0.5 font-mono text-navy-700">{live.model}</code>
        </span>
        <span className="tabular-nums">· {elapsed}s</span>
        {elapsed >= 20 && <span className="text-slate-500">(the AI provider is responding slowly)</span>}
      </p>
      {live.usingFallback && (
        <p className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-900">
          <ArrowRightLeft className="size-3.5 shrink-0" aria-hidden />
          The primary AI provider failed or timed out, so the fallback model is being used.
        </p>
      )}
    </div>
  );
}

/** Shown when a dataset failed or finished with failed reviews. */
export function FailureBanner({ dataset }) {
  const retry = useRetryFailed();
  const toast = useToast();
  if (isActiveStatus(dataset.status) || (dataset.status !== 'failed' && dataset.counts.failed === 0)) return null;

  const onRetry = () =>
    retry.mutate(dataset.id, {
      onSuccess: (data) => toast.success(`Re-queued ${data.requeued} review(s) for analysis.`),
      onError: (err) => toast.error(err.message),
    });

  return (
    <div role="alert" className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-start">
      <AlertTriangle className="size-5 shrink-0 text-amber-600" aria-hidden />
      <div className="flex-1 text-sm">
        <p className="font-medium text-amber-900">
          {dataset.status === 'failed' ? 'Processing stopped' : `${dataset.counts.failed} review(s) could not be analysed`}
        </p>
        <p className="mt-0.5 text-amber-800">
          {dataset.errorMessage ??
            'The AI returned invalid output twice for these reviews (or the provider was unavailable). They are marked “Analysis failed” and excluded from the statistics.'}
        </p>
      </div>
      {dataset.counts.failed > 0 && (
        <Button variant="secondary" size="sm" icon={RotateCw} loading={retry.isPending} onClick={onRetry}>
          Retry failed reviews
        </Button>
      )}
    </div>
  );
}
