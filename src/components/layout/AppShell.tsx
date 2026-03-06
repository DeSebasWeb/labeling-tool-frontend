import type { ReactNode, DragEventHandler } from 'react'

interface AppShellProps {
  header?: ReactNode
  children: ReactNode
  onDragOver?: DragEventHandler
  onDragLeave?: DragEventHandler
  onDrop?: DragEventHandler
}

export function AppShell({ header, children, onDragOver, onDragLeave, onDrop }: AppShellProps) {
  return (
    <div
      className="flex flex-col h-full bg-slate-50 relative"
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {header && (
        <header className="flex-shrink-0 bg-white border-b border-slate-200 shadow-sm z-10">
          {header}
        </header>
      )}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  )
}
