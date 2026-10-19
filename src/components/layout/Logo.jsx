export default function Logo({ size = 34 }) {
  return (
    <img
      src="/logo.png"
      alt="Fixora"
      className="brand-mark"
      style={{ height: size, width: 'auto', display: 'inline-block', objectFit: 'contain' }}
    />
  )
}
