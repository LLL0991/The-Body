/**
 * 餐次数据与宏量计算。
 * 默认餐次来自 mealDefaults；快捷食材来自 foodDatabase。
 */

import {
  MORNING_DEFAULTS,
  NOON_DEFAULTS,
  EVENING_DEFAULTS,
  REST_DEFAULTS,
  LUNCH_RICE_CARB_POOL_G,
  RICE_COOKED_CARBS_PER100,
} from './mealDefaults'

import { FOOD_DATABASE, getRecommendedIdsForMeal } from './foodDatabase'

export { LUNCH_RICE_CARB_POOL_G, RICE_COOKED_CARBS_PER100 } from './mealDefaults'
export { FOOD_DATABASE, getRecommendedIdsForMeal } from './foodDatabase'

export const TRAINING_MODES = {
  MORNING: 'morning',
  NOON: 'noon',
  EVENING: 'evening',
  REST: 'rest',
}

export const DEFAULT_MEALS_BY_MODE = {
  [TRAINING_MODES.MORNING]: JSON.parse(JSON.stringify(MORNING_DEFAULTS)),
  [TRAINING_MODES.NOON]: JSON.parse(JSON.stringify(NOON_DEFAULTS)),
  [TRAINING_MODES.EVENING]: JSON.parse(JSON.stringify(EVENING_DEFAULTS)),
  [TRAINING_MODES.REST]: JSON.parse(JSON.stringify(REST_DEFAULTS)),
}

/** @deprecated 使用 FOOD_DATABASE，保留兼容 */
export const QUICK_INGREDIENTS = FOOD_DATABASE.slice(0, 3)

const DEFAULT_RAW_TO_COOKED = 1

/**
 * 当前展示/计算用的克数（考虑「按生重存」与 熟重/生重 开关）
 * - 若按生重存且当前是熟重：显示/计算为 克数/ratio（熟重）
 * - 若按生重存且当前是生重：显示/计算为 克数（生重）
 * - 若按熟重存：与原来一致
 */
export function getDisplayGrams(ing, useCookedWeight = true) {
  if (!ing) return 0
  const grams = ing.grams ?? 0
  const ratio = ing.rawToCookedRatio ?? DEFAULT_RAW_TO_COOKED
  if (ing.isStoredAsRaw) {
    return useCookedWeight ? grams / ratio : grams
  }
  return useCookedWeight ? grams : grams * ratio
}

/**
 * 把用户在当前模式下的「显示克数」转回存储值
 */
export function displayToStoredGrams(ing, displayGrams, useCookedWeight = true) {
  if (!ing) return displayGrams
  const ratio = ing.rawToCookedRatio ?? DEFAULT_RAW_TO_COOKED
  if (ing.isStoredAsRaw) {
    return useCookedWeight ? displayGrams * ratio : displayGrams
  }
  return useCookedWeight ? displayGrams : displayGrams / ratio
}

/** 从食材列表计算 P/C/F（熟重/生重由 useCookedWeight 控制；支持 isStoredAsRaw） */
export function macrosFromIngredients(ingredients, useCookedWeight = true) {
  let p = 0, c = 0, f = 0
  for (const ing of ingredients) {
    const effectiveGrams = getDisplayGrams(ing, useCookedWeight)
    const ratio = ing.rawToCookedRatio ?? DEFAULT_RAW_TO_COOKED
    let perP = ing.proteinPer100 ?? 0
    let perC = ing.carbsPer100 ?? 0
    let perF = ing.fatPer100 ?? 0
    if (ing.isStoredAsRaw && useCookedWeight) {
      perP *= ratio
      perC *= ratio
      perF *= ratio
    }
    const factor = effectiveGrams / 100
    p += perP * factor
    c += perC * factor
    f += perF * factor
  }
  return {
    protein: Math.round(p * 10) / 10,
    carbs: Math.round(c * 10) / 10,
    fat: Math.round(f * 10) / 10,
  }
}
