import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import {
  DEFAULT_MEALS_BY_MODE,
  FOOD_DATABASE,
  getRecommendedIdsForMeal,
  macrosFromIngredients,
  TRAINING_MODES,
  LUNCH_RICE_CARB_POOL_G,
  RICE_COOKED_CARBS_PER100,
} from '../data/mealStore'
import {
  parseFoodText,
  shouldSuggestMicroAdjust,
  getReductionPlan,
  applyReductionToMeals,
  capLastMealToAllowance,
  shouldSwitchToNoonMode,
} from '../services/AIService'

const MORNING_LUNCH_INDEX = 2
const MORNING_POST_IMMEDIATE_INDEX = 1

const PROTEIN_PER_KG = 1.8
const CARBS_PER_KG = 1.5
const FAT_PER_KG = 0.7
const REST_DAY_CARBS_FACTOR = 0.8

function round1(v) {
  return Math.round((v ?? 0) * 10) / 10
}

function deepCloneMeals(meals) {
  const next = JSON.parse(JSON.stringify(meals))
  next.forEach((m) => {
    if (m.confirmed === undefined) m.confirmed = false
  })
  return next
}

/** 早训时：练后即刻碳水增加则午餐米饭克数减少（扣午餐额度） */
function syncMorningLunchRice(meals, useCookedWeight) {
  const lunch = meals[MORNING_LUNCH_INDEX]
  const rice = lunch?.ingredients?.find((i) => i.id === 'rice-cooked')
  if (!rice) return meals
  const carbsPost = macrosFromIngredients(meals[MORNING_POST_IMMEDIATE_INDEX].ingredients, useCookedWeight).carbs
  const riceCarbsAllowed = LUNCH_RICE_CARB_POOL_G - carbsPost
  rice.grams = Math.max(0, Math.round((riceCarbsAllowed / RICE_COOKED_CARBS_PER100) * 100))
  return meals
}

