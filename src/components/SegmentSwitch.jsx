/**
 * 横向分段开关：选中项为凸起药丸（带阴影），未选为文字
 * 风格参考：Soft UI / 单选项分段控制
 * @param {string} [activeColor] - 选中项背景色，默认 #FF3C3C
 */
export function SegmentSwitch({ options, value, onChange, activeColor = '#FF3C3C' }) {
  return (
    <div
      className="flex rounded-full p-1"
      style={{
        backgroundColor: '#404040',
        boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.2)',
      }}
    >
      {options.map((opt) => {
        const isSelected = value === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className="relative flex flex-1 items-center justify-center rounded-full py-2.5 text-[13px] font-medium transition-all"
            style={{
              color: isSelected ? '#fff' : '#a1a1aa',
              backgroundColor: isSelected ? activeColor : 'transparent',
              boxShadow: isSelected ? `0 2px 8px ${hexToRgba(activeColor, 0.35)}` : 'none',
            }}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

function hexToRgba(hex, alpha) {
  const m = hex.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i)
  if (!m) return `rgba(255,60,60,${alpha})`
  return `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},${alpha})`
}
