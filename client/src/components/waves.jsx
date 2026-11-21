/**
 * Wave primitives — the ReviewLens signature detail.
 *
 * All shapes are inline SVG drawn with `currentColor`, so a parent's text colour
 * sets their tone. Every one is decorative: aria-hidden, pointer-events-none, and
 * placed behind content so it never covers text, charts or controls.
 */

const WAVELENGTH = 120;
const STRIP_WIDTH = 2400; // wider than any card, so drifting by one wavelength never shows an edge

/** A horizontal sine-like line built from smooth quadratic segments. */
function wavePath({ y, amplitude, wavelength = WAVELENGTH, width = STRIP_WIDTH, phase = 0 }) {
  const half = wavelength / 2;
  let d = `M ${-wavelength + phase} ${y}`;
  for (let x = -wavelength + phase, up = true; x < width + wavelength; x += half, up = !up) {
    d += ` Q ${x + half / 2} ${y + (up ? -amplitude : amplitude)} ${x + half} ${y}`;
  }
  return d;
}

const LINE_SETS = {
  // Three fine contour lines, used along the bottom edge of cards.
  card: [
    { y: 18, amplitude: 5, opacity: 0.55, phase: 0 },
    { y: 28, amplitude: 6, opacity: 0.35, phase: 30 },
    { y: 38, amplitude: 7, opacity: 0.2, phase: 60 },
  ],
  // Bolder set for the hero.
  hero: [
    { y: 16, amplitude: 7, opacity: 0.9, phase: 0 },
    { y: 30, amplitude: 8, opacity: 0.55, phase: 40 },
    { y: 44, amplitude: 9, opacity: 0.3, phase: 80 },
  ],
};

/**
 * Contour lines along the bottom edge of a container (which must be `relative overflow-hidden`).
 * `drift` adds a very slow sideways movement (disabled for reduced motion by the global CSS).
 */
export function WaveLines({ variant = 'card', drift = false, className = '' }) {
  const lines = LINE_SETS[variant] ?? LINE_SETS.card;
  return (
    <div aria-hidden className={`pointer-events-none absolute inset-x-0 bottom-0 h-12 overflow-hidden ${className}`}>
      <svg
        width={STRIP_WIDTH}
        height="48"
        viewBox={`0 0 ${STRIP_WIDTH} 48`}
        fill="none"
        className={drift ? 'animate-drift' : undefined}
        focusable="false"
      >
        {lines.map((line) => (
          <path key={line.y} d={wavePath(line)} stroke="currentColor" strokeWidth="1.25" strokeOpacity={line.opacity} />
        ))}
      </svg>
    </div>
  );
}

/** Fine concentric arcs tucked into a corner, for navy insight panels. */
export function Contours({ className = '' }) {
  return (
    <svg
      aria-hidden
      focusable="false"
      viewBox="0 0 160 160"
      fill="none"
      className={`pointer-events-none absolute -right-10 -top-10 size-40 ${className}`}
    >
      {[28, 44, 60, 76, 92].map((r, i) => (
        <circle key={r} cx="120" cy="40" r={r} stroke="currentColor" strokeWidth="1" strokeOpacity={0.22 - i * 0.035} />
      ))}
    </svg>
  );
}

/** A thin organic divider between page sections: one navy line, one amber line. */
export function WaveDivider({ className = '' }) {
  return (
    <div aria-hidden className={`pointer-events-none h-6 overflow-hidden ${className}`}>
      <svg viewBox="0 0 1200 24" preserveAspectRatio="none" className="h-full w-full" fill="none" focusable="false">
        <path
          d="M0 12 C 150 2, 300 22, 450 12 S 750 2, 900 12 S 1100 20, 1200 10"
          className="stroke-navy-300"
          strokeWidth="1.25"
          vectorEffect="non-scaling-stroke"
        />
        <path
          d="M0 16 C 160 8, 310 24, 470 16 S 760 8, 920 16 S 1110 22, 1200 15"
          className="stroke-brand-400"
          strokeWidth="1.25"
          strokeOpacity="0.7"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
}

/** Small abstract illustration for empty states: a low sun over three waves. */
export function WaveMark({ className = '' }) {
  return (
    <svg aria-hidden focusable="false" viewBox="0 0 72 48" fill="none" className={`h-12 w-18 ${className}`}>
      <path d="M22 26 a14 14 0 0 1 28 0 Z" className="fill-brand-300" />
      {[30, 37, 44].map((y, i) => (
        <path
          key={y}
          d={`M4 ${y} q 8 -5 16 0 t 16 0 t 16 0 t 16 0`}
          className="stroke-navy-700"
          strokeWidth="2"
          strokeLinecap="round"
          strokeOpacity={1 - i * 0.3}
        />
      ))}
    </svg>
  );
}

/** The logo glyph: a sunset half-disc resting on a wave, flat colours only. */
export function LogoMark({ className = '' }) {
  return (
    <svg aria-hidden focusable="false" viewBox="0 0 32 32" className={`size-8 ${className}`}>
      <rect width="32" height="32" rx="8" className="fill-navy-900" />
      <path d="M9 18 a7 7 0 0 1 14 0 Z" className="fill-brand-300" />
      <path d="M5 21.5 q 3.5 -3 7 0 t 7 0 t 7 0" fill="none" className="stroke-cream" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}
