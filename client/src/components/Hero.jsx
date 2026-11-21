/**
 * Editorial page introduction: a tall condensed headline with one sunset-highlighted
 * line, a short description, and a small sunset-over-water illustration that lives
 * inside the card (never behind the page).
 */
function SunsetIllustration() {
  return (
    <svg aria-hidden focusable="false" viewBox="0 0 320 200" fill="none" className="h-full w-full" preserveAspectRatio="xMidYMax slice">
      <circle cx="196" cy="118" r="58" className="fill-brand-300" />
      <circle cx="196" cy="118" r="78" className="stroke-brand-300" strokeOpacity="0.35" strokeWidth="1.25" />
      <circle cx="196" cy="118" r="98" className="stroke-brand-300" strokeOpacity="0.18" strokeWidth="1.25" />
      {/* Sea: layered bands from deep navy at the bottom to ocean navy at the horizon */}
      <path d="M0 122 C 40 112, 80 132, 120 122 S 200 112, 240 122 S 300 132, 320 120 V200 H0Z" className="fill-navy-700" />
      <path d="M0 146 C 45 136, 85 156, 130 146 S 210 136, 255 146 S 305 154, 320 144 V200 H0Z" className="fill-navy-800" />
      <path d="M0 170 C 50 160, 90 180, 140 170 S 220 160, 265 170 S 310 178, 320 168 V200 H0Z" className="fill-navy-900" />
      {/* Sun glints on the water */}
      {[132, 140, 156].map((y, i) => (
        <path key={y} d={`M${170 + i * 6} ${y} h${52 - i * 12}`} className="stroke-brand-300" strokeWidth="2" strokeLinecap="round" strokeOpacity={0.8 - i * 0.2} />
      ))}
    </svg>
  );
}

export function Hero({ eyebrow, title, highlight, description, meta, actions, compact = false }) {
  return (
    <section className="relative overflow-hidden rounded-2xl border border-brand-100 bg-cream shadow-sm">
      <div className="grid md:grid-cols-[minmax(0,1fr)_minmax(0,18rem)] lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <div className={`relative z-10 flex flex-col justify-center gap-4 p-6 sm:p-8 ${compact ? 'lg:py-8' : 'lg:py-10'}`}>
          {eyebrow && <p className="eyebrow text-brand-700">{eyebrow}</p>}
          <h1 className={`display uppercase text-navy-900 ${compact ? 'text-4xl sm:text-5xl' : 'text-5xl sm:text-6xl lg:text-7xl'}`}>
            {title}
            {highlight && (
              <>
                <br />
                <span className="text-brand-500">{highlight}</span>
              </>
            )}
          </h1>
          {description && <p className="max-w-xl text-base leading-relaxed text-slate-600">{description}</p>}
          {(meta || actions) && (
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3 pt-1">
              {actions}
              {meta && <div className="text-sm text-slate-500">{meta}</div>}
            </div>
          )}
        </div>
        <div className="relative hidden min-h-48 md:block">
          <SunsetIllustration />
        </div>
      </div>
    </section>
  );
}
