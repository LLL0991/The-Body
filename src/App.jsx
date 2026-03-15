import { useState, useEffect, useRef } from 'react'
import { Layout } from './components/Layout'
import { SegmentSwitch } from './components/SegmentSwitch'
import { IntakeGauge } from './components/IntakeGauge'
import { MealDetailView } from './components/MealDetailView'
import { useMealStore } from './hooks/useMealStore'
import { UtensilsCrossed, CircleCheckBig, Mic, Loader2, Camera } from 'lucide-react'
import { parseMealInput } from './services/nutrientParser'
import { inferMealIndexFromText } from './utils/mealInference'

const SEGMENT_OPTIONS = [
  { value: 'morning', label: '早训' },
  { value: 'noon', label: '午训' },
  { value: 'evening', label: '晚练' },
  { value: 'rest', label: '休息' },
]

function App() {
  const {
    trainingMode,
    setTrainingMode,
    meals,
    useCookedWeight,
    setUseCookedWeight,
    targets,
    consumed,
    setMealIngredientGrams,
    setMealConfirmed,
    removeMealIngredient,
    applySuperBowl,
    addOrReplaceQuickIngredient,
    replaceNanjuWithIngredient,
    parseFoodTextAndRecord,
    recordAiNutrientResult,
    quickIngredients,
    getRecommendedIdsForMeal,
    getMealMacros,
    deletedIngredients,
    TRAINING_MODES,
  } = useMealStore()

  const [selectedMealIndex, setSelectedMealIndex] = useState(null)
  const [homeAiText, setHomeAiText] = useState('')
  const [homeAiLoading, setHomeAiLoading] = useState(false)
  const [homeAiError, setHomeAiError] = useState('')
  const [homeAiAdjustment, setHomeAiAdjustment] = useState('')
  const [homeParsedResult, setHomeParsedResult] = useState(null)
  const [homeParsedMealIndex, setHomeParsedMealIndex] = useState(null)
  const [homeStoreAsRaw, setHomeStoreAsRaw] = useState(false)
  const [homeIsRecording, setHomeIsRecording] = useState(false)
  const [homeSpeechSupport, setHomeSpeechSupport] = useState(false)
  const [homeScanHint, setHomeScanHint] = useState('')
  const homeMediaRecorderRef = useRef(null)
  const homeChunksRef = useRef([])
  const homeImageInputRef = useRef(null)

  useEffect(() => {
    setHomeSpeechSupport(!!navigator.mediaDevices?.getUserMedia)
    return () => {
      if (homeMediaRecorderRef.current) {
        homeMediaRecorderRef.current.stream.getTracks().forEach((t) => t.stop())
        homeMediaRecorderRef.current = null
      }
    }
  }, [])

  const handleHomeImageClick = () => {
    setHomeScanHint('')
    if (homeImageInputRef.current) {
      homeImageInputRef.current.click()
    }
  }

  // 为空时走同源（Vite 代理到 voice-server），部署到远端时设 VITE_VOICE_AND_IMAGE_API 为后端地址
  const VOICE_AND_IMAGE_API = import.meta.env.VITE_VOICE_AND_IMAGE_API ?? ''

  const handleHomeImageChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!/^image\/(jpeg|png|webp|gif)$/i.test(file.type)) {
      setHomeScanHint('请选择 JPEG/PNG/WebP/GIF 图片')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setHomeScanHint('图片请小于 5MB')
      return
    }
    setHomeScanHint('')
    setHomeAiError('')
    setHomeAiAdjustment('')
    setHomeParsedResult(null)
    setHomeParsedMealIndex(null)
    setHomeAiLoading(true)
    try {
      const formData = new FormData()
      formData.append('image', file)
      const resp = await fetch((VOICE_AND_IMAGE_API ? VOICE_AND_IMAGE_API + '/' : '') + 'api/image-to-meal-description', {
        method: 'POST',
        body: formData,
      })
      const data = await resp.json().catch(() => ({}))
      if (!resp.ok) {
        throw new Error(data?.error || `识别失败 ${resp.status}`)
      }
      const description = (data?.text || '').trim()
      if (!description) throw new Error('未识别到餐食描述')
      setHomeAiText(description)
      await runHomeParse(description)
    } catch (err) {
      setHomeAiError(err?.message || '照片识别失败')
    } finally {
      setHomeAiLoading(false)
      if (homeImageInputRef.current) homeImageInputRef.current.value = ''
    }
  }

  const getDefaultMealIndex = () => {
    if (!meals?.length) return null
    const idx = meals.findIndex((m) => !m.confirmed)
    return idx === -1 ? 0 : idx
  }

  /** 仅做 AI 解析，生成预览，不立即写入餐次；并根据「中午/早上/练完后」等推断记录到哪一餐 */
  const runHomeParse = async (overrideText) => {
    const text = (overrideText ?? homeAiText).trim()
    setHomeAiError('')
    setHomeAiAdjustment('')
    setHomeParsedResult(null)
    setHomeParsedMealIndex(null)
    if (!text) return
    const defaultMealIndex = getDefaultMealIndex()
    if (defaultMealIndex === null || !meals[defaultMealIndex]) {
      setHomeAiError('当前暂无可记录的餐次')
      return
    }
    setHomeAiLoading(true)
    try {
      const result = await parseMealInput(text, meals[defaultMealIndex].name)
      const inferredMealIndex = inferMealIndexFromText(text, meals)
      const mealIndex = inferredMealIndex !== null ? inferredMealIndex : defaultMealIndex
      setHomeParsedResult(result)
      setHomeParsedMealIndex(mealIndex)
      if (result.adjustment) setHomeAiAdjustment(result.adjustment)
    } catch (err) {
      const msg = err?.message ?? String(err ?? '未知错误')
      setHomeAiError(msg || '未识别到食材，可试「全家鸡胸肉」「两块」等')
    } finally {
      setHomeAiLoading(false)
    }
  }

  /** 点击“记录”：若已有预览则写入；否则走老逻辑（解析并直接写入） */
  const handleHomeAiSubmit = async () => {
    setHomeAiError('')
    setHomeAiAdjustment('')
    if (homeParsedResult && homeParsedMealIndex !== null && meals[homeParsedMealIndex]) {
      const text = homeAiText.trim()
      const meal = meals[homeParsedMealIndex]
      const hasAiOrUserContent = meal.ingredients?.some((ing) => String(ing.id || '').startsWith('ai-'))
      recordAiNutrientResult(homeParsedMealIndex, homeParsedResult, text || undefined, {
        storeAsRaw: homeStoreAsRaw,
        replaceExisting: !hasAiOrUserContent,
      })
      setMealConfirmed(homeParsedMealIndex, true)
      setHomeParsedResult(null)
      setHomeParsedMealIndex(null)
      setHomeStoreAsRaw(false)
      setHomeAiText('')
      return
    }

    const text = homeAiText.trim()
    if (!text) return
    // 首次点击「记录」：仅做解析并展示预览，不直接写入
    await runHomeParse(text)
  }

  const handleHomeMicClick = () => {
    if (!homeSpeechSupport || homeAiLoading) return
    if (homeIsRecording) {
      // 第二次点击：结束录音并上传
      setHomeIsRecording(false)
      if (homeMediaRecorderRef.current) {
        homeMediaRecorderRef.current.stop()
      }
      return
    }
    // 第一次点击：开始录音
    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        const mr = new MediaRecorder(stream)
        homeChunksRef.current = []
        mr.ondataavailable = (e) => {
          if (e.data?.size > 0) homeChunksRef.current.push(e.data)
        }
        mr.onstop = async () => {
          const blob = new Blob(homeChunksRef.current, { type: 'audio/webm' })
          homeMediaRecorderRef.current?.stream.getTracks().forEach((t) => t.stop())
          homeMediaRecorderRef.current = null
          homeChunksRef.current = []
          if (blob.size === 0) return
          try {
            setHomeAiLoading(true)
            setHomeAiError('')
            const fd = new FormData()
            fd.append('file', blob, 'voice.webm')
            const resp = await fetch((VOICE_AND_IMAGE_API ? VOICE_AND_IMAGE_API + '/' : '') + 'api/voice-to-text', {
              method: 'POST',
              body: fd,
            })
            const data = await resp.json()
            if (!resp.ok) {
              throw new Error(data?.error || '语音识别失败')
            }
            const text = (data.text || '').trim()
            if (text) {
              setHomeAiText(text)
              await runHomeParse(text)
            }
          } catch (err) {
            setHomeAiError(err?.message || '语音识别失败')
          } finally {
            setHomeAiLoading(false)
          }
        }
        homeMediaRecorderRef.current = mr
        setHomeIsRecording(true)
        mr.start()
      })
      .catch(() => {
        setHomeAiError('无法访问麦克风，请检查浏览器权限')
      })
  }

  const segmentValue = trainingMode
  const onSegmentChange = (value) => {
    setTrainingMode(value)
    setSelectedMealIndex(null)
  }

  // 二级页：点击餐次进入详情
  if (selectedMealIndex !== null && meals[selectedMealIndex]) {
    return (
      <Layout>
        <MealDetailView
          meal={meals[selectedMealIndex]}
          mealIndex={selectedMealIndex}
          onBack={() => setSelectedMealIndex(null)}
          useCookedWeight={useCookedWeight}
          setUseCookedWeight={setUseCookedWeight}
          setMealIngredientGrams={setMealIngredientGrams}
          setMealConfirmed={setMealConfirmed}
          removeMealIngredient={removeMealIngredient}
          applySuperBowl={applySuperBowl}
          addOrReplaceQuickIngredient={addOrReplaceQuickIngredient}
          replaceNanjuWithIngredient={replaceNanjuWithIngredient}
          quickIngredients={[...quickIngredients, ...deletedIngredients]}
          getRecommendedIdsForMeal={getRecommendedIdsForMeal}
          getMealMacros={getMealMacros}
          targets={targets}
          consumed={consumed}
          meals={meals}
          parseFoodTextAndRecord={parseFoodTextAndRecord}
          recordAiNutrientResult={recordAiNutrientResult}
        />
      </Layout>
    )
  }

  // 一级页：训练模式 + 进度条 + 底部餐次图标
  return (
    <Layout>
      <section className="mb-5">
        <SegmentSwitch
          options={SEGMENT_OPTIONS}
          value={segmentValue}
          onChange={onSegmentChange}
        />
      </section>

      <section className="mb-6">
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-base font-semibold text-zinc-100">每日摄入追踪</h2>
          <span
            className="rounded-lg px-2.5 py-1 text-[12px] text-zinc-400"
            style={{ backgroundColor: '#404040' }}
          >
            今日
          </span>
        </div>
        <IntakeGauge consumed={consumed} targets={targets} />
        {(() => {
          const remainingCarbs = (targets?.carbsTarget ?? 0) - (consumed?.carbs ?? 0)
          const hasUnconfirmed = meals?.some((m) => !m.confirmed)
          if (remainingCarbs < 0) {
            return (
              <p className="mt-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-[12px] text-red-200/90">
                今日碳水超标（超约 {Math.round(-remainingCarbs)}g），后续餐次建议低碳。
              </p>
            )
          }
          if (remainingCarbs < 25 && hasUnconfirmed) {
            return (
              <p className="mt-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-200/90">
                今日碳水所剩不多（约 {Math.round(remainingCarbs)}g），午餐/晚餐建议：以蛋白质与蔬菜为主，碳水少或省略（如沙拉、鸡胸、少饭/无主食）。
              </p>
            )
          }
          return null
        })()}
        {/* 首页快速 AI 记录：文字 / 语音 / 拍照入口 */}
        <div className="mt-4 flex flex-col gap-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[12px] text-zinc-500">快速记录（AI）</p>
            {homeAiAdjustment && (
              <span className="max-w-[60%] truncate text-[11px] text-zinc-400">
                说明：{homeAiAdjustment}
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-[#404040] bg-[#18181b] px-2 py-1.5">
              <input
                type="text"
                value={homeAiText}
                onChange={(e) => {
                  setHomeAiText(e.target.value)
                  setHomeAiError('')
                  setHomeAiAdjustment('')
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleHomeAiSubmit()
                  }
                }}
                placeholder="我吃了一碗云阿蛮米线"
                className="min-w-0 flex-1 bg-transparent px-1.5 py-1 text-[13px] text-zinc-200 placeholder:text-zinc-500"
              />
              {homeSpeechSupport && (
                <button
                  type="button"
                  onClick={handleHomeMicClick}
                  className="flex items-center justify-center rounded-full p-2"
                  style={{
                    backgroundColor: homeIsRecording ? 'rgba(239,68,68,0.25)' : 'transparent',
                    color: homeIsRecording ? '#f87171' : '#a1a1aa',
                  }}
                  title={homeIsRecording ? '点击停止并记录' : '点击开始语音记录'}
                >
                  <Mic className="h-4 w-4" />
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={handleHomeAiSubmit}
              disabled={homeAiLoading}
              className="flex items-center justify-center rounded-lg px-3 py-2 text-[13px] font-medium text-white disabled:opacity-60"
              style={{ backgroundColor: '#404040' }}
            >
              {homeAiLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : homeParsedResult ? (
                '确认'
              ) : (
                '记录'
              )}
            </button>
          </div>
          {homeAiError && (
            <p className="text-[11px] text-amber-400">{homeAiError}</p>
          )}
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={handleHomeImageClick}
              disabled={homeAiLoading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-[#404040] px-2.5 py-1.5 text-[12px] text-zinc-400 hover:border-[#737373] hover:text-zinc-200 disabled:opacity-60"
            >
              {homeAiLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Camera className="h-4 w-4" />
              )}
              <span>拍照/上传识别</span>
            </button>
            <input
              ref={homeImageInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleHomeImageChange}
            />
            {homeScanHint && (
              <span className="truncate text-[11px] text-zinc-500">{homeScanHint}</span>
            )}
          </div>
          {homeParsedResult && (
            <div className="mt-2 space-y-2 rounded-lg border border-[#27272a] bg-[#18181b] p-2">
              <div className="flex flex-wrap items-center gap-2 border-b border-[#27272a] pb-2">
                <span className="text-[11px] text-zinc-500">记录到</span>
                <select
                  value={Math.min(Math.max(0, homeParsedMealIndex ?? getDefaultMealIndex() ?? 0), (meals?.length ?? 1) - 1)}
                  onChange={(e) => setHomeParsedMealIndex(Number(e.target.value))}
                  className="rounded border border-[#404040] bg-[#27272a] px-2 py-1.5 text-[12px] text-zinc-200"
                >
                  {meals.map((meal, i) => (
                    <option key={`${meal.name}-${i}`} value={i}>
                      {meal.name}
                    </option>
                  ))}
                </select>
                <span className="text-[10px] text-zinc-500">（可根据「中午/早上/练后」等自动识别，可改）</span>
              </div>
              <label className="flex items-center gap-2 text-[11px] text-zinc-400">
                <input
                  type="checkbox"
                  checked={homeStoreAsRaw}
                  onChange={(e) => setHomeStoreAsRaw(e.target.checked)}
                  className="rounded border-[#404040]"
                />
                记录为生重（如 100g 拉面/面条为生面，切到熟重时会按约 2.5 倍显示）
              </label>
              <p className="text-[10px] text-zinc-500">解析克数默认为熟重（可食用状态）；一碗拉面 ≈ 250～300g 熟面。</p>
              {(homeParsedResult.items && homeParsedResult.items.length > 0
                ? homeParsedResult.items
                : [
                    {
                      name: homeAiText || '本餐汇总',
                      grams: 100,
                      protein: homeParsedResult.protein,
                      carbs: homeParsedResult.carbs,
                      fat: homeParsedResult.fat,
                    },
                  ]
              ).map((item, idx) => {
                const kcal = Math.round(
                  (Number(item.protein) || 0) * 4 +
                    (Number(item.carbs) || 0) * 4 +
                    (Number(item.fat) || 0) * 9
                )
                return (
                  <div
                    key={`${item.name}-${idx}`}
                    className="flex items-center justify-between gap-2 rounded-md bg-[#18181b] px-2 py-1"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[12px] text-zinc-200">
                        {item.name} · {Math.round(item.grams || 0)}g
                      </p>
                      <p className="text-[11px] text-zinc-500">
                        {kcal} kcal · P {Math.round(item.protein || 0)}g / C{' '}
                        {Math.round(item.carbs || 0)}g / F {Math.round(item.fat || 0)}g
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
        {/* 今日菜单：紧贴 switch 下方，横向图标 + 文字 */}
        <div className="mt-5 border-t border-[#404040] pt-5">
          <h3 className="mb-4 text-sm font-medium text-zinc-400">今日菜单</h3>
          <div className="flex justify-between gap-2">
            {meals.map((meal, i) => {
              const isConfirmed = meal.confirmed
              return (
                <button
                  key={`${meal.name}-${i}`}
                  type="button"
                  onClick={() => setSelectedMealIndex(i)}
                  className="group flex flex-1 flex-col items-center gap-2 rounded-xl py-3 transition"
                  style={{
                    backgroundColor: 'transparent',
                    border: '1px solid transparent',
                  }}
                >
                  <span
                    className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full transition-colors ${
                      !isConfirmed
                        ? 'bg-[#404040] text-[#FF3D3C] group-active:bg-[#FF3D3C]! group-active:text-white!'
                        : 'bg-[#404040] text-[#BEF264] group-active:bg-[#BEF264]! group-active:text-[#1c1917]!'
                    }`}
                    title={isConfirmed ? '已打卡' : undefined}
                  >
                    {isConfirmed ? (
                      <CircleCheckBig className="h-6 w-6" strokeWidth={2} />
                    ) : (
                      <UtensilsCrossed className="h-6 w-6" />
                    )}
                  </span>
                  <span
                    className="text-[12px] font-medium"
                    style={{ color: '#a1a1aa' }}
                  >
                    {meal.name}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </section>
    </Layout>
  )
}

export default App
