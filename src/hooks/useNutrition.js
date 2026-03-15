import { useState, useMemo } from 'react'
import { getIngredientSets } from '../data/ingredients'

/** 蛋白 g/kg（取上限以达 129.6g @72kg） */
const PROTEIN_PER_KG = 1.8
/** 碳水 g/kg */
const CARBS_PER_KG = 1.5
/** 脂肪 g/kg */
const FAT_PER_KG = 0.7

/** Rest Day 碳水下调比例 */
const REST_DAY_CARBS_FACTOR = 0.8
/** Gym Day 练后一餐碳水占比 */
const POST_WORKOUT_CARBS_RATIO = 0.5

export const NUTRITION_MODES = {
  MORNING_GYM: 'Morning Gym',
  NOON_GYM: 'Noon Gym',
  EVENING_GYM: 'Evening Gym',
  REST_DAY: 'Rest Day',
}

const MODE_GYM_TIME = {
  [NUTRITION_MODES.MORNING_GYM]: '09:00',
  [NUTRITION_MODES.NOON_GYM]: '12:00',
  [NUTRITION_MODES.EVENING_GYM]: '17:00',
  [NUTRITION_MODES.REST_DAY]: null,
}

/** 晚练模式：练前加餐建议碳水 g */
const EVENING_PRE_WORKOUT_CARBS = 15
/** 早训：练后即刻（10:30 补剂）碳水 g */
const MORNING_POST_IMMEDIATE_CARBS = 15
/** 非练后正餐碳水设为最低（蛋白质+蔬菜填补） */
const MIN_MAIN_MEAL_CARBS = 0

/**
 * 按训练类型返回餐次配置与碳水分配
 * - 午训：早餐(11:00 固定配方练前供能) → 练后餐即午餐(14:30, 50%C≈54g) → 晚餐(低碳)。取消练前加餐。
 * - 早训：早餐 → 练后即刻(10:30 补剂 15g C) → 练后正餐(12:30 午餐 39g C) → 晚餐(低碳)。
 * - 晚练：早餐(低碳) → 午餐(低碳) → 练前加餐(15g) → 晚餐(50%C)。
 * - 休息日：三餐均分。
 */
function getMealConfig(mode, isGymDay) {
  if (!isGymDay) {
    return {
      names: ['早餐', '午餐', '晚餐'],
      proteinRatios: [0.3, 0.4, 0.3],
      fatRatios: [0.3, 0.4, 0.3],
      postWorkoutIndex: -1,
      preWorkoutIndex: -1,
      isEveningGym: false,
      carbsOverride: null,
    }
  }
  if (mode === NUTRITION_MODES.NOON_GYM) {
    return {
      names: ['早餐', '练后餐', '晚餐'],
      proteinRatios: [1 / 3, 1 / 3, 1 / 3],
      fatRatios: [1 / 3, 1 / 3, 1 / 3],
      postWorkoutIndex: 1,
      preWorkoutIndex: -1,
      isEveningGym: false,
      carbsOverride: null,
      carbsAllocation: 'noon',
    }
  }
  if (mode === NUTRITION_MODES.MORNING_GYM) {
    return {
      names: ['早餐', '练后即刻', '练后正餐', '晚餐'],
      proteinRatios: [0.25, 0.25, 0.25, 0.25],
      fatRatios: [0.25, 0.25, 0.25, 0.25],
      postWorkoutIndex: 1,
      postWorkoutIndex2: 2,
      preWorkoutIndex: -1,
      isEveningGym: false,
      carbsOverride: null,
      carbsAllocation: 'morning',
    }
  }
  if (mode === NUTRITION_MODES.EVENING_GYM) {
    return {
      names: ['早餐', '午餐', '练前加餐', '晚餐'],
      proteinRatios: [1 / 3, 1 / 3, 0, 1 / 3],
      fatRatios: [1 / 3, 1 / 3, 0, 1 / 3],
      postWorkoutIndex: 3,
      preWorkoutIndex: 2,
      isEveningGym: true,
      preWorkoutCarbs: EVENING_PRE_WORKOUT_CARBS,
      carbsOverride: null,
    }
  }
  return {
    names: ['早餐', '练前餐', '练后餐', '晚餐'],
    proteinRatios: [0.25, 0.25, 0.25, 0.25],
    fatRatios: [0.25, 0.25, 0.25, 0.25],
    postWorkoutIndex: 2,
    preWorkoutIndex: 1,
    isEveningGym: false,
    carbsOverride: null,
  }
}

