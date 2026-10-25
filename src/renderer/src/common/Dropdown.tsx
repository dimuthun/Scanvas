import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronDown, type LucideIcon } from 'lucide-react'

export interface DropdownItem {
  label: string
  icon?: LucideIcon
  onSelect(): void
  hidden?: boolean
  disabled?: boolean
}

/** A button that opens a small menu of actions. `label` may be omitted for an icon-only trigger. */
export function Dropdown({
  label,
  icon: Icon,
  items,
  primary = false,
  align = 'left',
  triggerClass,
  ariaLabel
}: {
  label?: ReactNode
  icon?: LucideIcon
  items: DropdownItem[]
  primary?: boolean
  align?: 'left' | 'right'
  triggerClass?: string
  ariaLabel?: string
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent): void => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])
  const classes = [primary && 'primary', !label && 'icon-btn', triggerClass].filter(Boolean).join(' ')
  return (
    <div className="dropdown" ref={root}>
      <button className={classes || undefined} aria-haspopup="menu" aria-expanded={open} aria-label={ariaLabel} onClick={() => setOpen((o) => !o)}>
        {Icon && <Icon />}
        {label}
        {label && <ChevronDown className="chevron" />}
      </button>
      {open && (
        <div className={`dropdown-menu ${align}`} role="menu">
          {items
            .filter((item) => !item.hidden)
            .map(({ label: text, icon: ItemIcon, onSelect, disabled }) => (
              <button
                key={text}
                role="menuitem"
                disabled={disabled}
                onClick={() => {
                  setOpen(false)
                  onSelect()
                }}
              >
                {ItemIcon && <ItemIcon />}
                {text}
              </button>
            ))}
        </div>
      )}
    </div>
  )
}
