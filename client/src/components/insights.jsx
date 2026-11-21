import { Link } from 'react-router';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { ArrowRight, ThumbsDown, ThumbsUp } from 'lucide-react';
import { CHART, SENTIMENT_STYLES, formatPercent } from '../utils/format.js';
import { usePrefersReducedMotion } from '../utils/motion.js';
import { Card, EmptyState } from './ui.jsx';
import { Contours, WaveLines } from './waves.jsx';

/**
 * Metric card surfaces. Tones keep their old names (callers pass the meaning) and map
 * onto the three brand surfaces: white/cream, deep navy and sunset orange.
 */
const STAT_TONES = {
  brand: { card: 'border-slate-200 bg-white text-slate-900', label: 'text-slate-600', hint: 'text-slate-500', icon: 'text-slate-400', wave: 'text-brand-300' },
  neutral: { card: 'border-slate-200 bg-white text-slate-900', label: 'text-slate-600', hint: 'text-slate-500', icon: 'text-slate-400', wave: 'text-slate-300' },
  positive: { card: 'on-navy border-navy-800 bg-navy-900 text-cream', label: 'text-navy-100', hint: 'text-navy-200', icon: 'text-navy-300', wave: 'text-brand-300' },
  negative: { card: 'border-brand-400 bg-brand-300 text-navy-900', label: 'text-navy-900', hint: 'text-navy-800', icon: 'text-navy-700', wave: 'text-navy-900' },
  warning: { card: 'border-brand-100 bg-cream text-slate-900', label: 'text-slate-600', hint: 'text-slate-500', icon: 'text-brand-600', wave: 'text-brand-500' },
};

export function StatCard({ label, value, hint, icon: Icon, tone = 'brand' }) {
  const t = STAT_TONES[tone] ?? STAT_TONES.brand;
  return (
    <div className={`relative min-h-32 overflow-hidden rounded-2xl border p-5 pb-12 shadow-sm ${t.card}`}>
      <WaveLines className={t.wave} />
      <div className="relative flex items-start justify-between gap-2">
        <p className={`text-sm font-medium ${t.label}`}>{label}</p>
        {Icon && <Icon className={`size-4 shrink-0 ${t.icon}`} strokeWidth={1.75} aria-hidden />}
      </div>
      <p className="display relative mt-2 text-4xl tabular-nums sm:text-5xl">{value}</p>
      {hint && <p className={`relative mt-1.5 text-xs leading-snug ${t.hint}`}>{hint}</p>}
    </div>
  );
}

/** Tooltip styling shared by every Recharts chart. */
export const CHART_TOOLTIP = {
  contentStyle: {
    background: '#172b4d',
    border: 'none',
    borderRadius: 10,
    color: '#fff5e5',
    fontFamily: CHART.font,
    fontSize: 13,
    boxShadow: '0 12px 28px -12px rgb(15 30 56 / 0.5)',
  },
  itemStyle: { color: '#fff5e5' },
  labelStyle: { color: '#f5bd76', fontWeight: 600 },
};

