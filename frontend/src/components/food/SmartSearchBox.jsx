import { ArrowRight, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { cn } from '../../utils/cn'

/** Natural-language search input used in the hero and the search page. */
export default function SmartSearchBox({ initial = '', onSearch, size = 'lg', autoFocus = false, className }) {
  const [query, setQuery] = useState(initial)
  const navigate = useNavigate()

  const submit = (e) => {
    e.preventDefault()
    const q = query.trim()
    if (!q) return
    if (onSearch) onSearch(q)
    else navigate(`/search?q=${encodeURIComponent(q)}`)
  }

  return (
    <form onSubmit={submit} role="search" className={cn('relative', className)}>
      <label htmlFor="smart-search" className="sr-only">Describe what you'd like to eat</label>
      <Sparkles className="pointer-events-none absolute left-5 top-1/2 size-5 -translate-y-1/2 text-brand-600" aria-hidden />
      <input
        id="smart-search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoFocus={autoFocus}
        maxLength={200}
        autoComplete="off"
        placeholder="Describe your craving… e.g. spicy chicken under ₹300"
        className={cn(
          'w-full rounded-full border border-line-strong bg-surface pl-13 pr-16 text-ink placeholder:text-muted/70',
          'shadow-[0_2px_12px_rgba(27,27,24,0.04)] transition-[border-color,box-shadow] focus:border-brand-600 focus:outline-none focus:ring-4 focus:ring-brand-600/10',
          size === 'lg' ? 'h-15 text-base' : 'h-12 text-sm',
        )}
      />
      <button
        type="submit"
        aria-label="Search"
        className={cn(
          'absolute right-2 top-1/2 grid -translate-y-1/2 place-items-center rounded-full bg-brand-600 text-white transition-[background-color,transform] hover:bg-brand-700 active:scale-95',
          size === 'lg' ? 'size-11' : 'size-9',
        )}
      >
        <ArrowRight className="size-5" aria-hidden />
      </button>
    </form>
  )
}
