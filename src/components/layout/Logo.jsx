export default function Logo({ size = 34 }) {
  return (
    <span
      className="brand-mark"
      style={{
        width: size,
        height: size,
        background: '#111111',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: size * 0.22,
      }}
      aria-label="Fixora"
    >
      <svg width={size * 0.72} height={size * 0.72} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* T */}
        <path d="M3 6h12v4H11v16H7V10H3V6z" fill="#ffffff" />
        {/* D */}
        <path d="M17 6h6c4.4 0 7 2.9 7 10s-2.6 10-7 10h-6V6zm4 4v12h2c2 0 3-1.8 3-6s-1-6-3-6h-2z" fill="#f58220" />
      </svg>
    </span>
  )
}
