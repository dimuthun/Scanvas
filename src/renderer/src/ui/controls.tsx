import { useState, type ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

export function IconButton({
  icon: Icon,
  label,
  onClick,
  disabled,
  active,
  small,
  danger
}: {
  icon: LucideIcon
  label: string
  onClick(event: React.MouseEvent): void
  disabled?: boolean
  active?: boolean
  small?: boolean
  danger?: boolean
}): React.JSX.Element {
  return (
    <button
      type="button"
      className={['icon-btn', small && 'sm', active && 'active', danger && 'danger'].filter(Boolean).join(' ')}
      aria-label={label}
      data-tooltip={label}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon />
    </button>
  )
}

export function Switch({ checked, onChange, disabled, children }: { checked: boolean; onChange(value: boolean): void; disabled?: boolean; children?: ReactNode }): React.JSX.Element {
  return (
    <label className="switch">
      <input type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="switch-track" aria-hidden />
      {children && <span>{children}</span>}
    </label>
  )
}

export function Segmented<T extends string>({
  value,
  options,
  onChange
}: {
  value: T
  options: { value: T; label: string; icon?: LucideIcon }[]
  onChange(value: T): void
}): React.JSX.Element {
  return (
    <div className="segmented" role="radiogroup">
      {options.map(({ value: v, label, icon: Icon }) => (
        <button key={v} type="button" role="radio" aria-checked={v === value} className={v === value ? 'selected' : undefined} onClick={() => onChange(v)}>
          {Icon && <Icon />}
          {label}
        </button>
      ))}
    </div>
  )
}

/** Range slider that commits only when the user releases it (each commit re-renders a page). */
export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  format = (v) => String(v),
  onCommit
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  format?(value: number): string
  onCommit(value: number): void
}): React.JSX.Element {
  const [draft, setDraft] = useState(value)
  const commit = (): void => {
    if (draft !== value) onCommit(draft)
  }
  return (
    <label className="slider">
      <span className="slider-head">
        {label}
        <span className="slider-value">{format(draft)}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={draft}
        onChange={(e) => setDraft(Number(e.target.value))}
        onPointerUp={commit}
        onKeyUp={commit}
        onDoubleClick={() => {
          // Double-click resets to neutral.
          setDraft(0)
          if (value !== 0) onCommit(0)
        }}
      />
    </label>
  )
}

/** <img> that shows a shimmering placeholder until loaded. */
export function SkeletonImage({ src, alt = '', className }: { src: string; alt?: string; className?: string }): React.JSX.Element {
  const [loaded, setLoaded] = useState(false)
  return (
    <span className={`skeleton-image${loaded ? ' loaded' : ' skeleton'}${className ? ` ${className}` : ''}`}>
      <img src={src} alt={alt} loading="lazy" draggable={false} onLoad={() => setLoaded(true)} />
    </span>
  )
}

/** Friendly empty state with an illustration in the accent color. */
export function EmptyState({ title, description, children }: { title: string; description?: string; children?: ReactNode }): React.JSX.Element {
  return (
    <div className="empty-state">
      <svg width="148" height="112" viewBox="0 0 148 112" aria-hidden>
        <defs>
          <linearGradient id="empty-glow" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--accent)" stopOpacity="0.35" />
            <stop offset="1" stopColor="var(--accent)" stopOpacity="0.05" />
          </linearGradient>
        </defs>
        <ellipse cx="74" cy="100" rx="52" ry="8" fill="var(--accent)" opacity="0.12" />
        <rect x="40" y="14" width="56" height="74" rx="8" fill="url(#empty-glow)" stroke="var(--border)" transform="rotate(-8 68 51)" />
        <rect x="52" y="8" width="56" height="74" rx="8" fill="var(--surface-strong)" stroke="var(--border)" />
        <g stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" opacity="0.85">
          <path d="M62 26h30M62 36h30M62 46h20" />
        </g>
        <g fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round">
          <path d="M100 58v-6a3 3 0 0 1 3-3h6M124 49h6a3 3 0 0 1 3 3v6M133 74v6a3 3 0 0 1-3 3h-6M109 83h-6a3 3 0 0 1-3-3v-6" />
        </g>
        <g fill="var(--accent)">
          <path d="M28 30l2.5 5.5L36 38l-5.5 2.5L28 46l-2.5-5.5L20 38l5.5-2.5z" opacity="0.7" />
          <circle cx="122" cy="20" r="3" opacity="0.5" />
        </g>
      </svg>
      <h2>{title}</h2>
      {description && <p>{description}</p>}
      {children && <div className="actions">{children}</div>}
    </div>
  )
}
