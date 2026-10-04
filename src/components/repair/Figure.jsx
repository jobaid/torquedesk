// Simple, theme-aware line illustrations used inside procedure steps.
const stroke = 'var(--text-2)'
const accent = 'var(--brand)'
const warn = 'var(--warning)'

const FIGS = {
  lift: {
    caption: 'Lift points: front and rear pinch welds (marked ▲).',
    svg: (
      <>
        <path d="M40 110 h40 l20 -30 h120 l30 30 h50 v25 h-260z" fill="none" stroke={stroke} strokeWidth="2.5" strokeLinejoin="round" />
        <circle cx="90" cy="138" r="16" fill="none" stroke={stroke} strokeWidth="2.5" />
        <circle cx="250" cy="138" r="16" fill="none" stroke={stroke} strokeWidth="2.5" />
        <path d="M118 150 l8 -12 l8 12z M206 150 l8 -12 l8 12z" fill={accent} />
        <path d="M126 152 v20 M214 152 v20 M110 172 h32 M198 172 h32" stroke={accent} strokeWidth="3" />
      </>
    ),
  },
  wheel: {
    caption: 'Star (crisscross) tightening sequence — 1 → 5.',
    svg: (
      <>
        <circle cx="170" cy="100" r="70" fill="none" stroke={stroke} strokeWidth="2.5" />
        <circle cx="170" cy="100" r="22" fill="none" stroke={stroke} strokeWidth="2" />
        {[0, 1, 2, 3, 4].map((i) => {
          const order = [0, 2, 4, 1, 3]
          const a = (-90 + order[i] * 72) * (Math.PI / 180)
          const x = 170 + 45 * Math.cos(a), y = 100 + 45 * Math.sin(a)
          return (
            <g key={i}>
              <circle cx={x} cy={y} r="11" fill={accent} />
              <text x={x} y={y + 4} textAnchor="middle" fontSize="12" fontWeight="700" fill="var(--on-brand)">{i + 1}</text>
            </g>
          )
        })}
      </>
    ),
  },
  caliper: {
    caption: 'Caliper assembly: guide pin bolts (A), bracket bolts (B).',
    svg: (
      <>
        <circle cx="140" cy="100" r="72" fill="none" stroke={stroke} strokeWidth="2.5" />
        <circle cx="140" cy="100" r="30" fill="none" stroke={stroke} strokeWidth="2" />
        <path d="M195 45 q45 55 0 110 h45 q30 -55 0 -110z" fill="var(--brand-soft)" stroke={accent} strokeWidth="2.5" />
        <circle cx="232" cy="58" r="7" fill={warn} /><text x="248" y="62" fontSize="13" fontWeight="700" fill="var(--text)">A</text>
        <circle cx="232" cy="142" r="7" fill={warn} /><text x="248" y="146" fontSize="13" fontWeight="700" fill="var(--text)">A</text>
        <circle cx="205" cy="30" r="6" fill={stroke} /><text x="215" y="25" fontSize="13" fontWeight="700" fill="var(--text)">B</text>
        <circle cx="205" cy="170" r="6" fill={stroke} /><text x="215" y="182" fontSize="13" fontWeight="700" fill="var(--text)">B</text>
      </>
    ),
  },
  belt: {
    caption: 'Accessory drive belt routing. T = tensioner.',
    svg: (
      <>
        {[[80, 60, 26, 'ALT'], [240, 55, 22, 'A/C'], [170, 150, 34, 'CRK'], [70, 145, 18, 'T'], [260, 140, 22, 'WP']].map(([x, y, r, l]) => (
          <g key={l}>
            <circle cx={x} cy={y} r={r} fill="var(--surface-2)" stroke={stroke} strokeWidth="2" />
            <text x={x} y={y + 4} textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--text-2)">{l}</text>
          </g>
        ))}
        <path d="M54 60 Q50 20 80 34 L240 33 Q262 33 262 55 L282 140 Q282 168 260 162 L204 150 Q200 186 170 184 Q136 184 136 150 L88 145 Q52 150 52 120z" fill="none" stroke={accent} strokeWidth="4" strokeLinejoin="round" />
      </>
    ),
  },
  connector: {
    caption: 'Release the locking tab before pulling. Never pull on the wires.',
    svg: (
      <>
        <rect x="60" y="60" width="110" height="80" rx="10" fill="var(--surface-2)" stroke={stroke} strokeWidth="2.5" />
        <rect x="170" y="70" width="90" height="60" rx="8" fill="var(--brand-soft)" stroke={accent} strokeWidth="2.5" />
        <path d="M195 70 v-16 h30 v16" fill="none" stroke={warn} strokeWidth="3" />
        <path d="M210 40 v-14 M202 34 l8 -8 l8 8" stroke={warn} strokeWidth="2.5" fill="none" />
        {[85, 105, 125, 145].map((x) => <rect key={x} x={x - 5} y="88" width="10" height="24" rx="2" fill={stroke} />)}
        {[0, 1, 2].map((i) => <path key={i} d={`M260 ${85 + i * 15} h60`} stroke={['#dc2626', '#16a34a', '#2563eb'][i]} strokeWidth="4" />)}
        <text x="210" y="160" textAnchor="middle" fontSize="12" fill="var(--text-2)">Press tab, then separate</text>
      </>
    ),
  },
  door: {
    caption: 'Door trim panel fasteners: screws (●) and clip locations (○).',
    svg: (
      <>
        <path d="M40 40 h260 v130 q0 10 -10 10 h-240 q-10 0 -10 -10z" fill="var(--surface-2)" stroke={stroke} strokeWidth="2.5" />
        <rect x="190" y="85" width="80" height="28" rx="8" fill="none" stroke={stroke} strokeWidth="2" />
        <circle cx="200" cy="99" r="5" fill={accent} /><circle cx="120" cy="70" r="5" fill={accent} />
        {[[55, 60], [55, 150], [150, 172], [250, 172], [290, 60], [290, 150]].map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r="6" fill="none" stroke={warn} strokeWidth="2.5" />)}
      </>
    ),
  },
}

export default function Figure({ name }) {
  const f = FIGS[name]
  if (!f) return null
  return (
    <figure className="figure">
      <svg viewBox="0 0 340 200" role="img" aria-label={f.caption}>{f.svg}</svg>
      <figcaption>{f.caption}</figcaption>
    </figure>
  )
}
