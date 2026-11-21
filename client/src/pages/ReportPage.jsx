import { useEffect } from 'react';
import { useParams } from 'react-router';
import { Printer } from 'lucide-react';
import { useDashboard, useReviews, useThemes } from '../hooks/queries.js';
import { ISSUE_LABELS, SENTIMENT_STYLES, formatDateTime, formatDuration, formatPercent } from '../utils/format.js';
import { ThemeGroups } from '../components/aiThemes.jsx';
import { ErrorState, LoadingState } from '../components/ui.jsx';

const PURPOSE_LABELS = { analysis: 'Review analysis', reply: 'Suggested replies', themes: 'AI themes' };

function Section({ title, children }) {
  return (
    <section className="break-inside-avoid-page space-y-3 border-t border-slate-200 pt-5">
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      {children}
    </section>
  );
}

function Metric({ label, value, hint }) {
  return (
    <div className="rounded-lg border border-slate-200 px-3 py-2">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-xl font-semibold tabular-nums text-slate-900">{value}</p>
      {hint && <p className="text-[11px] text-slate-500">{hint}</p>}
    </div>
  );
}

/**
 * Printable insights report (/report/:datasetId). Opens in its own tab without the
 * app chrome; "Save as PDF" uses the browser's print dialog, so the PDF keeps real,
 * selectable text and no PDF library is needed.
 */
