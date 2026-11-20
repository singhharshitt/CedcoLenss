import { AlertTriangle, Loader2, RotateCw } from 'lucide-react';
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
          <span className="flex items-center gap-2 font-medium text-slate-700">
            {active && <Loader2 className="size-4 animate-spin text-brand-500" aria-hidden />}
            {progress.percentage}% complete
          </span>
          <span className="text-xs text-slate-500">
            {progress.processed}/{progress.total} unique reviews
          </span>
        </div>
        <div
          className="h-2.5 overflow-hidden rounded-full bg-slate-100"
          role="progressbar"
          aria-valuenow={progress.percentage}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Analysis progress"
        >
          <div className="h-full rounded-full bg-brand-500 transition-all duration-500" style={{ width: `${progress.percentage}%` }} />
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {items.map(([label, value]) => (
          <div key={label} className="rounded-lg bg-slate-50 px-3 py-2">
            <dt className="text-xs text-slate-500">{label}</dt>
            <dd className="text-lg font-semibold tabular-nums text-slate-900">{value}</dd>
          </div>
        ))}
      </dl>
    </Card>
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
