import { useEffect, useState } from 'react'

export type ToastType = 'success' | 'error' | 'loading' | 'info'

interface ToastProps {
  message: string
  type?: ToastType
  duration?: number
  onClose?: () => void
}

const typeStyles = {
  success: 'bg-green-600 text-white border-green-700 shadow-green-200',
  error: 'bg-red-600 text-white border-red-700 shadow-red-200',
  loading: 'bg-blue-600 text-white border-blue-700 shadow-blue-200',
  info: 'bg-slate-700 text-white border-slate-800 shadow-slate-200',
}

const typeIcons = {
  success: (
    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
    </div>
  ),
  error: (
    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
      </svg>
    </div>
  ),
  loading: (
    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
      <svg className="w-5 h-5 text-white animate-spin" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      </svg>
    </div>
  ),
  info: (
    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
      </svg>
    </div>
  ),
}

export function Toast({ message, type = 'info', duration = 3000, onClose }: ToastProps) {
  const [visible, setVisible] = useState(true)
  const [exiting, setExiting] = useState(false)

  useEffect(() => {
    if (duration && type !== 'loading') {
      const fadeTimer = setTimeout(() => setExiting(true), duration - 300)
      const closeTimer = setTimeout(() => {
        setVisible(false)
        onClose?.()
      }, duration)
      return () => { clearTimeout(fadeTimer); clearTimeout(closeTimer) }
    }
  }, [duration, type, onClose])

  if (!visible) return null

  return (
    <div
      className={`fixed top-6 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-4 px-6 py-4 rounded-xl border-2 shadow-2xl min-w-[340px] max-w-lg transition-all duration-300 ${exiting ? 'opacity-0 -translate-y-2' : 'opacity-100 translate-y-0'} ${typeStyles[type]}`}
      style={{ animation: exiting ? undefined : 'toast-in 0.3s ease-out' }}
    >
      {typeIcons[type]}
      <p className="text-base font-semibold flex-1">{message}</p>
      {type !== 'loading' && (
        <button
          onClick={() => { setVisible(false); onClose?.() }}
          className="flex-shrink-0 text-white/60 hover:text-white transition-colors ml-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      )}
      <style>{`
        @keyframes toast-in {
          from { opacity: 0; transform: translateX(-50%) translateY(-16px); }
          to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>
    </div>
  )
}
