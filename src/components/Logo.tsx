/** MEIKA-X mark: a planet, its orbit, and a rising trend line. Original artwork. */
export default function Logo({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="MEIKA-X">
      <rect width="64" height="64" rx="14" fill="#151517" stroke="#2a2a2e" />
      <circle cx="32" cy="32" r="17" fill="none" stroke="#ececec" strokeWidth="3" />
      <ellipse cx="32" cy="32" rx="27" ry="9" fill="none" stroke="#6c6c74" strokeWidth="2.2" transform="rotate(-24 32 32)" />
      <polyline points="17,40 25,36 31,38 38,29 47,24" fill="none" stroke="#e8833a" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="47" cy="24" r="3.4" fill="#e8833a" />
    </svg>
  );
}
