import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { ArrowLeft, CheckCircle, Trash2, ChevronDown, Camera, ScanLine, Mic, Loader2 } from 'lucide-react'
import { QUICK_IDS_REPLACE_NANJU } from '../data/foodDatabase'
import { getDisplayGrams, displayToStoredGrams } from '../data/mealStore'
import { parseMealInput, getMealRecommendation, getMealRecommendationItems } from '../services/nutrientParser'

const NANJU_ID = 'nanju-rice-noodle'

/**
 * 二级记录页：点击一级餐次图标进入。
 * 快捷食材库：按餐次智能推荐、横向/多行展示；点击可替换南巨米粉（确认）；熟重默认开启。
 */
export function MealDetailView({
  meal,
  mealIndex,
  onBack,
  useCookedWeight,
  setUseCookedWeight,
  setMealIngredientGrams,
  setMealConfirmed,
  removeMealIngredient,
  applySuperBowl,
  addOrReplaceQuickIngredient,
  replaceNanjuWithIngredient,
  quickIngredients,
  getRecommendedIdsForMeal,
  getMealMacros,
  targets,
  consumed,
  meals,
  parseFoodTextAndRecord,
  recordAiNutrientResult,
  setMealIngredientsFromAiRecommendation,
  trainingMode,
  TRAINING_MODES,
}) {
  /** 早餐/午餐/晚餐 + 各模式练后餐（练后即刻、练后午餐、练后摄入）显示「这顿吃什么？」AI 推荐 */
  const isAiRecommendedMeal =
    meal.name === '早餐' ||
    meal.name === '午餐' ||
    meal.name === '晚餐' ||
    meal.name === '练后即刻' ||
    meal.name === '练后午餐' ||
    meal.name === '练后摄入'

  const todayEatenFoods = useMemo(() => {
    if (!meals?.length) return []
    const names = []
    const seen = new Set()
    for (const m of meals) {
      for (const ing of m.ingredients || []) {
        if (ing.name && !seen.has(ing.name)) {
          seen.add(ing.name)
          names.push(ing.name)
        }
      }
    }
    return names
  }, [meals])
  const mealMacros = getMealMacros(mealIndex)
  const unconfirmedCount = meals?.filter((m) => !m.confirmed)?.length || 1
  const remaining = useMemo(() => ({
    protein: Math.max(0, (targets?.proteinTarget ?? 0) - (consumed?.protein ?? 0)),
    carbs: Math.max(0, (targets?.carbsTarget ?? 0) - (consumed?.carbs ?? 0)),
    fat: Math.max(0, (targets?.fatTarget ?? 0) - (consumed?.fat ?? 0)),
  }), [targets, consumed])
  const suggestedPerMeal = useMemo(() => ({
    protein: unconfirmedCount > 0 ? Math.round((remaining.protein / unconfirmedCount) * 10) / 10 : 0,
    carbs: unconfirmedCount > 0 ? Math.round((remaining.carbs / unconfirmedCount) * 10) / 10 : 0,
    fat: unconfirmedCount > 0 ? Math.round((remaining.fat / unconfirmedCount) * 10) / 10 : 0,
  }), [remaining, unconfirmedCount])
  const dailyProgress = {
    carbs: (targets?.carbsTarget ?? 0) > 0 ? Math.min((consumed?.carbs ?? 0) / targets.carbsTarget, 1) : 0,
    protein: (targets?.proteinTarget ?? 0) > 0 ? Math.min((consumed?.protein ?? 0) / targets.proteinTarget, 1) : 0,
    fat: (targets?.fatTarget ?? 0) > 0 ? Math.min((consumed?.fat ?? 0) / targets.fatTarget, 1) : 0,
  }
  const hasRice = meal.ingredients.some((i) => i.id === 'rice-cooked')
  const hasNanju = meal.ingredients.some((i) => i.id === NANJU_ID)
  const [editingId, setEditingId] = useState(null)
  const [editValue, setEditValue] = useState('')
  /** 待确认替换：点击「主食类」快捷食材且当前有南巨米粉时，先弹出应用内确认 */
  const [pendingReplace, setPendingReplace] = useState(null)
  const [quickIngredientsCollapsed, setQuickIngredientsCollapsed] = useState(true)
  /** AI 自然语言输入，如「我吃了一碗云阿蛮米线」 */
  const [aiTextInput, setAiTextInput] = useState('')
  const [aiParseError, setAiParseError] = useState('')
  const [aiAdjustment, setAiAdjustment] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [cameraPermission, setCameraPermission] = useState(null)
  const [isRecording, setIsRecording] = useState(false)
  const [speechSupport, setSpeechSupport] = useState(false)
  const [speechLang, setSpeechLang] = useState('zh-CN')
  const mediaRecorderRef = useRef(null)
  const chunksRef = useRef([])
  const imageInputRef = useRef(null)
  const VOICE_AND_IMAGE_API = import.meta.env.VITE_VOICE_AND_IMAGE_API ?? ''

  const [aiRecommendation, setAiRecommendation] = useState({ advice: '', suggestedGrams: {} })
  const [aiRecommendationLoading, setAiRecommendationLoading] = useState(false)
  const [aiRecommendationError, setAiRecommendationError] = useState('')

  const [aiRecommendationItems, setAiRecommendationItems] = useState({ advice: '', items: [] })
  const [aiRecommendationItemsLoading, setAiRecommendationItemsLoading] = useState(false)
  const [aiRecommendationItemsError, setAiRecommendationItemsError] = useState('')
  /** 仅切换餐次或点击「刷新推荐」时重新拉取；点击「采用推荐」不会触发重新拉取 */
  const [recommendationRefreshKey, setRecommendationRefreshKey] = useState(0)

  const trainingModeLabel = useMemo(() => {
    if (!trainingMode) return '未知'
    const map = { morning: '早训', noon: '午训', evening: '晚练', rest: '休息' }
    return map[trainingMode] ?? '未知'
  }, [trainingMode])

  // 午训的练前、晚练的练后：不需要「本餐还能吃什么」与「更多食材」扩展区，避免噪音
  const shouldHideExtraSuggestions = useMemo(() => {
    const name = String(meal?.name || '')
    const isPreWorkout = /练前/.test(name)
    const isPostWorkout = /练后/.test(name)
    return (trainingModeLabel === '午训' && isPreWorkout) || (trainingModeLabel === '晚练' && isPostWorkout)
  }, [meal?.name, trainingModeLabel])

  /** 午餐额度按训练模式：早训/午训时午餐略多（约 55%），晚练时午餐略少（约 45%），休息日 50%；勿差距过大，晚餐也须合理可吃 */
  const lunchShare =
    trainingModeLabel === '早训' || trainingModeLabel === '午训' ? 0.55
    : trainingModeLabel === '晚练' ? 0.45
    : 0.5
  const remainingForRecommendation =
    meal.name === '午餐'
      ? {
          protein: Math.max(0, Math.round(remaining.protein * lunchShare)),
          carbs: Math.max(0, Math.round(remaining.carbs * lunchShare)),
          fat: Math.max(0, Math.round(remaining.fat * lunchShare)),
        }
      : { protein: remaining.protein, carbs: remaining.carbs, fat: remaining.fat }

  /** AI 本餐推荐缓存 key：按日期 + 训练模式 + 餐次名称区分，避免每次进入详情都重新走 LLM */
  const aiCacheKey = useMemo(() => {
    if (typeof window === 'undefined') return null
    const now = new Date()
    const y = now.getFullYear()
    const m = String(now.getMonth() + 1).padStart(2, '0')
    const d = String(now.getDate()).padStart(2, '0')
    const mode = trainingMode || 'unknown'
    return `the-body-ai-rec-${y}-${m}-${d}-${mode}-${meal.name}`
  }, [trainingMode, meal.name])

  /** 仅切换餐次或点击「刷新推荐」时拉取；不依赖 remaining/consumed，避免「采用推荐」后误触发重新拉取 */
  useEffect(() => {
    if (!isAiRecommendedMeal) return
    // 若有缓存且当前是首次进入（refresh key=0），直接用缓存结果，避免重复请求
    if (aiCacheKey && recommendationRefreshKey === 0 && typeof window !== 'undefined') {
      try {
        const cached = window.sessionStorage.getItem(aiCacheKey)
        if (cached) {
          const parsed = JSON.parse(cached)
          if (parsed && Array.isArray(parsed.items)) {
            setAiRecommendationItems({ advice: parsed.advice || '', items: parsed.items })
            return
          }
        }
      } catch (_) {
        // 缓存解析失败时忽略，正常发起请求
      }
    }
    setAiRecommendationItemsLoading(true)
    setAiRecommendationItemsError('')
    getMealRecommendationItems({
      remaining: remainingForRecommendation,
      mealName: meal.name,
      consumed: {
        protein: consumed?.protein ?? 0,
        carbs: consumed?.carbs ?? 0,
        fat: consumed?.fat ?? 0,
      },
      todayEatenFoods,
      currentMonth: new Date().getMonth() + 1,
      trainingModeLabel,
      preferBreakfastAlternative: meal.name === '早餐' && recommendationRefreshKey > 0,
      // 用户连续刷新 2 次，通常代表“不想吃超级碗了”，此时强制推荐其它可执行方案
      avoidSuperBowl: meal.name !== '早餐' && recommendationRefreshKey >= 2,
    })
      .then((res) => {
        const next = { advice: res.advice || '', items: res.items || [] }
        setAiRecommendationItems(next)
        if (aiCacheKey && typeof window !== 'undefined') {
          try {
            window.sessionStorage.setItem(aiCacheKey, JSON.stringify(next))
          } catch (_) {
            // 缓存失败不影响正常使用
          }
        }
      })
      .catch((err) => {
        setAiRecommendationItemsError(err?.message || 'AI 本餐推荐获取失败')
        setAiRecommendationItems({ advice: '', items: [] })
      })
      .finally(() => setAiRecommendationItemsLoading(false))
  }, [isAiRecommendedMeal, meal.name, trainingModeLabel, recommendationRefreshKey])

  const refreshRecommendation = useCallback(() => {
    setRecommendationRefreshKey((k) => k + 1)
  }, [])

  useEffect(() => {
    if (!isAiRecommendedMeal && quickIngredients?.length) {
      setAiRecommendationLoading(true)
      setAiRecommendationError('')
      getMealRecommendation({
        remaining: { protein: remaining.protein, carbs: remaining.carbs, fat: remaining.fat },
        mealName: meal.name,
        ingredients: quickIngredients.map((q) => ({
          id: q.id,
          name: q.name,
          proteinPer100: q.proteinPer100 ?? 0,
          carbsPer100: q.carbsPer100 ?? 0,
          fatPer100: q.fatPer100 ?? 0,
          defaultGrams: q.grams ?? 100,
        })),
      })
        .then((res) => setAiRecommendation({ advice: res.advice || '', suggestedGrams: res.suggestedGrams || {} }))
        .catch((err) => {
          setAiRecommendationError(err?.message || 'AI 推荐获取失败')
          setAiRecommendation({ advice: '', suggestedGrams: {} })
        })
        .finally(() => setAiRecommendationLoading(false))
    }
  }, [isAiRecommendedMeal, meal.name, remaining.protein, remaining.carbs, remaining.fat, quickIngredients])

  useEffect(() => {
    setSpeechSupport(!!navigator.mediaDevices?.getUserMedia)
    return () => {
      if (mediaRecorderRef.current) {
        mediaRecorderRef.current.stream.getTracks().forEach((t) => t.stop())
        mediaRecorderRef.current = null
      }
    }
  }, [])

  const toggleSpeechRecognition = useCallback(() => {
    if (!speechSupport || aiLoading) return
    if (isRecording) {
      // 第二次点击：停止录音并上传
      setIsRecording(false)
      if (mediaRecorderRef.current) {
        mediaRecorderRef.current.stop()
      }
      return
    }
    // 第一次点击：开始录音
    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        const mr = new MediaRecorder(stream)
        chunksRef.current = []
        mr.ondataavailable = (e) => {
          if (e.data?.size > 0) chunksRef.current.push(e.data)
        }
        mr.onstop = async () => {
          mediaRecorderRef.current?.stream.getTracks().forEach((t) => t.stop())
          mediaRecorderRef.current = null
          const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
          chunksRef.current = []
          if (blob.size === 0) return
          try {
            setAiLoading(true)
            setAiParseError('')
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
            if (text) setAiTextInput((prev) => (prev ? prev + ' ' + text : text))
          } catch (err) {
            setAiParseError(err?.message || '语音识别失败')
          } finally {
            setAiLoading(false)
          }
        }
        mediaRecorderRef.current = mr
        setIsRecording(true)
        mr.start()
      })
      .catch(() => {
        setAiParseError('无法访问麦克风，请检查浏览器权限')
      })
  }, [speechSupport, aiLoading])

  const handleAiTextSubmit = useCallback(async () => {
    const text = aiTextInput.trim()
    setAiParseError('')
    setAiAdjustment('')
    if (!text) return
    if (typeof recordAiNutrientResult !== 'function' || typeof parseFoodTextAndRecord !== 'function') return

    setAiLoading(true)
    try {
      const result = await parseMealInput(text, meal.name)
      recordAiNutrientResult(mealIndex, result, text)
      setAiTextInput('')
      if (result.adjustment) setAiAdjustment(result.adjustment)
    } catch (err) {
      const msg = err?.message ?? String(err ?? '未知错误')
      const isNetwork = /fetch|network|cors|跨域/i.test(msg)
      const fallback = parseFoodTextAndRecord(text, mealIndex)
      if (fallback) {
        setAiTextInput('')
      } else {
        setAiParseError(isNetwork ? `${msg}（若为跨域，可用 Vite 代理或后端转发 API）` : msg)
      }
    } finally {
      setAiLoading(false)
    }
  }, [aiTextInput, mealIndex, meal.name, parseFoodTextAndRecord, recordAiNutrientResult])

  const requestCameraPermission = useCallback(() => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraPermission('unsupported')
      return
    }
    navigator.mediaDevices
      .getUserMedia({ video: true })
      .then((stream) => {
        stream.getTracks().forEach((t) => t.stop())
        setCameraPermission('granted')
      })
      .catch(() => setCameraPermission('denied'))
  }, [])

  const handleImageClick = useCallback(() => {
    setAiParseError('')
    if (imageInputRef.current) imageInputRef.current.click()
  }, [])

  const handleImageChange = useCallback(
    async (e) => {
      const file = e.target.files?.[0]
      if (!file) return
      if (!/^image\/(jpeg|png|webp|gif)$/i.test(file.type)) {
        setAiParseError('请选择 JPEG/PNG/WebP/GIF 图片')
        return
      }
      if (file.size > 5 * 1024 * 1024) {
        setAiParseError('图片请小于 5MB')
        return
      }
      setAiParseError('')
      setAiLoading(true)
      try {
        const formData = new FormData()
        formData.append('image', file)
        const resp = await fetch((VOICE_AND_IMAGE_API ? VOICE_AND_IMAGE_API + '/' : '') + 'api/image-to-meal-description', {
          method: 'POST',
          body: formData,
        })
        const data = await resp.json().catch(() => ({}))
        if (!resp.ok) throw new Error(data?.error || `识别失败 ${resp.status}`)
        const description = (data?.text || '').trim()
        if (!description) throw new Error('未识别到餐食描述')
        setAiTextInput(description)
        const result = await parseMealInput(description, meal.name)
        if (typeof recordAiNutrientResult === 'function') {
          recordAiNutrientResult(mealIndex, result, description)
        }
        setAiTextInput('')
      } catch (err) {
        setAiParseError(err?.message || '照片识别失败')
      } finally {
        setAiLoading(false)
        if (imageInputRef.current) imageInputRef.current.value = ''
      }
    },
    [VOICE_AND_IMAGE_API, meal.name, mealIndex, recordAiNutrientResult]
  )

  const recommendedIds = useMemo(() => getRecommendedIdsForMeal(meal.name) || [], [getRecommendedIdsForMeal, meal.name])
  const recommended = useMemo(() => quickIngredients.filter((q) => recommendedIds.includes(q.id)), [quickIngredients, recommendedIds])
  const others = useMemo(() => quickIngredients.filter((q) => !recommendedIds.includes(q.id)), [quickIngredients, recommendedIds])

  /** 优先使用 AI 推荐克数；若无则按今日剩余 P/C/F 计算上限（fallback） */
  const getSuggestedGrams = useCallback(
    (ing) => {
      const aiG = aiRecommendation.suggestedGrams[ing.id]
      if (typeof aiG === 'number' && !Number.isNaN(aiG)) return Math.max(0, Math.round(aiG / 5) * 5)
      const defaultG = ing.grams ?? 100
      const p100 = ing.proteinPer100 ?? 0
      const c100 = ing.carbsPer100 ?? 0
      const f100 = ing.fatPer100 ?? 0
      let cap = defaultG
      if (c100 > 0 && remaining.carbs >= 0) cap = Math.min(cap, (remaining.carbs * 100) / c100)
      if (p100 > 0 && remaining.protein >= 0) cap = Math.min(cap, (remaining.protein * 100) / p100)
      if (f100 > 0 && remaining.fat >= 0) cap = Math.min(cap, (remaining.fat * 100) / f100)
      const g = Math.max(0, Math.round(cap / 5) * 5)
      return g < 5 && cap > 0 ? 5 : g
    },
    [remaining, aiRecommendation.suggestedGrams]
  )

  const handleQuickIngredientClick = (q) => {
    const suggestedGrams = getSuggestedGrams(q)
    const ingredientToUse = { ...q, grams: suggestedGrams }
    const canReplaceNanju = QUICK_IDS_REPLACE_NANJU.some((id) => q.id === id || q.id.startsWith(id + '-'))
    if (hasNanju && canReplaceNanju) {
      setPendingReplace({ ingredient: ingredientToUse })
      return
    }
    addOrReplaceQuickIngredient(mealIndex, ingredientToUse)
  }

  const confirmReplace = () => {
    if (pendingReplace?.ingredient) {
      const ing = pendingReplace.ingredient
      const suggestedGrams = getSuggestedGrams(ing)
      replaceNanjuWithIngredient(mealIndex, { ...ing, grams: suggestedGrams })
      setPendingReplace(null)
    }
  }

  const cancelReplace = () => {
    if (pendingReplace?.ingredient) {
      const ing = pendingReplace.ingredient
      const suggestedGrams = getSuggestedGrams(ing)
      addOrReplaceQuickIngredient(mealIndex, { ...ing, grams: suggestedGrams })
    }
    setPendingReplace(null)
  }

  const startEdit = (ing) => {
    setEditingId(ing.id)
    setEditValue(String(getDisplayGrams(ing, useCookedWeight)))
  }

  const saveEdit = () => {
    if (editingId != null) {
      const ing = meal.ingredients.find((i) => i.id === editingId)
      const displayVal = parseFloat(editValue) || 0
      const storedGrams = ing ? displayToStoredGrams(ing, displayVal, useCookedWeight) : displayVal
      setMealIngredientGrams(mealIndex, editingId, storedGrams)
      setEditingId(null)
    }
  }

  return (
    <div className="relative flex flex-col gap-4">
      {/* 应用内确认：是否用该食材替换南巨米粉 */}
      {pendingReplace?.ingredient && (
        <div
          className="fixed inset-0 z-20 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
          onClick={cancelReplace}
        >
          <div
            className="w-full max-w-[320px] rounded-xl border border-[#404040] p-5"
            style={{ backgroundColor: '#393939' }}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="mb-4 text-[14px] leading-relaxed text-zinc-200">
              是否用「{pendingReplace.ingredient.name}」替换「南巨米粉」？
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={cancelReplace}
                className="flex-1 rounded-lg border border-[#404040] py-2.5 text-[13px] font-medium text-zinc-300"
              >
                取消
              </button>
              <button
                type="button"
                onClick={confirmReplace}
                className="flex-1 rounded-lg py-2.5 text-[13px] font-semibold text-white"
                style={{ backgroundColor: '#FF3D3C' }}
              >
                确定替换
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-[#404040] text-zinc-300 hover:bg-[#404040]"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h2 className="text-lg font-semibold text-zinc-100">{meal.name}</h2>
      </div>

      {/* 拍照/上传识别 & 文本识别：已在首页完成闭环，这里不再重复展示 */}

      {/* 今日摄入进度（与首页仪表盘一致）+ 今日剩余 + 本餐建议 + 熟重开关 */}
      <div className="rounded-xl border border-[#404040] p-4" style={{ backgroundColor: '#393939' }}>
        <p className="mb-2 text-[11px] uppercase tracking-wide text-zinc-500">今日摄入 · 与首页同步</p>
        <div className="mb-3 grid grid-cols-3 gap-3">
          {[
            { key: 'carbs', label: '碳水', consumed: consumed?.carbs ?? 0, target: targets?.carbsTarget ?? 0, remaining: remaining.carbs, mealVal: mealMacros.carbs, suggested: suggestedPerMeal.carbs, color: '#86efac', track: 'rgba(134,239,172,0.25)' },
            { key: 'protein', label: '蛋白质', consumed: consumed?.protein ?? 0, target: targets?.proteinTarget ?? 0, remaining: remaining.protein, mealVal: mealMacros.protein, suggested: suggestedPerMeal.protein, color: '#FC8D87', track: 'rgba(252,141,135,0.25)' },
            { key: 'fat', label: '脂肪', consumed: consumed?.fat ?? 0, target: targets?.fatTarget ?? 0, remaining: remaining.fat, mealVal: mealMacros.fat, suggested: suggestedPerMeal.fat, color: '#FBCB9B', track: 'rgba(251,203,155,0.25)' },
          ].map(({ key, label, consumed: c, target, remaining: rem, mealVal, suggested, color, track }) => (
            <div key={key} className="min-w-0">
              <p className="mb-1 truncate text-[11px] text-zinc-500">{label}</p>
              <div className="mb-1 h-1.5 w-full overflow-hidden rounded-full" style={{ backgroundColor: track }}>
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${Math.min((target > 0 ? c / target : 0) * 100, 100)}%`, backgroundColor: color }}
                />
              </div>
              <p className="text-[10px] tabular-nums text-zinc-400">
                {Math.round(c)}/{Math.round(target)}g 剩{Math.round(rem)}g
              </p>
              <p className="mt-0.5 text-[10px] tabular-nums text-zinc-500">
                本餐{Math.round(mealVal)}g 建议≈{Math.round(suggested)}g
              </p>
            </div>
          ))}
        </div>
        {remaining.carbs < 0 && (
          <p className="mb-2 rounded-lg border border-red-500/40 bg-red-500/10 px-2.5 py-1.5 text-[11px] text-red-200/90">
            今日碳水已超标，本餐建议低碳。
          </p>
        )}
        {remaining.carbs >= 0 && remaining.carbs < 25 && (
          <p className="mb-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-200/90">
            碳水余额较少，本餐建议低碳：优先蛋白质与蔬菜，主食少或省略。
          </p>
        )}
        <div className="flex items-center justify-between border-t border-[#404040] pt-3">
          <span className="text-[12px] text-zinc-500">重量显示</span>
          <button
            type="button"
            onClick={() => setUseCookedWeight(!useCookedWeight)}
            className="rounded-full px-3 py-1.5 text-[12px] transition"
            style={{
              backgroundColor: useCookedWeight ? '#FF3D3C' : '#404040',
              color: '#fff',
            }}
          >
            {useCookedWeight ? '熟重' : '生重'}
          </button>
        </div>
      </div>

      {/* 这顿吃什么？：早餐/午餐/晚餐/练后即刻 = AI 推荐列表 + 采用推荐（练后即刻优先推荐蛋白粉）；其他餐 = 当前已选 + 本餐还能吃什么 */}
      <div className="rounded-xl border border-[#404040] overflow-hidden">
        <div className="bg-[#393939] px-3 py-2 text-[11px] uppercase tracking-wide text-zinc-500">
          这顿吃什么？
        </div>
        {isAiRecommendedMeal ? (
          <>
            {aiRecommendationItemsLoading && (
              <div className="px-4 py-4 text-[13px] text-zinc-500">正在生成{meal.name}推荐…</div>
            )}
            {aiRecommendationItemsError && (
              <div className="border-b border-[#404040] bg-[#323232] px-4 py-3">
                <p className="text-[12px] text-amber-400">{aiRecommendationItemsError}</p>
                <button
                  type="button"
                  onClick={refreshRecommendation}
                  disabled={aiRecommendationItemsLoading}
                  className="mt-3 rounded-lg border border-amber-500/50 bg-amber-500/10 px-4 py-2 text-[13px] text-amber-400 disabled:opacity-50"
                >
                  刷新重试
                </button>
              </div>
            )}
            {!aiRecommendationItemsLoading && (aiRecommendationItems.advice || aiRecommendationItems.items?.length > 0) && (
              <div className="border-b border-[#404040] bg-[#323232] px-3 py-3">
                {aiRecommendationItems.advice && (
                  <p className="mb-3 text-[12px] leading-relaxed text-zinc-300">{aiRecommendationItems.advice}</p>
                )}
                <ul className="space-y-2">
                  {aiRecommendationItems.items.map((it, i) => (
                    <li key={i} className="flex items-center justify-between text-[13px] text-zinc-200">
                      <span>{it.name}</span>
                      <span className="text-[#FF3D3C]">{Math.round(it.grams)}g</span>
                    </li>
                  ))}
                </ul>
                {aiRecommendationItems.advice && !aiRecommendationItems.items?.length && (
                  <p className="mb-2 text-[11px] text-amber-500/90">推荐结果暂无具体食材项，请点击「刷新」重试。</p>
                )}
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (aiRecommendationItems.items?.length) {
                        setMealIngredientsFromAiRecommendation(mealIndex, aiRecommendationItems.items)
                      }
                    }}
                    disabled={!aiRecommendationItems.items?.length}
                    className="flex-1 rounded-lg py-2.5 text-[13px] font-medium text-white disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ backgroundColor: '#FF3D3C' }}
                  >
                    采用推荐
                  </button>
                  <button
                    type="button"
                    onClick={refreshRecommendation}
                    disabled={aiRecommendationItemsLoading}
                    className="shrink-0 rounded-lg border border-zinc-500 px-3 py-2.5 text-[13px] text-zinc-300 disabled:opacity-50"
                  >
                    刷新
                  </button>
                </div>
              </div>
            )}
            {meal.ingredients.length > 0 ? (
              <div className="px-3 py-2">
                <p className="mb-2 text-[11px] text-zinc-500">当前已选（可编辑）— 来自「采用推荐」或手动添加</p>
                <ul className="divide-y divide-[#404040]">
                  {meal.ingredients.map((ing) => (
                    <li
                      key={ing.id}
                      className="flex items-center justify-between gap-2 py-3"
                      style={{ backgroundColor: 'transparent' }}
                    >
                      <span className="min-w-0 flex-1 text-[13px] text-zinc-200">{ing.name}</span>
                      <div className="flex shrink-0 items-center gap-2">
                        {editingId === ing.id ? (
                          <input
                            type="number"
                            min={0}
                            step={1}
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={saveEdit}
                            onKeyDown={(e) => e.key === 'Enter' && saveEdit()}
                            className="w-20 rounded border border-[#404040] bg-[#2a2a2a] px-2 py-1.5 text-right text-[13px] text-zinc-100"
                            autoFocus
                          />
                        ) : (
                          <button
                            type="button"
                            onClick={() => startEdit(ing)}
                            className="rounded px-2 py-1 text-[13px] font-medium text-[#FF3D3C] hover:bg-[#404040]"
                          >
                            {Math.round(getDisplayGrams(ing, useCookedWeight))}g
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => removeMealIngredient(mealIndex, ing.id)}
                          className="rounded p-1.5 text-zinc-400 hover:bg-[#404040] hover:text-zinc-200"
                          title="删除"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="px-3 py-2">
                <p className="text-[11px] text-zinc-500">当前未选食材，点击上方「采用推荐」填入本餐，或稍后手动添加。</p>
              </div>
            )}
          </>
        ) : (
          <>
            <ul className="divide-y divide-[#404040]">
              {meal.ingredients.map((ing) => (
                <li
                  key={ing.id}
                  className="flex items-center justify-between gap-2 px-4 py-3"
                  style={{ backgroundColor: '#3a3a3a' }}
                >
                  <span className="min-w-0 flex-1 text-[13px] text-zinc-200">{ing.name}</span>
                  <div className="flex shrink-0 items-center gap-2">
                    {editingId === ing.id ? (
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={saveEdit}
                        onKeyDown={(e) => e.key === 'Enter' && saveEdit()}
                        className="w-20 rounded border border-[#404040] bg-[#2a2a2a] px-2 py-1.5 text-right text-[13px] text-zinc-100"
                        autoFocus
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => startEdit(ing)}
                        className="rounded px-2 py-1 text-[13px] font-medium text-[#FF3D3C] hover:bg-[#404040]"
                      >
                        {Math.round(getDisplayGrams(ing, useCookedWeight))}g
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => removeMealIngredient(mealIndex, ing.id)}
                      className="rounded p-1.5 text-zinc-400 hover:bg-[#404040] hover:text-zinc-200"
                      title="删除"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            {!shouldHideExtraSuggestions && meal.name !== '练后即刻' && (
              <>
                <button
                  type="button"
                  onClick={() => setQuickIngredientsCollapsed((c) => !c)}
                  className="flex w-full items-center gap-1.5 border-t border-[#404040] px-3 py-2 text-[12px] text-zinc-500 hover:bg-[#323232]"
                >
                  <span>{quickIngredientsCollapsed ? '本餐还能吃什么（点击展开）' : '收起'}</span>
                  <ChevronDown
                    className="h-4 w-4 shrink-0 transition-transform"
                    style={{ transform: quickIngredientsCollapsed ? 'rotate(-90deg)' : 'none', color: '#FF3D3C' }}
                  />
                </button>
                {!quickIngredientsCollapsed && (
                  <div className="border-t border-[#404040] bg-[#323232] px-3 py-3">
                    <p className="mb-2 text-[11px] uppercase tracking-wide text-zinc-500">本餐还能吃什么</p>
                    {aiRecommendationLoading && <p className="mb-2 text-[12px] text-zinc-500">正在生成建议…</p>}
                    {aiRecommendationError && <p className="mb-2 text-[12px] text-amber-400">{aiRecommendationError}</p>}
                    {!aiRecommendationLoading && aiRecommendation.advice && (
                      <p className="mb-3 text-[12px] leading-relaxed text-zinc-300">{aiRecommendation.advice}</p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      {recommended.map((q) => {
                        const suggested = getSuggestedGrams(q)
                        const disabled = suggested <= 0
                        return (
                          <button
                            key={q.id}
                            type="button"
                            disabled={disabled}
                            onClick={() => !disabled && handleQuickIngredientClick(q)}
                            className="shrink-0 rounded-xl border border-[#BEF264] bg-[#2a3320] px-3 py-2 text-[13px] text-[#BEF264] transition hover:bg-[#404040] disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {q.name}
                            <span className="ml-1 text-zinc-500">{suggested <= 0 ? '已满' : `约${suggested}g`}</span>
                          </button>
                        )
                      })}
                      {others.map((q) => {
                        const suggested = getSuggestedGrams(q)
                        const disabled = suggested <= 0
                        return (
                          <button
                            key={q.id}
                            type="button"
                            disabled={disabled}
                            onClick={() => !disabled && handleQuickIngredientClick(q)}
                            className="shrink-0 rounded-xl border border-[#404040] px-3 py-2 text-[13px] text-zinc-200 transition hover:border-[#FF3D3C] hover:bg-[#404040] disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {q.name}
                            <span className="ml-1 text-zinc-500">{suggested <= 0 ? '已满' : `约${suggested}g`}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>

      {/* 超级碗/标准分量：150g 碳水 + 35g 蛋白质 */}
      {hasRice && (
        <button
          type="button"
          onClick={() => applySuperBowl(mealIndex)}
          className="w-full rounded-xl border border-[#FF3D3C] py-3 text-[13px] font-medium text-[#FF3D3C] transition hover:bg-[#FF3D3C] hover:text-white"
        >
          超级碗 / 标准分量
        </button>
      )}

      {/* 快捷食材库：仅练后等非 AI 推荐餐显示，早餐/午餐/晚餐以「这顿吃什么？」AI 推荐为主 */}
      {!isAiRecommendedMeal && !shouldHideExtraSuggestions && others.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setQuickIngredientsCollapsed((c) => !c)}
            className="mb-2 flex w-full items-center gap-1.5 text-[12px] text-zinc-500"
          >
            <span>更多食材（展开）</span>
            <ChevronDown
              className="h-4 w-4 shrink-0 transition-transform"
              style={{
                transform: quickIngredientsCollapsed ? 'rotate(-90deg)' : 'none',
                color: '#FF3D3C',
              }}
            />
          </button>
          {!quickIngredientsCollapsed && (
            <div className="flex flex-wrap gap-2">
              {others.map((q) => {
                const suggested = getSuggestedGrams(q)
                const disabled = suggested <= 0
                return (
                  <button
                    key={q.id}
                    type="button"
                    disabled={disabled}
                    onClick={() => !disabled && handleQuickIngredientClick(q)}
                    className="shrink-0 rounded-xl border border-[#404040] px-3 py-2 text-[13px] text-zinc-200 transition hover:border-[#FF3D3C] hover:bg-[#404040] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {q.name}
                    <span className="ml-1 text-zinc-500">{suggested <= 0 ? '已满' : `约${suggested}g`}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* 打卡 / 确认已摄入：点击计入仪表盘，再点一次取消打卡 */}
      <div className="pt-2">
        {meal.confirmed ? (
          <button
            type="button"
            onClick={() => setMealConfirmed(mealIndex, false)}
            className="flex w-full items-center justify-center gap-2 rounded-xl py-4 text-[14px] font-medium transition hover:opacity-90"
            style={{ backgroundColor: '#2a4a2a', color: '#86efac' }}
            title="点击取消打卡"
          >
            <CheckCircle className="h-5 w-5" />
            已打卡（点击取消）
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setMealConfirmed(mealIndex, true)}
            className="w-full rounded-xl py-4 text-[14px] font-semibold text-white transition"
            style={{ backgroundColor: '#FF3D3C' }}
          >
            确认已摄入
          </button>
        )}
      </div>
    </div>
  )
}
