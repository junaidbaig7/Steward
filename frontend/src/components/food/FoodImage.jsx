import { UtensilsCrossed } from 'lucide-react'
import { useState } from 'react'
import { cn } from '../../utils/cn'

/** Lazy-loaded image that fades in, with a calm placeholder if the URL is missing or broken. */
export default function FoodImage({ src, alt, className }) {
  const [state, setState] = useState(src ? 'loading' : 'error')

  if (state === 'error') {
    return (
      <div className={cn('grid place-items-center bg-brand-50 text-brand-700/40', className)} role="img" aria-label={alt}>
        <UtensilsCrossed className="size-8" aria-hidden />
      </div>
    )
  }
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      onLoad={() => setState('loaded')}
      onError={() => setState('error')}
      className={cn('transition-opacity duration-300', state === 'loaded' ? 'opacity-100' : 'opacity-0', className)}
    />
  )
}
