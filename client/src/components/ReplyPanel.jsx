import { useState } from 'react';
import { Check, Copy, RefreshCw, Sparkles } from 'lucide-react';
import { useGenerateReply } from '../hooks/queries.js';
import { Button } from './ui.jsx';

/**
 * Suggested reply for a review marked needs_reply. Nothing is generated until
 * the user clicks; an existing stored reply is shown (and reused) instead.
 */
export function ReplyPanel({ review }) {
  const mutation = useGenerateReply();
  const [reply, setReply] = useState(review.suggestedReply);
  const [copied, setCopied] = useState(false);

  const generate = (regenerate = false) =>
    mutation.mutate(
      { reviewId: review.id, regenerate },
      {
        onSuccess: (data) => {
          setReply(data.reply);
          setCopied(false);
        },
      },
    );

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(reply);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="rounded-xl border border-brand-100 bg-brand-50/50 p-4">
      <div className="mb-2 flex items-center gap-2">
        <Sparkles className="size-4 text-brand-600" aria-hidden />
        <h3 className="text-sm font-semibold text-slate-900">Suggested reply</h3>
      </div>

      {reply ? (
        <>
          <p className="whitespace-pre-wrap rounded-lg bg-white p-3 text-sm leading-relaxed text-slate-700 ring-1 ring-slate-200" aria-live="polite">
            {reply}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" icon={copied ? Check : Copy} onClick={copy}>
              {copied ? 'Copied' : 'Copy reply'}
            </Button>
            <Button size="sm" variant="secondary" icon={RefreshCw} loading={mutation.isPending} onClick={() => generate(true)}>
              Regenerate
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="mb-3 text-sm text-slate-600">
            Generate an empathetic, concise reply that addresses this customer’s issue without promising refunds or replacements.
          </p>
          <Button size="sm" icon={Sparkles} loading={mutation.isPending} onClick={() => generate(false)}>
            {mutation.isPending ? 'Generating…' : 'Generate reply'}
          </Button>
        </>
      )}

      {mutation.isError && (
        <p role="alert" className="mt-3 text-sm text-rose-700">
          {mutation.error.message}
        </p>
      )}
    </div>
  );
}
