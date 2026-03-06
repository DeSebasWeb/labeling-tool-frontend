interface ProgressBarProps {
  value: number   // 0-100
  label?: string
  colorClass?: string
}

export function ProgressBar({ value, label, colorClass = 'bg-blue-500' }: ProgressBarProps) {
  const pct = Math.min(100, Math.max(0, value))
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <div className="flex justify-between items-center">
          <span className="text-xs text-slate-500">{label}</span>
          <span className="text-xs font-semibold text-slate-700">{pct}%</span>
        </div>
      )}
      <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${colorClass}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
