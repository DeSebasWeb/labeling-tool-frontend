import type { HTMLAttributes, ReactNode } from 'react'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
  padding?: boolean
}

export function Card({ children, padding = true, className = '', ...props }: CardProps) {
  return (
    <div
      className={[
        'bg-white rounded-xl border border-slate-200 shadow-sm',
        padding ? 'p-5' : '',
        className,
      ].join(' ')}
      {...props}
    >
      {children}
    </div>
  )
}
