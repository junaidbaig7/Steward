import { createPortal } from 'react-dom'

/** A bowl with three soft steam wisps — communicates "we're working on your order". */
function SteamingBowl() {
  return (
    <svg viewBox="0 0 120 100" className="h-24 w-28" aria-hidden>
      {[38, 60, 82].map((x, i) => (
        <path
          key={x}
          d={`M${x} 42c-6-7 6-11 0-18s6-11 0-17`}
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          className="steam text-brand-600/45"
          style={{ animationDelay: `${i * 0.35}s` }}
        />
      ))}
      <path d="M14 54h92c0 22-20 36-46 36S14 76 14 54z" className="fill-brand-600" />
      <rect x="10" y="49" width="100" height="8" rx="4" className="fill-brand-700" />
      <path d="M44 90h32" stroke="currentColor" strokeWidth="5" strokeLinecap="round" className="text-brand-800" />
    </svg>
  )
}

export default function PreparingOverlay({ message, detail }) {
  return createPortal(
    <div className="fixed inset-0 z-[70] grid place-items-center bg-canvas/80 px-4 backdrop-blur-sm animate-fade-in" role="alertdialog" aria-live="assertive" aria-label={message}>
      <div className="flex w-full max-w-xs flex-col items-center rounded-[1.5rem] border border-line bg-surface px-8 py-9 text-center shadow-[0_24px_60px_rgba(27,27,24,0.12)] animate-scale-in">
        <SteamingBowl />
        <p key={message} className="mt-5 font-semibold text-ink animate-fade-in">{message}</p>
        {detail && <p className="mt-1 text-sm text-muted">{detail}</p>}
      </div>
    </div>,
    document.body,
  )
}