export function useMealStore(options = {}) {
  const { initialMode = TRAINING_MODES.MORNING, weight: initialWeight = 72 } = options

  const [trainingMode, setTrainingModeState] = useState(initialMode)
  const [meals, setMeals] = useState(() => deepCloneMeals(DEFAULT_MEALS_BY_MODE[initialMode]))
  const [useCookedWeight, setUseCookedWeight] = useState(true)
  const [weight, setWeight] = useState(initialWeight)
  /** 从餐次中删除的食材会加入此处，出现在快捷食材库中便于再次添加 */
  const [deletedIngredients, setDeletedIngredients] = useState([])

  useEffect(() => {
    setMeals(deepCloneMeals(DEFAULT_MEALS_BY_MODE[trainingMode]))
  }, [trainingMode])

  const isGymDay = trainingMode !== TRAINING_MODES.REST
  const targets = useMemo(() => {
    const proteinTarget = weight * PROTEIN_PER_KG
    const carbsBase = weight * CARBS_PER_KG
    const carbsTarget = isGymDay ? carbsBase : carbsBase * REST_DAY_CARBS_FACTOR
    const fatTarget = weight * FAT_PER_KG
    return {
      proteinTarget: round1(proteinTarget),
      carbsTarget: round1(carbsTarget),
      fatTarget: round1(fatTarget),
    }
  }, [weight, isGymDay])

  /** 仅统计已打卡（确认已摄入）的餐次 */
  const consumed = useMemo(() => {
    let p = 0, c = 0, f = 0
    meals.forEach((meal) => {
      if (!meal.confirmed) return
      const mac = macrosFromIngredients(meal.ingredients, useCookedWeight)
      p += mac.protein
      c += mac.carbs
      f += mac.fat
    })
    return { protein: round1(p), carbs: round1(c), fat: round1(f) }
  }, [meals, useCookedWeight])

  const setTrainingMode = useCallback((mode) => {
    setTrainingModeState(mode)
  }, [])

  const setMealIngredientGrams = useCallback((mealIndex, ingredientId, grams) => {
    const g = Math.max(0, Number(grams) || 0)
    setMeals((prev) => {
      const next = deepCloneMeals(prev)
      const meal = next[mealIndex]
      if (!meal) return prev
      const ing = meal.ingredients.find((i) => i.id === ingredientId)
      if (ing) ing.grams = g
      if (trainingMode === TRAINING_MODES.MORNING && mealIndex === MORNING_POST_IMMEDIATE_INDEX) {
        syncMorningLunchRice(next, useCookedWeight)
      }
      return next
    })
  }, [trainingMode, useCookedWeight])

  const removeMealIngredient = useCallback((mealIndex, ingredientId) => {
    setMeals((prev) => {
      const meal = prev[mealIndex]
      const ing = meal?.ingredients?.find((i) => i.id === ingredientId)
      if (ing) {
        setDeletedIngredients((d) => [...d.filter((x) => x.name !== ing.name), { ...ing }])
      }
      const next = deepCloneMeals(prev)
      const mealNext = next[mealIndex]
      if (!mealNext || !mealNext.ingredients.length) return prev
      mealNext.ingredients = mealNext.ingredients.filter((i) => i.id !== ingredientId)
      if (trainingMode === TRAINING_MODES.MORNING && mealIndex === MORNING_POST_IMMEDIATE_INDEX) {
        syncMorningLunchRice(next, useCookedWeight)
      }
      return next
    })
  }, [trainingMode, useCookedWeight])

  const setMealConfirmed = useCallback((mealIndex, confirmed) => {
    setMeals((prev) => {
      const next = deepCloneMeals(prev)
      const meal = next[mealIndex]
      if (meal) meal.confirmed = !!confirmed
      return next
    })
    if (confirmed && mealIndex === 0 && shouldSwitchToNoonMode(trainingMode, new Date())) {
      setTrainingModeState(TRAINING_MODES.NOON)
    }
  }, [trainingMode])

  const addOrReplaceQuickIngredient = useCallback((mealIndex, quickIngredient) => {
    const item = { ...quickIngredient, id: quickIngredient.id + '-' + Date.now() }
    setMeals((prev) => {
      const next = deepCloneMeals(prev)
      const meal = next[mealIndex]
      if (!meal) return prev
      const existing = meal.ingredients.findIndex((i) => i.name === quickIngredient.name)
      if (existing >= 0) {
        meal.ingredients[existing].grams = item.grams
      } else {
        meal.ingredients.push({ ...item })
      }
      if (trainingMode === TRAINING_MODES.MORNING && mealIndex === MORNING_POST_IMMEDIATE_INDEX) {
        syncMorningLunchRice(next, useCookedWeight)
      }
      return next
    })
  }, [trainingMode, useCookedWeight])

  /** 用快捷食材替换当前餐次中的南巨米粉（一键替换逻辑） */
  const replaceNanjuWithIngredient = useCallback((mealIndex, quickIngredient) => {
    const item = { ...quickIngredient, id: quickIngredient.id + '-' + Date.now() }
    setMeals((prev) => {
      const next = deepCloneMeals(prev)
      const meal = next[mealIndex]
      if (!meal) return prev
      meal.ingredients = meal.ingredients.filter((i) => i.id !== 'nanju-rice-noodle')
      meal.ingredients.push({ ...item })
      if (trainingMode === TRAINING_MODES.MORNING && mealIndex === MORNING_POST_IMMEDIATE_INDEX) {
        syncMorningLunchRice(next, useCookedWeight)
      }
      return next
    })
  }, [trainingMode, useCookedWeight])

  /** 超级碗/标准分量：碳水 150g 熟米饭 + 蛋白质 35g 对应熟肉（约 150g 鸡胸或 113g 鸡胸） */
  const applySuperBowl = useCallback((mealIndex) => {
    const riceG = 150
    const proteinTargetG = 35
    setMeals((prev) => {
      const next = deepCloneMeals(prev)
      const meal = next[mealIndex]
      if (!meal) return prev
      const rice = meal.ingredients.find((i) => i.id === 'rice-cooked')
      if (rice) rice.grams = riceG
      const meat = meal.ingredients.find((i) => i.id === 'chicken' || i.id === 'fish')
      if (meat) {
        const p100 = meat.proteinPer100 || 31
        meat.grams = Math.round((proteinTargetG / p100) * 100)
      }
      return next
    })
  }, [])

  const getMealMacros = useCallback(
    (mealIndex) => {
      const meal = meals[mealIndex]
      if (!meal) return { protein: 0, carbs: 0, fat: 0 }
      return macrosFromIngredients(meal.ingredients, useCookedWeight)
    },
    [meals, useCookedWeight]
  )

  /** 自然语言解析并记录到指定餐次，如「我吃了两块全家鸡胸」（关键词匹配） */
  const parseFoodTextAndRecord = useCallback((text, mealIndex) => {
    const result = parseFoodText(text)
    if (!result) return false
    const item = { ...result.food, grams: result.grams }
    setMeals((prev) => {
      const next = deepCloneMeals(prev)
      const meal = next[mealIndex]
      if (!meal) return prev
      if (!Array.isArray(meal.ingredients)) meal.ingredients = []
      const existing = meal.ingredients.findIndex((i) => i.name === result.food.name)
      const newItem = { ...item, id: (item.id || 'ai') + '-' + Date.now() }
      if (existing >= 0) {
        meal.ingredients[existing].grams = newItem.grams
      } else {
        meal.ingredients.push(newItem)
      }
      if (trainingMode === TRAINING_MODES.MORNING && mealIndex === MORNING_POST_IMMEDIATE_INDEX) {
        syncMorningLunchRice(next, useCookedWeight)
      }
      return next
    })
    return true
  }, [trainingMode, useCookedWeight])

  /**
   * 将 AI 解析结果写入指定餐次。若有 result.items（拆解后的食材与克数），则逐条写入；否则写一条汇总虚拟食材。
   * @param mealIndex - 餐次下标
   * @param result - { protein, carbs, fat, items?: [{ name, grams, protein, carbs, fat }] }
   * @param sourceText - 用户输入（如「一碗云阿蛮米线」）
   * @param options - { storeAsRaw: boolean, replaceExisting?: boolean } replaceExisting 为 true 时用解析结果覆盖该餐默认食材，否则追加
   */
  const recordAiNutrientResult = useCallback((mealIndex, result, sourceText, options = {}) => {
    const { storeAsRaw = false, replaceExisting = false } = options
    const ts = Date.now()
    const isNoodle = (name) => /拉面|面条|米线|面\b/.test(String(name || ''))
    const ingredientsToAdd = []
    if (result.items?.length > 0) {
      result.items.forEach((it, i) => {
        const g = Math.max(1, Number(it.grams) || 100)
        const name = String(it.name || '未知').slice(0, 30)
        const asRaw = storeAsRaw && isNoodle(name)
        const ratio = asRaw ? 0.4 : 1
        ingredientsToAdd.push({
          id: 'ai-' + ts + '-' + i,
          name,
          grams: g,
          proteinPer100: Math.round(((Number(it.protein) || 0) / g) * 1000) / 10,
          carbsPer100: Math.round(((Number(it.carbs) || 0) / g) * 1000) / 10,
          fatPer100: Math.round(((Number(it.fat) || 0) / g) * 1000) / 10,
          rawToCookedRatio: ratio,
          ...(asRaw ? { isStoredAsRaw: true } : {}),
        })
      })
    } else {
      const name = (sourceText && String(sourceText).trim().slice(0, 30)) || 'AI解析'
      const asRaw = storeAsRaw && isNoodle(name)
      const ratio = asRaw ? 0.4 : 1
      ingredientsToAdd.push({
        id: 'ai-' + ts,
        name,
        grams: 100,
        proteinPer100: result.protein ?? 0,
        carbsPer100: result.carbs ?? 0,
        fatPer100: result.fat ?? 0,
        rawToCookedRatio: ratio,
        ...(asRaw ? { isStoredAsRaw: true } : {}),
      })
    }
    setMeals((prev) => {
      const next = deepCloneMeals(prev)
      const meal = next[mealIndex]
      if (!meal) return prev
      if (replaceExisting) {
        meal.ingredients = ingredientsToAdd
      } else {
        if (!Array.isArray(meal.ingredients)) meal.ingredients = []
        ingredientsToAdd.forEach((ing) => meal.ingredients.push(ing))
      }
      if (trainingMode === TRAINING_MODES.MORNING && mealIndex === MORNING_POST_IMMEDIATE_INDEX) {
        syncMorningLunchRice(next, useCookedWeight)
      }
      return next
    })
  }, [trainingMode, useCookedWeight])

  const showMicroAdjust = useMemo(
    () => shouldSuggestMicroAdjust(consumed, targets),
    [consumed, targets]
  )

  const applyMicroAdjust = useCallback(() => {
    setMeals((prev) => {
      const plan = getReductionPlan(prev, targets, consumed, useCookedWeight)
      if (!plan) return prev
      return applyReductionToMeals(prev, plan, useCookedWeight) || prev
    })
  }, [targets, consumed, useCookedWeight])

  const wasOverThresholdRef = useRef(false)
  useEffect(() => {
    if (showMicroAdjust && !wasOverThresholdRef.current) {
      wasOverThresholdRef.current = true
      applyMicroAdjust()
    }
    if (!showMicroAdjust) wasOverThresholdRef.current = false
  }, [showMicroAdjust, applyMicroAdjust])

  /** 未超标时：最后一餐自动限制在当日目标 110% 以内（前三餐快满时，晚餐余量合理） */
  useEffect(() => {
    if (showMicroAdjust || !meals?.length) return
    setMeals((prev) => {
      const next = capLastMealToAllowance(prev, targets, useCookedWeight)
      return JSON.stringify(prev) === JSON.stringify(next) ? prev : next
    })
  }, [showMicroAdjust, meals, targets, useCookedWeight])

  return {
    trainingMode,
    setTrainingMode,
    meals,
    setMeals,
    useCookedWeight,
    setUseCookedWeight,
    weight,
    setWeight,
    targets,
    consumed,
    setMealIngredientGrams,
    addOrReplaceQuickIngredient,
    getMealMacros,
    setMealConfirmed,
    removeMealIngredient,
    applySuperBowl,
    replaceNanjuWithIngredient,
    parseFoodTextAndRecord,
    recordAiNutrientResult,
    showMicroAdjust,
    applyMicroAdjust,
    quickIngredients: FOOD_DATABASE,
    getRecommendedIdsForMeal,
    deletedIngredients,
    TRAINING_MODES,
  }
}
