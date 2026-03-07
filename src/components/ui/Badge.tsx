import type { ReactNode } from 'react'

type Variant = 'default' | 'pending' | 'inProgress' | 'done' | 'info'

interface BadgeProps {
  variant?: Variant
  children: ReactNode
  className?: string
}

const variantClasses: Record<Variant, string> = {
  default: 'bg-slate-100 text-slate-700',
  pending: 'bg-amber-100 text-amber-700',
  inProgress: 'bg-blue-100 text-blue-700',
  done: 'bg-green-100 text-green-700',
  info: 'bg-violet-100 text-violet-700',
}

export function Badge({ variant = 'default', children, className = '' }: BadgeProps) {
  return (
    <span
      className={[
        'inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold tracking-wide',
        variantClasses[variant],
        className,
      ].join(' ')}
    >
      {children}
    </span>
  )
}
