import { useEffect, useRef } from 'react';
import { AlertTriangle, Copy as CopyIcon, X } from 'lucide-react';
import { ISSUE_LABELS } from '../utils/format.js';
import { ReplyPanel } from './ReplyPanel.jsx';
import { RatingStars, SentimentBadge, StatusBadge, TopicChip } from './ui.jsx';

const SOURCE_LABELS = {
  ai: 'Analysed by the AI in this upload',
  cache: 'Reused from the analysis cache (no AI call)',
  duplicate: 'Copied from an identical review in this file (no AI call)',
};

function Field({ label, children }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 text-sm text-slate-800">{children}</dd>
    </div>
  );
}

/**
 * Side panel with everything known about one review. Customer text is rendered
 * as plain text by React (escaped), so "<b>Love it!</b>" shows literally.
 */
export function ReviewDrawer({ review, onClose }) {
  const ref = useRef(null);

  useEffect(() => {
    const dialog = ref.current;
    if (review && dialog && !dialog.open) dialog.showModal?.();
    if (!review && dialog?.open) dialog.close?.();
  }, [review]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby="review-drawer-title"
      className="ml-auto mr-0 h-full max-h-none w-full max-w-xl bg-white p-0 shadow-2xl"
    >
      {review && (
        <div className="flex h-full flex-col">
          <header className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
            <div className="min-w-0">
              <h2 id="review-drawer-title" className="text-base font-semibold text-slate-900">
                Review {review.reviewId}
              </h2>
              <p className="truncate text-sm text-slate-500">{review.product}</p>
            </div>
            <button type="button" onClick={onClose} className="rounded text-slate-400 hover:text-slate-600" aria-label="Close review details">
              <X className="size-5" />
            </button>
          </header>

          <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
            <div className="rounded-lg bg-slate-50 p-4">
              <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-800">
                {review.reviewText || <em className="text-slate-400">(empty review text)</em>}
              </p>
            </div>

            <dl className="grid grid-cols-2 gap-4">
              <Field label="Rating">
                <RatingStars rating={review.rating} raw={review.rawRating} />
              </Field>
              <Field label="Date">{review.date ?? (review.originalDate ? `Invalid: “${review.originalDate}”` : 'Missing')}</Field>
              <Field label="Status">
                <StatusBadge status={review.status} />
              </Field>
              <Field label="Row in file">{review.rowNumber}</Field>
            </dl>

            {review.status === 'analysed' && (
              <section className="space-y-4 border-t border-slate-100 pt-5">
                <h3 className="text-sm font-semibold text-slate-900">AI analysis</h3>
                <dl className="grid grid-cols-2 gap-4">
                  <Field label="Sentiment">
                    <SentimentBadge sentiment={review.sentiment} />
                  </Field>
                  <Field label="Needs reply">{review.needsReply ? 'Yes' : 'No'}</Field>
                  <div className="col-span-2">
                    <Field label="Topics">
                      <span className="flex flex-wrap gap-1">
                        {review.topics.map((t) => (
                          <TopicChip key={t} topic={t} />
                        ))}
                      </span>
                    </Field>
                  </div>
                  <div className="col-span-2">
                    <Field label="Summary">{review.summary}</Field>
                  </div>
                  <div className="col-span-2">
                    <Field label="Source">{SOURCE_LABELS[review.analysisSource] ?? '—'}</Field>
                  </div>
                  <div className="col-span-2">
                    <Field label="AI model">
                      {review.analysisModel ? (
                        <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{review.analysisModel}</code>
                      ) : (
                        <span className="text-slate-500">Not recorded (analysed before model tracking)</span>
                      )}
                    </Field>
                  </div>
                </dl>
                {review.ratingMismatch && (
                  <p className="flex gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
                    <AlertTriangle className="size-4 shrink-0" aria-hidden />
                    Rating mismatch: {review.rating}★ suggests a different sentiment than the text, which reads as {review.sentiment}.
                  </p>
                )}
              </section>
            )}

            {review.status === 'analysis_failed' && (
              <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">
                <span className="font-medium">Analysis failed:</span> {review.failureReason}
              </p>
            )}

            {(review.isDuplicate || review.dataIssues.length > 0) && (
              <section className="space-y-2 border-t border-slate-100 pt-5">
                <h3 className="text-sm font-semibold text-slate-900">Data quality</h3>
                <ul className="space-y-1 text-sm text-slate-600">
                  {review.isDuplicate && (
                    <li className="flex items-center gap-2">
                      <CopyIcon className="size-4 text-slate-400" aria-hidden />
                      {review.dataIssues.includes('near_duplicate')
                        ? `Near-identical to ${review.duplicateOf} (only case or punctuation differ); analysed once and counted once.`
                        : `Same text as ${review.duplicateOf}; counted once in statistics.`}
                    </li>
                  )}
                  {review.similarTo && (
                    <li className="flex items-center gap-2">
                      <CopyIcon className="size-4 text-amber-500" aria-hidden />
                      {Math.round((review.similarity ?? 0) * 100)}% similar to {review.similarTo}; possibly the same customer posting twice. Still analysed and counted separately.
                    </li>
                  )}
                  {review.dataIssues
                    .filter((issue) => issue !== 'near_duplicate' && issue !== 'possible_duplicate')
                    .map((issue) => (
                    <li key={issue} className="flex items-center gap-2">
                      <AlertTriangle className="size-4 text-amber-500" aria-hidden />
                      {ISSUE_LABELS[issue] ?? issue}
                      {issue === 'invalid_rating' && review.rawRating ? ` (“${review.rawRating}”)` : ''}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {review.status === 'analysed' && review.needsReply && <ReplyPanel key={review.id} review={review} />}
          </div>
        </div>
      )}
    </dialog>
  );
}
