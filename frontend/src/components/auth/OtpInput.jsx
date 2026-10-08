import { useState } from 'react'
import { cn } from '../../utils/cn'

/**
 * One real input (so typing speed, paste and SMS autofill all just work),
 * visually presented as six boxes. The transparent input sits on top.
 */
export default function OtpInput({ value, onChange, disabled, invalid }) {
  const [focused, setFocused] = useState(false)
  const active = Math.min(value.length, 5)

  return (
    <div className="relative">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        disabled={disabled}
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        autoFocus
        aria-label="6-digit verification code"
        aria-invalid={invalid || undefined}
        className="absolute inset-0 z-10 w-full cursor-text bg-transparent text-transparent caret-transparent opacity-0"
      />
      <div className="flex justify-between gap-2" aria-hidden>
        {Array.from({ length: 6 }, (_, i) => (
          <div
            key={i}
            className={cn(
              'grid h-13 w-full min-w-0 place-items-center rounded-xl border bg-surface text-xl font-bold text-ink transition-[border-color,box-shadow]',
              invalid ? 'border-nonveg' : 'border-line-strong',
              focused && i === active && 'border-brand-600 ring-4 ring-brand-600/12',
            )}
          >
            {value[i] ? (
              <span className="animate-scale-in">{value[i]}</span>
            ) : (
              focused && i === active && <span className="h-6 w-px animate-pulse bg-ink" />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
