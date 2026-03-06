import type { ReactNode } from 'react'

interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 px-8 text-center">
      {icon && (
        <div className="flex items-center justify-center w-14 h-14 rounded-full bg-slate-100 text-slate-400">
          {icon}
        </div>
      )}
      <div className="flex flex-col gap-1">
        <p className="text-sm font-semibold text-slate-700">{title}</p>
        {description && <p className="text-xs text-slate-500 max-w-xs">{description}</p>}
      </div>
      {action}
    </div>
  )
}
