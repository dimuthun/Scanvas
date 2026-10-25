import type { ReactNode } from 'react'
import { ToastHost } from './toast'
import { useTheme } from './useTheme'

/** The Scanvas mark: scan corners + text lines on an accent gradient tile. */
export function Logo({ size = 20 }: { size?: number }): React.JSX.Element {
  return (
    <svg className="logo" width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <defs>
        <linearGradient id="logo-gradient" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--accent)" />
          <stop offset="1" stopColor="var(--accent-hover)" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill="url(#logo-gradient)" />
      <g fill="none" stroke="var(--accent-text)" strokeWidth="2.4" strokeLinecap="round">
        <path d="M7 12V8.5A1.5 1.5 0 0 1 8.5 7H12M20 7h3.5A1.5 1.5 0 0 1 25 8.5V12M25 20v3.5a1.5 1.5 0 0 1-1.5 1.5H20M12 25H8.5A1.5 1.5 0 0 1 7 23.5V20" />
        <path d="M11.5 13h9M11.5 16h9M11.5 19h6" />
      </g>
    </svg>
  )
}

interface TitleBarProps {
  title: string
  /** Replaces the title text (e.g. an editable document name). */
  titleSlot?: ReactNode
  center?: ReactNode
  actions?: ReactNode
}

/** Draggable, themed title bar; native window buttons are drawn by the OS on the right. */
export function TitleBar({ title, titleSlot, center, actions }: TitleBarProps): React.JSX.Element {
  return (
    <header className="titlebar">
      <div className="titlebar-brand">
        <Logo />
        {titleSlot ?? <span>{title}</span>}
      </div>
      <div className="titlebar-center">{center}</div>
      {actions && <div className="titlebar-actions">{actions}</div>}
    </header>
  )
}

interface AppShellProps extends TitleBarProps {
  children: ReactNode
  /** Hide the title bar (e.g. frameless overlays). */
  bare?: boolean
}

/** Applies the theme, renders the title bar and hosts toasts. Renders nothing until the theme is known (no flash). */
export function AppShell({ children, bare = false, ...titleBar }: AppShellProps): React.JSX.Element | null {
  const theme = useTheme()
  if (!theme) return null
  return (
    <div className="app-shell">
      {!bare && <TitleBar {...titleBar} />}
      <div className="app-content">{children}</div>
      <ToastHost />
    </div>
  )
}
