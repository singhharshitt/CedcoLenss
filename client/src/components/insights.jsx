import { Link } from 'react-router';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { ArrowRight, ThumbsDown, ThumbsUp } from 'lucide-react';
import { SENTIMENT_STYLES, formatPercent } from '../utils/format.js';
import { Card, EmptyState } from './ui.jsx';

export function StatCard({ label, value, hint, icon: Icon, tone = 'brand' }) {
  const tones = {
    brand: 'bg-brand-50 text-brand-600',
    positive: 'bg-emerald-50 text-emerald-600',
    neutral: 'bg-slate-100 text-slate-500',
    negative: 'bg-rose-50 text-rose-600',
    warning: 'bg-amber-50 text-amber-600',
  };
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
        {Icon && (
          <span className={`rounded-lg p-1.5 ${tones[tone]}`}>
            <Icon className="size-4" aria-hidden />
          </span>
        )}
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-slate-900">{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

/** Donut chart of the sentiment split with counts and percentages. */
export function SentimentChart({ sentiment, total }) {
  if (total === 0) return <EmptyState title="No analysed reviews yet" description="The chart fills in as reviews are analysed." />;
  const data = sentiment.filter((s) => s.count > 0);
  return (
    <div className="flex flex-col items-center gap-6 sm:flex-row">
      <div className="relative size-44 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="count" nameKey="sentiment" innerRadius="62%" outerRadius="100%" paddingAngle={2} strokeWidth={0}>
              {data.map((s) => (
                <Cell key={s.sentiment} fill={SENTIMENT_STYLES[s.sentiment].color} />
              ))}
            </Pie>
            <Tooltip formatter={(value, name) => [`${value} reviews`, SENTIMENT_STYLES[name].label]} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-semibold text-slate-900">{total}</span>
          <span className="text-xs text-slate-500">reviews</span>
        </div>
      </div>
      <ul className="w-full space-y-3">
        {sentiment.map((s) => (
          <li key={s.sentiment}>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 text-slate-700">
                <span className="size-2.5 rounded-full" style={{ backgroundColor: SENTIMENT_STYLES[s.sentiment].color }} aria-hidden />
                {SENTIMENT_STYLES[s.sentiment].label}
              </span>
              <span className="tabular-nums text-slate-900">
                <span className="font-semibold">{s.count}</span>
                <span className="ml-1.5 text-slate-500">({formatPercent(s.percentage)})</span>
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full" style={{ width: `${s.percentage}%`, backgroundColor: SENTIMENT_STYLES[s.sentiment].color }} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Top complaints (negative) or praises (positive). Every item is backed by the
 * real review summaries it was computed from.
 */
export function ThemeList({ kind, themes, productFilter }) {
  const isComplaint = kind === 'complaints';
  const Icon = isComplaint ? ThumbsDown : ThumbsUp;
  const accent = isComplaint ? 'text-rose-600 bg-rose-50' : 'text-emerald-600 bg-emerald-50';

  return (
    <Card
      title={isComplaint ? 'Top complaints' : 'Top praises'}
      description={`Most frequent topics in ${isComplaint ? 'negative' : 'positive'} reviews, counted once per unique review`}
    >
      {themes.length === 0 ? (
        <EmptyState icon={Icon} title={`No ${isComplaint ? 'complaints' : 'praises'} found`} description="Nothing in the analysed reviews supports one yet." />
      ) : (
        <ol className="space-y-4">
          {themes.map((theme, index) => {
            const params = new URLSearchParams({ topic: theme.topic, sentiment: isComplaint ? 'negative' : 'positive' });
            if (productFilter) params.set('product', productFilter);
            return (
              <li key={theme.topic} className="flex gap-3">
                <span className={`flex size-7 shrink-0 items-center justify-center rounded-lg text-sm font-semibold ${accent}`}>{index + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                    <p className="font-medium text-slate-900">{theme.label}</p>
                    <p className="text-xs text-slate-500">
                      {theme.count} review{theme.count === 1 ? '' : 's'}
                    </p>
                  </div>
                  {!productFilter && (
                    <p className="mt-0.5 text-xs text-slate-500">
                      {theme.products.map((p) => `${p.name} (${p.count})`).join(' · ')}
                    </p>
                  )}
                  <ul className="mt-2 space-y-1">
                    {theme.evidence.map((e) => (
                      <li key={e.reviewId} className="border-l-2 border-slate-200 pl-2 text-sm text-slate-600">
                        “{e.summary}” <span className="text-xs text-slate-400">— {e.reviewId}</span>
                      </li>
                    ))}
                  </ul>
                  <Link to={`/reviews?${params}`} className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700">
                    View these reviews <ArrowRight className="size-3" aria-hidden />
                  </Link>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}

export function RatingAgreementCard({ agreement, compact = false }) {
  return (
    <Card title="Rating agreement" description="Do star ratings match the AI sentiment? 1–2★ negative, 3★ neutral, 4–5★ positive">
      {agreement.percentage == null ? (
        <EmptyState title="Not enough data" description="Needs analysed reviews that have a valid star rating." />
      ) : (
        <div>
          <p className="text-3xl font-semibold tabular-nums text-slate-900">{formatPercent(agreement.percentage)}</p>
          <p className="mt-1 text-sm text-slate-600">
            {agreement.agreeing} of {agreement.eligible} reviews agree · {agreement.mismatches} mismatch
            {agreement.mismatches === 1 ? '' : 'es'}
          </p>
          <p className="mt-1 text-xs text-slate-500">{agreement.excludedNoRating} review(s) without a valid rating excluded.</p>
          {!compact && agreement.mismatches > 0 && (
            <Link to="/reviews?mismatch=true" className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700">
              View mismatched reviews <ArrowRight className="size-3" aria-hidden />
            </Link>
          )}
        </div>
      )}
    </Card>
  );
}