export function ReportPage() {
  const datasetId = Number(useParams().datasetId);
  const valid = Number.isInteger(datasetId) && datasetId > 0;
  const dashboard = useDashboard(valid ? datasetId : null, false);
  const themes = useThemes(valid ? datasetId : null, false);
  const replies = useReviews(valid ? datasetId : null, { needsReply: 'true', limit: 100 }, false);

  const ready = dashboard.data && replies.data && !themes.isLoading;
  useEffect(() => {
    if (dashboard.data) document.title = `ReviewLens report – ${dashboard.data.dataset.filename}`;
  }, [dashboard.data]);

  if (!valid) return <ErrorState error={new Error('Invalid dataset id.')} />;
  if (dashboard.isError) return <ErrorState error={dashboard.error} onRetry={dashboard.refetch} />;
  if (!ready) return <LoadingState label="Preparing report…" />;

  const { dataset, summary, sentiment, topComplaints, topPraises, ratingAgreement, dataQuality, usage } = dashboard.data;
  const aiThemes = themes.data?.status !== 'none' ? themes.data?.themes : null;

  return (
    <div className="min-h-screen bg-slate-100 print:bg-white">
      <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-6 py-3 print:hidden">
        <p className="text-sm text-slate-600">
          Click <strong>Save as PDF</strong>, then pick “Save as PDF” as the printer in the dialog.
        </p>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700"
        >
          <Printer className="size-4" aria-hidden /> Save as PDF
        </button>
      </div>

      <main className="report mx-auto my-6 max-w-[210mm] space-y-6 bg-white p-10 shadow-sm print:my-0 print:max-w-none print:p-0 print:shadow-none">
        <header className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-widest text-brand-600">ReviewLens · AI review insights</p>
          <h1 className="text-2xl font-semibold text-slate-900">{dataset.filename}</h1>
          <p className="text-sm text-slate-500">
            Uploaded {formatDateTime(dataset.createdAt)} · report generated {formatDateTime(new Date().toISOString())}
          </p>
        </header>

        <div className="grid grid-cols-5 gap-3">
          <Metric label="Analysed" value={summary.analysedReviews} hint="unique reviews" />
          <Metric label="Positive" value={formatPercent(summary.positive.percentage)} hint={`${summary.positive.count} reviews`} />
          <Metric label="Neutral" value={formatPercent(summary.neutral.percentage)} hint={`${summary.neutral.count} reviews`} />
          <Metric label="Negative" value={formatPercent(summary.negative.percentage)} hint={`${summary.negative.count} reviews`} />
          <Metric label="Need a reply" value={summary.needsReply} />
        </div>

        <Section title="Sentiment">
          <ul className="space-y-2">
            {sentiment.map((s) => (
              <li key={s.sentiment} className="flex items-center gap-3 text-sm">
                <span className="w-16 text-slate-700">{SENTIMENT_STYLES[s.sentiment].label}</span>
                <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <span
                    className="block h-full rounded-full"
                    style={{ width: `${s.percentage}%`, backgroundColor: SENTIMENT_STYLES[s.sentiment].color }}
                  />
                </span>
                <span className="w-24 text-right tabular-nums text-slate-700">
                  {s.count} ({formatPercent(s.percentage)})
                </span>
              </li>
            ))}
          </ul>
        </Section>

        {aiThemes ? (
          <Section title="Specific themes (AI)">
            <div className="grid grid-cols-2 gap-6">
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-rose-700">Complaints</h3>
                <ThemeGroups kind="complaints" themes={aiThemes.complaints} compact />
              </div>
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-700">Praises</h3>
                <ThemeGroups kind="praises" themes={aiThemes.praises} compact />
              </div>
            </div>
          </Section>
        ) : null}

        <Section title="Top topics">
          <div className="grid grid-cols-2 gap-6 text-sm">
            {[
              ['Complaints', topComplaints, 'text-rose-700'],
              ['Praises', topPraises, 'text-emerald-700'],
            ].map(([label, list, color]) => (
              <div key={label}>
                <h3 className={`mb-2 text-xs font-semibold uppercase tracking-wide ${color}`}>{label}</h3>
                {list.length === 0 ? (
                  <p className="text-slate-500">None.</p>
                ) : (
                  <ol className="list-decimal space-y-1 pl-5">
                    {list.map((t) => (
                      <li key={t.topic}>
                        <span className="font-medium text-slate-900">{t.label}</span>{' '}
                        <span className="text-slate-500">({t.count})</span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            ))}
          </div>
        </Section>

        <Section title={`Reviews needing a reply (${replies.data.total})`}>
          {replies.data.items.length === 0 ? (
            <p className="text-sm text-slate-500">No reviews need a reply.</p>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 text-slate-500">
                <tr>
                  <th className="py-1.5 pr-2 font-medium">Review</th>
                  <th className="py-1.5 pr-2 font-medium">Product</th>
                  <th className="py-1.5 pr-2 font-medium">Summary</th>
                  <th className="py-1.5 font-medium">Reply</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 align-top">
                {replies.data.items.map((r) => (
                  <tr key={r.id} className="break-inside-avoid">
                    <td className="py-1.5 pr-2 font-medium text-slate-900">{r.reviewId}</td>
                    <td className="py-1.5 pr-2 text-slate-600">{r.product}</td>
                    <td className="py-1.5 pr-2 text-slate-700">{r.summary}</td>
                    <td className="py-1.5 text-slate-600">{r.suggestedReply ?? <span className="text-slate-400">Not generated</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {replies.data.total > replies.data.items.length && (
            <p className="text-xs text-slate-500">Showing the first {replies.data.items.length}. Export CSV for all rows.</p>
          )}
        </Section>

        <Section title="Rating agreement">
          <p className="text-sm text-slate-700">
            {ratingAgreement.percentage == null
              ? 'No reviews with a valid rating.'
              : `${formatPercent(ratingAgreement.percentage)} of reviews (${ratingAgreement.agreeing} of ${ratingAgreement.eligible}) have a star rating that matches the AI sentiment; ${ratingAgreement.mismatches} mismatch(es).`}
          </p>
          {ratingAgreement.mismatchReviews.length > 0 && (
            <ul className="space-y-1 text-xs text-slate-600">
              {ratingAgreement.mismatchReviews.map((m) => (
                <li key={m.id}>
                  <span className="font-medium text-slate-900">{m.reviewId}</span> · {m.rating}★ but {m.sentiment} · {m.summary}
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Data quality & AI usage">
          <div className="grid grid-cols-2 gap-6 text-sm">
            <dl className="space-y-1">
              {[
                ['Rows in file', dataQuality.totalRows],
                [ISSUE_LABELS.empty_review, dataQuality.emptyReviews],
                [ISSUE_LABELS.malformed_row, dataQuality.malformedRows],
                ['Duplicates (analysed once)', dataQuality.duplicates],
                ['…of which near-identical', dataQuality.nearDuplicates ?? 0],
                ['Very similar reviews (flagged)', dataQuality.possibleDuplicates ?? 0],
                ['Missing / invalid rating', dataQuality.missingRating + dataQuality.invalidRating],
                ['AI analysis failed', dataQuality.failedAnalyses],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between gap-3 border-b border-slate-100 py-0.5">
                  <dt className="text-slate-600">{label}</dt>
                  <dd className="tabular-nums text-slate-900">{value}</dd>
                </div>
              ))}
            </dl>
            <div className="space-y-1">
              <div className="flex justify-between gap-3 border-b border-slate-100 py-0.5">
                <span className="text-slate-600">Processing time</span>
                <span className="tabular-nums text-slate-900">{formatDuration(usage.processingTimeMs)}</span>
              </div>
              <div className="flex justify-between gap-3 border-b border-slate-100 py-0.5">
                <span className="text-slate-600">Served from cache</span>
                <span className="tabular-nums text-slate-900">{usage.cacheHits}</span>
              </div>
              {(usage.byModel ?? []).map((row) => (
                <div key={`${row.model}-${row.purpose}`} className="flex justify-between gap-3 border-b border-slate-100 py-0.5">
                  <span className="text-slate-600">
                    {row.model} · {PURPOSE_LABELS[row.purpose] ?? row.purpose}
                  </span>
                  <span className="tabular-nums text-slate-900">{row.calls} call(s)</span>
                </div>
              ))}
            </div>
          </div>
        </Section>
      </main>
    </div>
  );
}
