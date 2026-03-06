import type { ReactNode } from 'react'

interface TopbarProps {
  left?: ReactNode
  center?: ReactNode
  right?: ReactNode
}

export function Topbar({ left, center, right }: TopbarProps) {
  return (
    <div className="flex items-center justify-between gap-4 px-5 h-14">
      <div className="flex items-center gap-3 flex-shrink-0">{left}</div>
      {center && <div className="flex-1 flex items-center justify-center">{center}</div>}
      <div className="flex items-center gap-3 flex-shrink-0">{right}</div>
    </div>
  )
}