/** Donut chart of the sentiment split with counts and percentages. */
export function SentimentChart({ sentiment, total }) {
  const reducedMotion = usePrefersReducedMotion();
  if (total === 0) return <EmptyState title="No analysed reviews yet" description="The chart fills in as reviews are analysed." />;
  const data = sentiment.filter((s) => s.count > 0);
  return (
    <div className="flex flex-col items-center gap-8 sm:flex-row">
      <div className="relative size-48 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="count"
              nameKey="sentiment"
              innerRadius="64%"
              outerRadius="100%"
              paddingAngle={2}
              cornerRadius={4}
              strokeWidth={0}
              isAnimationActive={!reducedMotion}
              animationDuration={700}
            >
              {data.map((s) => (
                <Cell key={s.sentiment} fill={SENTIMENT_STYLES[s.sentiment].color} />
              ))}
            </Pie>
            <Tooltip {...CHART_TOOLTIP} formatter={(value, name) => [`${value} reviews`, SENTIMENT_STYLES[name].label]} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="display text-5xl text-navy-900">{total}</span>
          <span className="mt-1 text-xs font-medium text-slate-500">reviews</span>
        </div>
      </div>
      <ul className="w-full space-y-4">
        {sentiment.map((s) => (
          <li key={s.sentiment}>
            <div className="mb-1.5 flex items-baseline justify-between gap-3">
              <span className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <span className="size-2.5 rounded-sm" style={{ backgroundColor: SENTIMENT_STYLES[s.sentiment].color }} aria-hidden />
                {SENTIMENT_STYLES[s.sentiment].label}
              </span>
              <span className="tabular-nums text-slate-900">
                <span className="display text-xl">{s.count}</span>
                <span className="ml-2 text-sm text-slate-500">{formatPercent(s.percentage)}</span>
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full origin-left rounded-full transition-transform duration-500 ease-[var(--ease-brand)]"
                style={{ width: `${s.percentage}%`, backgroundColor: SENTIMENT_STYLES[s.sentiment].color }}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Top complaints (negative) or praises (positive) as navy insight panels.
 * Complaints carry the sunset accent, praises the cream/sky accent, so the two read apart.
 * Every item is backed by the real review summaries it was computed from.
 */
export function ThemeList({ kind, themes, productFilter }) {
  const isComplaint = kind === 'complaints';
  const Icon = isComplaint ? ThumbsDown : ThumbsUp;
  const accent = isComplaint
    ? { number: 'text-brand-300', rule: 'border-brand-300/60', link: 'text-brand-300 hover:text-brand-200', icon: 'text-brand-300' }
    : { number: 'text-navy-200', rule: 'border-navy-300/60', link: 'text-cream hover:text-brand-200', icon: 'text-navy-200' };

  return (
    <section
      className={`on-navy relative overflow-hidden rounded-2xl border p-5 text-cream shadow-sm sm:p-6 ${
        isComplaint ? 'border-navy-800 bg-navy-900' : 'border-navy-600 bg-navy-700'
      }`}
    >
      <Contours className={isComplaint ? 'text-brand-300' : 'text-cream'} />
      <header className="relative mb-5 flex items-start justify-between gap-3">
        <div>
          <p className={`eyebrow ${accent.number}`}>{isComplaint ? 'What hurts' : 'What delights'}</p>
          <h2 className="display mt-1 text-3xl uppercase">{isComplaint ? 'Top complaints' : 'Top praises'}</h2>
          <p className="mt-1.5 text-sm text-navy-100">
            Most frequent topics in {isComplaint ? 'negative' : 'positive'} reviews, counted once per unique review
          </p>
        </div>
        <Icon className={`mt-1 size-5 shrink-0 ${accent.icon}`} strokeWidth={1.75} aria-hidden />
      </header>

      {themes.length === 0 ? (
        <p className="relative rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-navy-100">
          No {isComplaint ? 'complaints' : 'praises'} found. Nothing in the analysed reviews supports one yet.
        </p>
      ) : (
        <ol className="relative space-y-5">
          {themes.map((theme, index) => {
            const params = new URLSearchParams({ topic: theme.topic, sentiment: isComplaint ? 'negative' : 'positive' });
            if (productFilter) params.set('product', productFilter);
            return (
              <li key={theme.topic} className="flex gap-4">
                <span className={`display w-8 shrink-0 text-4xl leading-none ${accent.number}`}>{String(index + 1).padStart(2, '0')}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <p className="text-base font-semibold text-cream">{theme.label}</p>
                    <p className="text-xs font-medium tabular-nums text-navy-200">
                      {theme.count} review{theme.count === 1 ? '' : 's'}
                    </p>
                  </div>
                  {!productFilter && (
                    <p className="mt-0.5 text-xs text-navy-200">{theme.products.map((p) => `${p.name} (${p.count})`).join(' · ')}</p>
                  )}
                  <ul className="mt-2 space-y-1.5">
                    {theme.evidence.map((e) => (
                      <li key={e.reviewId} className={`border-l-2 pl-3 text-sm leading-relaxed text-navy-50 ${accent.rule}`}>
                        “{e.summary}” <span className="text-xs text-navy-200">— {e.reviewId}</span>
                      </li>
                    ))}
                  </ul>
                  <Link to={`/reviews?${params}`} className={`mt-2 inline-flex items-center gap-1 text-xs font-semibold transition-colors ${accent.link}`}>
                    View these reviews <ArrowRight className="size-3" aria-hidden />
                  </Link>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

export function RatingAgreementCard({ agreement, compact = false }) {
  return (
    <Card
      title="Rating agreement"
      description="Do star ratings match the AI sentiment? 1–2★ negative, 3★ neutral, 4–5★ positive"
      decoration={<WaveLines className="text-brand-300" />}
    >
      {agreement.percentage == null ? (
        <EmptyState title="Not enough data" description="Needs analysed reviews that have a valid star rating." />
      ) : (
        <div className="pb-10">
          <p className="display text-6xl tabular-nums text-navy-900">{formatPercent(agreement.percentage)}</p>
          <div className="mt-3 flex h-2 gap-0.5 overflow-hidden rounded-full bg-slate-100" aria-hidden>
            <div className="bg-navy-700" style={{ width: `${agreement.percentage}%` }} />
            <div className="bg-brand-400" style={{ width: `${100 - agreement.percentage}%` }} />
          </div>
          <p className="mt-3 text-sm text-slate-700">
            <span className="font-semibold text-navy-800">{agreement.agreeing}</span> of {agreement.eligible} reviews agree ·{' '}
            <span className="font-semibold text-brand-700">{agreement.mismatches}</span> mismatch{agreement.mismatches === 1 ? '' : 'es'}
          </p>
          <p className="mt-1 text-xs text-slate-500">{agreement.excludedNoRating} review(s) without a valid rating excluded.</p>
          {!compact && agreement.mismatches > 0 && (
            <Link to="/reviews?mismatch=true" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-brand-600 hover:text-brand-700">
              View mismatched reviews <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          )}
        </div>
      )}
    </Card>
  );
}
