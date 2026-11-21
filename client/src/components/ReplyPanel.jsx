import { useState } from 'react';
import { Check, Copy, Pencil, RefreshCw, Save, Sparkles, X } from 'lucide-react';
import { useGenerateReply, useSaveReply } from '../hooks/queries.js';
import { Button } from './ui.jsx';

const MAX_REPLY_LENGTH = 2000;

/**
 * Suggested reply for a review marked needs_reply. Nothing is generated until
 * the user clicks; an existing stored reply is shown (and reused) instead.
 * The owner can edit the text; edits are saved on the server and survive a refresh.
 */
export function ReplyPanel({ review }) {
  const generateMutation = useGenerateReply();
  const saveMutation = useSaveReply();
  const [reply, setReply] = useState(review.suggestedReply);
  const [edited, setEdited] = useState(review.replyEdited);
  const [draft, setDraft] = useState(null); // null = not editing
  const [copied, setCopied] = useState(false);

  const editing = draft !== null;
  const trimmedDraft = draft?.trim() ?? '';
  const error = generateMutation.error ?? saveMutation.error;

  const generate = (regenerate = false) => {
    if (regenerate && edited && !window.confirm('Regenerating replaces your edited reply. Continue?')) return;
    generateMutation.mutate(
      { reviewId: review.id, regenerate },
      {
        onSuccess: (data) => {
          setReply(data.reply);
          setEdited(Boolean(data.edited));
          setDraft(null);
          setCopied(false);
        },
      },
    );
  };

  const save = () =>
    saveMutation.mutate(
      { reviewId: review.id, reply: trimmedDraft },
      {
        onSuccess: (data) => {
          setReply(data.reply);
          setEdited(true);
          setDraft(null);
          setCopied(false);
        },
      },
    );

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(editing ? draft : reply);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="relative overflow-hidden rounded-2xl border border-navy-100 bg-white p-5 shadow-sm">
      <div className="mb-2 flex items-center gap-2">
        <Sparkles className="size-4 text-brand-500" aria-hidden />
        <h3 className="font-display text-lg font-semibold uppercase tracking-wide text-navy-900">Suggested reply</h3>
        {reply && edited && !editing && (
          <span className="rounded-md bg-brand-100 px-2 py-0.5 text-xs font-semibold text-brand-800">Edited by you</span>
        )}
      </div>

      {editing ? (
        <>
          <label htmlFor={`reply-${review.id}`} className="sr-only">
            Edit reply
          </label>
          <textarea
            id={`reply-${review.id}`}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={MAX_REPLY_LENGTH}
            rows={6}
            autoFocus
            className="w-full resize-y rounded-xl bg-cream p-4 text-sm leading-relaxed text-slate-900 ring-1 ring-brand-200 transition-shadow focus:outline-none focus:ring-2 focus:ring-navy-600"
          />
          <div className="mt-1 text-right text-xs tabular-nums text-slate-500">
            {draft.length}/{MAX_REPLY_LENGTH}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" icon={Save} loading={saveMutation.isPending} disabled={trimmedDraft === ''} onClick={save}>
              Save reply
            </Button>
            <Button size="sm" variant="secondary" icon={copied ? Check : Copy} onClick={copy} disabled={trimmedDraft === ''}>
              {copied ? 'Copied' : 'Copy'}
            </Button>
            <Button size="sm" variant="ghost" icon={X} onClick={() => setDraft(null)}>
              Cancel
            </Button>
          </div>
        </>
      ) : reply ? (
        <>
          <p className="whitespace-pre-wrap rounded-xl border-l-4 border-navy-700 bg-navy-50 p-4 text-sm leading-relaxed text-slate-900" aria-live="polite">
            {reply}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" icon={copied ? Check : Copy} onClick={copy}>
              {copied ? 'Copied' : 'Copy reply'}
            </Button>
            <Button size="sm" variant="secondary" icon={Pencil} onClick={() => setDraft(reply)}>
              Edit
            </Button>
            <Button size="sm" variant="secondary" icon={RefreshCw} loading={generateMutation.isPending} onClick={() => generate(true)}>
              Regenerate
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="mb-3 text-sm text-slate-600">
            Generate an empathetic, concise reply that addresses this customer’s issue without promising refunds or replacements.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" icon={Sparkles} loading={generateMutation.isPending} onClick={() => generate(false)}>
              {generateMutation.isPending ? 'Generating…' : 'Generate reply'}
            </Button>
            <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setDraft('')}>
              Write my own
            </Button>
          </div>
        </>
      )}

      {error && (
        <p role="alert" className="mt-3 text-sm text-rose-700">
          {error.message}
        </p>
      )}
    </div>
  );
}
