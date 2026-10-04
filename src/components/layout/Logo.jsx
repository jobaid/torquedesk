export default function Logo({ size = 34 }) {
  return (
    <span className="brand-mark" style={{ width: size, height: size }} aria-hidden="true">
      <svg width={size * 0.62} height={size * 0.62} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
        <circle cx="12" cy="12" r="6" />
        <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
        <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3" />
      </svg>
    </span>
  )
}
