/**
 * 紧凑进度条：已摄入 / 总量
 */
export function ProgressBar({ label, consumed, total, className = '' }) {
  const value = total > 0 ? Math.min(consumed / total, 1) : 0
  const displayConsumed = typeof consumed === 'number' ? consumed.toFixed(1) : consumed
  const displayTotal = typeof total === 'number' ? total.toFixed(1) : total

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <div className="flex justify-between text-[11px]">
        <span className="text-zinc-500">{label}</span>
        <span className="text-zinc-300">{displayConsumed} / {displayTotal}g</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#404040]">
        <div
          className="h-full rounded-full transition-[width]"
          style={{
            width: `${value * 100}%`,
            backgroundColor: '#FF3C3C',
          }}
        />
      </div>
    </div>
  )
}