function round1(v) {
  return Math.round((v ?? 0) * 10) / 10
}

/**
 * 营养目标与训练日逻辑
 * @param {Object} options
 * @param {number} [options.initialWeight=72] - 体重 kg
 * @param {number} [options.initialTargetBodyFat=10] - 目标体脂 %
 * @param {string} [options.initialMode] - 初始模式
 */
export function useNutrition(options = {}) {
  const {
    initialWeight = 72,
    initialTargetBodyFat = 10,
    initialMode = NUTRITION_MODES.MORNING_GYM,
  } = options

  const [weight, setWeight] = useState(initialWeight)
  const [targetBodyFat, setTargetBodyFat] = useState(initialTargetBodyFat)
  const [mode, setModeState] = useState(initialMode)
  const [mealLogs, setMealLogs] = useState([])
  const [mealOverrides, setMealOverridesState] = useState({})
  const setMode = (next) => {
    setModeState(next)
    setMealLogs([])
    setMealOverridesState({})
  }
  const setMealOverride = (mealIndex, patch) => {
    setMealOverridesState((prev) => {
      const next = { ...prev }
      const cur = next[mealIndex] ?? {}
      next[mealIndex] = { ...cur, ...patch }
      return next
    })
  }

  const isGymDay = mode !== NUTRITION_MODES.REST_DAY
  const gymTime = MODE_GYM_TIME[mode]

  const targets = useMemo(() => {
    const proteinTarget = weight * PROTEIN_PER_KG
    const carbsBase = weight * CARBS_PER_KG
    const carbsTarget = isGymDay ? carbsBase : carbsBase * REST_DAY_CARBS_FACTOR
    const fatTarget = weight * FAT_PER_KG

    const postWorkoutCarbs = isGymDay ? carbsTarget * POST_WORKOUT_CARBS_RATIO : 0
    const otherCarbs = carbsTarget - postWorkoutCarbs

    return {
      proteinTarget: round1(proteinTarget),
      carbsTarget: round1(carbsTarget),
      fatTarget: round1(fatTarget),
      postWorkoutCarbs: round1(postWorkoutCarbs),
      otherCarbs: round1(otherCarbs),
    }
  }, [weight, isGymDay])

  /** 餐单：按训练类型分配。非练后正餐碳水最低；练后/练前按比例分配。各餐加总等于每日目标。 */
  const mealPlan = useMemo(() => {
    const { proteinTarget, carbsTarget, fatTarget, postWorkoutCarbs, otherCarbs } = targets
    const config = getMealConfig(mode, isGymDay)
    const {
      names,
      proteinRatios,
      fatRatios,
      postWorkoutIndex,
      postWorkoutIndex2,
      preWorkoutIndex,
      isEveningGym,
      preWorkoutCarbs,
      carbsAllocation,
    } = config

    const getCarbsForMeal = (i) => {
      if (!isGymDay) return round1(carbsTarget / names.length)
      if (carbsAllocation === 'noon') {
        if (i === postWorkoutIndex) return postWorkoutCarbs
        if (i === names.length - 1) return MIN_MAIN_MEAL_CARBS
        return round1(otherCarbs)
      }
      if (carbsAllocation === 'morning') {
        if (i === postWorkoutIndex) return MORNING_POST_IMMEDIATE_CARBS
        if (i === postWorkoutIndex2) return round1(postWorkoutCarbs - MORNING_POST_IMMEDIATE_CARBS)
        if (i === names.length - 1) return MIN_MAIN_MEAL_CARBS
        return round1(otherCarbs)
      }
      if (isEveningGym && preWorkoutCarbs != null && i === preWorkoutIndex) return preWorkoutCarbs
      if (isEveningGym && preWorkoutCarbs != null) {
        if (i === postWorkoutIndex) return postWorkoutCarbs
        const lowCarbTotal = otherCarbs - preWorkoutCarbs
        const lowCarbMealCount = 2
        return round1(lowCarbTotal / lowCarbMealCount)
      }
      if (i === postWorkoutIndex) return postWorkoutCarbs
      const otherMealCount = names.length - 1
      return round1(otherCarbs / otherMealCount)
    }

    const meals = names.map((name, i) => {
      const p = round1(proteinTarget * proteinRatios[i])
      const f = round1(fatTarget * fatRatios[i])
      const c = getCarbsForMeal(i)
      const ingredientSets = getIngredientSets(p, c, f)
      return {
        name,
        protein: p,
        carbs: round1(c),
        fat: f,
        isPostWorkout: isGymDay && i === postWorkoutIndex,
        isPreWorkout: isGymDay && i === preWorkoutIndex,
        isRecoveryFocus: isEveningGym && i === postWorkoutIndex,
        ingredientSets,
      }
    })

    const last = meals.length - 1
    const sumP = meals.reduce((s, m) => s + m.protein, 0)
    const sumC = meals.reduce((s, m) => s + m.carbs, 0)
    const sumF = meals.reduce((s, m) => s + m.fat, 0)
    const pLast = Math.max(0, round1(meals[last].protein + (proteinTarget - sumP)))
    const cLast = Math.max(0, round1(meals[last].carbs + (carbsTarget - sumC)))
    const fLast = Math.max(0, round1(meals[last].fat + (fatTarget - sumF)))
    meals[last] = {
      ...meals[last],
      protein: pLast,
      carbs: cLast,
      fat: fLast,
    }
    meals[last].ingredientSets = getIngredientSets(meals[last].protein, meals[last].carbs, meals[last].fat)
    return meals
  }, [targets, isGymDay, mode])

  const constants = useMemo(
    () => ({
      proteinPerKg: { min: 1.5, max: 1.8, used: PROTEIN_PER_KG },
      carbsPerKg: CARBS_PER_KG,
      fatPerKg: FAT_PER_KG,
    }),
    []
  )

  const consumed = useMemo(() => {
    const out = { protein: 0, carbs: 0, fat: 0 }
    mealLogs.forEach((log) => {
      if (log) {
        out.protein += log.protein ?? 0
        out.carbs += log.carbs ?? 0
        out.fat += log.fat ?? 0
      }
    })
    return {
      protein: round1(out.protein),
      carbs: round1(out.carbs),
      fat: round1(out.fat),
    }
  }, [mealLogs])

  const logMeal = (mealIndex, macros) => {
    setMealLogs((prev) => {
      const next = [...prev]
      next[mealIndex] = {
        protein: macros.protein ?? 0,
        carbs: macros.carbs ?? 0,
        fat: macros.fat ?? 0,
      }
      return next
    })
  }

  const getMealLog = (mealIndex) => mealLogs[mealIndex] ?? null

  const getDisplayMeal = (mealIndex) => {
    const base = mealPlan[mealIndex]
    if (!base) return null
    const over = mealOverrides[mealIndex]
    if (!over) return base
    return {
      ...base,
      protein: over.protein ?? base.protein,
      carbs: over.carbs ?? base.carbs,
      fat: over.fat ?? base.fat,
    }
  }

  return {
    weight,
    setWeight,
    targetBodyFat,
    setTargetBodyFat,
    mode,
    setMode,
    isGymDay,
    gymTime,
    targets,
    mealPlan,
    consumed,
    mealLogs,
    logMeal,
    getMealLog,
    getDisplayMeal,
    setMealOverride,
    constants,
    NUTRITION_MODES,
  }
}
