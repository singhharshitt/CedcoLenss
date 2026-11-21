import { Link } from 'react-router';
import { Download, FileText, Loader2, RefreshCw, Sparkles, ThumbsDown, ThumbsUp } from 'lucide-react';
import { exportCsvUrl } from '../api/reviewlens.js';
import { useRegenerateThemes, useThemes } from '../hooks/queries.js';
import { useToast } from '../context/ToastContext.jsx';
import { Button, Card, EmptyState } from './ui.jsx';

const PURPOSE_LABELS = { analysis: 'Review analysis', reply: 'Suggested replies', themes: 'AI themes' };

/** One list of AI themes (complaints or praises). `compact` hides links, for the printable report. */
export function ThemeGroups({ kind, themes, compact = false }) {
  const negative = kind === 'complaints';
  const Icon = negative ? ThumbsDown : ThumbsUp;
  if (!themes?.length) {
    return <p className="text-sm text-slate-500">{negative ? 'No complaint themes.' : 'No praise themes.'}</p>;
  }
  return (
    <ol className="space-y-3">
      {themes.map((t, i) => (
        <li
          key={`${t.theme}-${i}`}
          className={`break-inside-avoid rounded-xl border border-l-4 bg-white p-4 ${negative ? 'border-slate-200 border-l-brand-400' : 'border-slate-200 border-l-navy-700'} ${compact ? '' : 'lift'}`}
        >
          <div className="flex items-start justify-between gap-3">
            <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Icon className={`size-4 shrink-0 ${negative ? 'text-brand-500' : 'text-navy-500'}`} strokeWidth={1.75} aria-hidden />
              {t.theme}
            </p>
            <span
              className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-semibold tabular-nums ring-1 ring-inset ${negative ? 'bg-brand-50 text-brand-700 ring-brand-200' : 'bg-navy-50 text-navy-700 ring-navy-200'}`}
            >
              {t.count} review{t.count === 1 ? '' : 's'}
            </span>
          </div>
          {t.description && <p className="mt-1 text-sm text-slate-600">{t.description}</p>}
          <p className="mt-1.5 text-xs text-slate-500">
            {t.products.map((p) => `${p.name} (${p.count})`).join(' · ')}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {t.reviewIds.map((id) =>
              compact ? (
                <span key={id} className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-600">{id}</span>
              ) : (
                <Link
                  key={id}
                  to={`/reviews?search=${encodeURIComponent(id)}`}
                  className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-700 transition-colors hover:bg-brand-100 hover:text-brand-800"
                >
                  {id}
                </Link>
              ),
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

/** "Specific themes" card: AI-grouped complaints and praises, with regenerate. */
export function AiThemesCard({ datasetId, isProcessing }) {
  const query = useThemes(datasetId, isProcessing);
  const regenerate = useRegenerateThemes();
  const toast = useToast();
  const data = query.data;
  const generating = data?.status === 'generating';

  const onRegenerate = () =>
    regenerate.mutate(datasetId, { onError: (err) => toast.error(err.message) });

  let body;
  if (query.isLoading) {
    body = <p className="text-sm text-slate-500">Loading themes…</p>;
  } else if (isProcessing) {
    body = <EmptyState title="Waiting for analysis" description="Themes are generated automatically once all reviews are analysed." />;
  } else if (!data?.themes && generating) {
    body = (
      <p className="flex items-center gap-2 text-sm text-slate-600">
        <Loader2 className="size-4 animate-spin text-brand-500" aria-hidden /> Grouping reviews into themes…
      </p>
    );
  } else if (!data?.themes) {
    body = (
      <EmptyState
        title={data?.status === 'failed' ? 'Themes could not be generated' : 'No themes yet'}
        description={data?.errorMessage ?? 'Generate specific themes such as “Mug handles break” from the analysed reviews.'}
      />
    );
  } else {
    body = (
      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-label="Complaint themes">
          <h3 className="eyebrow mb-3 text-brand-700">Complaints</h3>
          <ThemeGroups kind="complaints" themes={data.themes.complaints} />
        </section>
        <section aria-label="Praise themes">
          <h3 className="eyebrow mb-3 text-navy-700">Praises</h3>
          <ThemeGroups kind="praises" themes={data.themes.praises} />
        </section>
      </div>
    );
  }

  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          <Sparkles className="size-4 text-brand-500" aria-hidden /> Specific themes (AI)
        </span>
      }
      description={
        data?.themes && data.model
          ? `Review summaries grouped into concrete issues by ${data.model}. Click a review ID to open it.`
          : 'Review summaries grouped into concrete issues, beyond the 7 broad topics.'
      }
      action={
        !isProcessing && (
          <Button
            size="sm"
            variant="secondary"
            icon={RefreshCw}
            loading={generating || regenerate.isPending}
            onClick={onRegenerate}
          >
            {generating ? 'Generating…' : data?.themes ? 'Regenerate' : 'Generate themes'}
          </Button>
        )
      }
    >
      {data?.themes && data.status === 'failed' && (
        <p className="mb-4 rounded-xl border border-brand-200 bg-brand-50 p-3 text-sm text-brand-800">
          The last regeneration failed ({data.errorMessage}); showing the previous themes.
        </p>
      )}
      {body}
    </Card>
  );
}

/** "Export CSV" + "PDF report" buttons for the selected dataset. */
export function ExportButtons({ datasetId, disabled = false }) {
  return (
    <div className="flex flex-wrap gap-2 print:hidden">
      <a
        href={disabled ? undefined : exportCsvUrl(datasetId)}
        aria-disabled={disabled}
        className={`inline-flex h-9 items-center gap-2 rounded-lg bg-white px-3 text-sm font-semibold text-slate-800 ring-1 ring-inset ring-slate-300 transition-colors hover:bg-slate-50 hover:ring-navy-300 ${disabled ? 'pointer-events-none opacity-55' : ''}`}
      >
        <Download className="size-4" aria-hidden /> Export CSV
      </a>
      <a
        href={disabled ? undefined : `/report/${datasetId}`}
        target="_blank"
        rel="noopener"
        aria-disabled={disabled}
        className={`inline-flex h-9 items-center gap-2 rounded-lg bg-navy-900 px-3 text-sm font-semibold text-cream transition-colors hover:bg-navy-800 ${disabled ? 'pointer-events-none opacity-55' : ''}`}
      >
        <FileText className="size-4" aria-hidden /> PDF report
      </a>
    </div>
  );
}

/** Cost log broken down by the model that served each request (primary vs fallback). */
export function CallsByModel({ rows }) {
  if (!rows?.length) return <p className="text-sm text-slate-500">No AI calls recorded for this dataset yet.</p>;
  const total = rows.reduce((sum, r) => sum + r.calls, 0);
  return (
    <div className="-mx-5 -my-5 sm:-mx-6 sm:-my-6 overflow-x-auto">
      <table className="w-full min-w-[480px] text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
          <tr>
            <th scope="col" className="px-4 py-2.5 font-medium">Model</th>
            <th scope="col" className="px-4 py-2.5 font-medium">Used for</th>
            <th scope="col" className="px-4 py-2.5 text-right font-medium">Calls</th>
            <th scope="col" className="px-4 py-2.5 text-right font-medium">Share</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => (
            <tr key={`${r.model}-${r.purpose}`}>
              <td className="px-4 py-2.5"><code className="rounded bg-navy-50 px-1.5 py-0.5 font-mono text-xs text-navy-700">{r.model}</code></td>
              <td className="px-4 py-2.5 text-slate-700">{PURPOSE_LABELS[r.purpose] ?? r.purpose}</td>
              <td className="px-4 py-2.5 text-right tabular-nums">{r.calls}</td>
              <td className="px-4 py-2.5 text-right tabular-nums text-slate-500">{Math.round((r.calls / total) * 100)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
