import { useState } from 'react'
import { SegmentSwitch } from './SegmentSwitch'

/**
 * 每日摄入追踪 - 仪表盘
 * 默认（总进度）：竖状图 = P/C/F 三根柱，每根为对该营养素当日目标的完成进度
 * 选择某营养素（如蛋白质）：竖状图 = 一根整柱，该营养素当日目标完成进度（100% 制）
 */
const BAR_HEIGHT = 175
/** 色块至少此高度(px)才在内部显示百分比，保证 20px 字号 + 上下各 8px padding */
const MIN_FILL_HEIGHT_FOR_TEXT = 40
const MACRO_TABS = [
  { value: 'P', label: '蛋白质' },
  { value: 'C', label: '碳水' },
  { value: 'F', label: '脂肪' },
]

const BARS = [
  { key: 'P', trackBg: 'rgba(221,221,221,0.6)', fillBg: '#FF3D3C' },
  { key: 'C', trackBg: 'rgba(192,190,190,0.6)', fillBg: '#FBCB9B' },
  { key: 'F', trackBg: 'rgba(100,99,99,0.6)', fillBg: '#FC8D87' },
]

export function IntakeGauge({ consumed, targets }) {
  const [macroTab, setMacroTab] = useState(null)

  const progressP = targets.proteinTarget > 0 ? Math.min(consumed.protein / targets.proteinTarget, 1) : 0
  const progressC = targets.carbsTarget > 0 ? Math.min(consumed.carbs / targets.carbsTarget, 1) : 0
  const progressF = targets.fatTarget > 0 ? Math.min(consumed.fat / targets.fatTarget, 1) : 0
  const progressByMacro = { P: progressP, C: progressC, F: progressF }

  const current =
    macroTab != null
      ? {
          P: { consumed: consumed.protein, total: targets.proteinTarget, pct: progressP, name: '蛋白质' },
          C: { consumed: consumed.carbs, total: targets.carbsTarget, pct: progressC, name: '碳水' },
          F: { consumed: consumed.fat, total: targets.fatTarget, pct: progressF, name: '脂肪' },
        }[macroTab]
      : null
  const pctDisplay = current && current.total > 0 ? Math.round(current.pct * 100) : 0

  const isTotalView = macroTab == null

  return (
    <div
      className="rounded-[24px] border border-[#404040] p-6"
      style={{
        backgroundColor: '#393939',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <button
          type="button"
          onClick={() => setMacroTab(null)}
          className="w-full rounded-full py-2.5 text-[12px] font-bold uppercase leading-none transition-colors"
          style={{
            color: '#fff',
            backgroundColor: macroTab == null ? '#FF3D3C' : '#2F2F2F',
          }}
        >
          总进度
        </button>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div
            className="flex items-end w-full"
            style={{ height: BAR_HEIGHT, gap: 0 }}
          >
            {isTotalView
              ? BARS.map((bar, i) => {
                const pct = progressByMacro[bar.key]
                const fillHeightPct = Math.min(pct * 100, 100)
                const fillHeightPx = (fillHeightPct / 100) * BAR_HEIGHT
                const pctLabel = Math.round(pct * 100)
                const isZero = pct <= 0
                const textFitsInFill = fillHeightPx >= MIN_FILL_HEIGHT_FOR_TEXT
                const numberAboveFill = !isZero && !textFitsInFill
                const percentOnly = (
                  <span
                    className="font-bold tabular-nums text-white whitespace-nowrap"
                    style={{ fontSize: 20 }}
                  >
                    {pctLabel}%
                  </span>
                )
                return (
                  <div
                    key={bar.key}
                    className="relative shrink-0 rounded-[10px] overflow-hidden flex flex-col justify-end items-center"
                    style={{
                      height: BAR_HEIGHT,
                      flex: 1,
                      minWidth: 0,
                      backgroundColor: bar.trackBg,
                      paddingBottom: 16,
                    }}
                  >
                    {!isZero && (
                      <div
                        className="absolute bottom-0 left-0 right-0 rounded-[10px] flex justify-center transition-[height]"
                        style={{
                          height: `${fillHeightPct}%`,
                          backgroundColor: bar.fillBg,
                          alignItems: 'center',
                          justifyContent: 'center',
                          padding: numberAboveFill ? 0 : (textFitsInFill ? '8px 0' : '4px 0 0'),
                        }}
                      >
                        {!numberAboveFill && percentOnly}
                      </div>
                    )}
                    {numberAboveFill && (
                      <span
                        className="absolute left-0 right-0 flex justify-center"
                        style={{ bottom: `calc(${fillHeightPct}% + 4px)` }}
                      >
                        {percentOnly}
                      </span>
                    )}
                    <span
                      style={{
                        opacity: isZero ? 0.5 : 1,
                        visibility: isZero ? 'visible' : 'hidden',
                      }}
                    >
                      {percentOnly}
                    </span>
                  </div>
                )
              })
            : (() => {
                const bar = BARS.find((b) => b.key === macroTab) ?? BARS[0]
                const pct = progressByMacro[macroTab]
                const fillHeightPct = Math.min(pct * 100, 100)
                const fillHeightPx = (fillHeightPct / 100) * BAR_HEIGHT
                const pctLabel = Math.round(pct * 100)
                const isZero = pct <= 0
                const textFitsInFill = fillHeightPx >= MIN_FILL_HEIGHT_FOR_TEXT
                const numberAboveFill = !isZero && !textFitsInFill
                const percentOnly = (
                  <span
                    className="font-bold tabular-nums text-white whitespace-nowrap"
                    style={{ fontSize: 20 }}
                  >
                    {pctLabel}%
                  </span>
                )
                return (
                  <div
                    className="relative w-full rounded-[10px] overflow-hidden flex flex-col justify-end items-center"
                    style={{
                      height: BAR_HEIGHT,
                      backgroundColor: bar.trackBg,
                      paddingBottom: 16,
                    }}
                  >
                    {!isZero && (
                      <div
                        className="absolute bottom-0 left-0 right-0 rounded-[10px] flex justify-center items-center transition-[height]"
                        style={{
                          height: `${fillHeightPct}%`,
                          backgroundColor: bar.fillBg,
                          padding: numberAboveFill ? 0 : (textFitsInFill ? '8px 0' : '4px 0 0'),
                        }}
                      >
                        {!numberAboveFill && percentOnly}
                      </div>
                    )}
                    {numberAboveFill && (
                      <span
                        className="absolute left-0 right-0 flex justify-center"
                        style={{ bottom: `calc(${fillHeightPct}% + 4px)` }}
                      >
                        {percentOnly}
                      </span>
                    )}
                    <span
                      style={{
                        opacity: isZero ? 0.5 : 1,
                        visibility: isZero ? 'visible' : 'hidden',
                      }}
                    >
                      {percentOnly}
                    </span>
                  </div>
                )
              })()}
          </div>
        </div>
      </div>

      <div
        className="flex items-center w-full text-[12px]"
        style={{
          minHeight: 18,
          justifyContent: !isTotalView && current != null ? 'space-between' : undefined,
        }}
      >
        {isTotalView ? (
          BARS.map((bar) => {
            const consumedG =
              bar.key === 'P' ? consumed.protein : bar.key === 'C' ? consumed.carbs : consumed.fat
            const targetG =
              bar.key === 'P' ? targets.proteinTarget : bar.key === 'C' ? targets.carbsTarget : targets.fatTarget
            return (
              <div
                key={bar.key}
                className="flex-1 min-w-0 text-center tabular-nums"
                style={{ fontSize: 11, color: '#9F9FAA' }}
              >
                {Math.round(consumedG)}/{Math.round(targetG)}g
              </div>
            )
          })
        ) : current != null ? (
          <>
            <span style={{ color: '#9F9FAA' }}>
              已摄入 {current.consumed.toFixed(1)} / {current.total.toFixed(1)}g
            </span>
            <span className="font-black" style={{ color: '#9F9FAA' }}>·{pctDisplay}%</span>
          </>
        ) : null}
      </div>

      <SegmentSwitch
        options={MACRO_TABS}
        value={macroTab}
        onChange={setMacroTab}
        activeColor={macroTab != null ? BARS.find((b) => b.key === macroTab)?.fillBg ?? '#FF3D3C' : undefined}
      />
    </div>
  )
}
