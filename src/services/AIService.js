/**
 * AIService：自然语言解析、动态修正建议、智能模式对齐。
 * 供 mealStore / useMealStore 及 UI 调用。
 */

import { FOOD_DATABASE } from '../data/foodDatabase'
import { TRAINING_MODES, macrosFromIngredients } from '../data/mealStore'

/** 数量词 → 倍数（一块=1份默认克数，两块=2倍） */
const QUANTITY_MAP = [
  { pattern: /([一二两两三三四四五五六七八九十\d]+)\s*块/g, unit: 'piece' },
  { pattern: /([一二两两三三四四五五六七八九十\d]+)\s*份/g, unit: 'portion' },
  { pattern: /([一二两两三三四四五五六七八九十\d]+)\s*个/g, unit: 'piece' },
  { pattern: /([一二两两三三四四五五六七八九十\d]+)\s*碗/g, unit: 'bowl' },
]
const NUM_MAP = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 }

function parseQuantity(str) {
  if (typeof str === 'number' && !Number.isNaN(str)) return Math.max(1, Math.round(str))
  const s = String(str).trim()
  const num = parseInt(s, 10)
  if (!Number.isNaN(num)) return Math.max(1, num)
  return NUM_MAP[s] ?? 1
}

/**
 * 从整句里提取数量（如「两块」→ 2）
 */
function extractQuantity(text) {
  for (const { pattern, unit } of QUANTITY_MAP) {
    const m = text.match(pattern)
    if (m) return parseQuantity(m[1])
  }
  return 1
}

/**
 * 文本解析：自然语言匹配 foodDatabase 并返回匹配项 + 建议克数。
 * 如「我吃了两块全家鸡胸」→ { food: 全家鸡胸肉, grams: 200 }
 * 支持：完整名、名前缀、或名称任意子串（如「鸡胸」匹配「全家鸡胸肉」）
 */
export function parseFoodText(text, foodDatabase = FOOD_DATABASE) {
  const t = String(text).replace(/\s/g, '')
  const qty = extractQuantity(text)
  let best = null
  let bestScore = 0
  for (const food of foodDatabase) {
    const name = food.name.replace(/\s/g, '')
    let score = 0
    if (t.includes(name)) {
      score = name.length
    } else {
      for (let len = name.length; len >= 2; len--) {
        const prefix = name.slice(0, len)
        if (t.includes(prefix)) {
          score = len
          break
        }
      }
      if (score === 0) {
        for (let start = 0; start < name.length - 1; start++) {
          for (let len = name.length - start; len >= 2; len--) {
            const sub = name.slice(start, start + len)
            if (t.includes(sub) && sub.length > score) score = sub.length
          }
        }
      }
    }
    if (score > bestScore) {
      bestScore = score
      best = food
    }
  }
  if (!best) return null
  const grams = Math.round((best.grams || 100) * qty)
  return { food: { ...best }, grams }
}

const THRESHOLD_FACTOR = 1.1

/**
 * 任一宏量（碳水/蛋白质/脂肪）超过目标 10% 时，需要微调
 */
export function shouldSuggestMicroAdjust(consumed, targets) {
  if (!consumed || !targets) return false
  const { carbsTarget, proteinTarget, fatTarget } = targets
  if (carbsTarget != null && consumed.carbs >= carbsTarget * THRESHOLD_FACTOR) return true
  if (proteinTarget != null && consumed.protein >= proteinTarget * THRESHOLD_FACTOR) return true
  if (fatTarget != null && consumed.fat >= fatTarget * THRESHOLD_FACTOR) return true
  return false
}

/**
 * 减量方案：在未打卡餐次中按比例减少碳水、蛋白质、脂肪的溢出部分
 */
export function getReductionPlan(meals, targets, consumed, useCookedWeight = true) {
  if (!meals?.length || !targets || !consumed) return null
  const unconfirmed = meals.map((m, i) => ({ mealIndex: i, meal: m })).filter((x) => !x.meal.confirmed)
  if (unconfirmed.length === 0) return null
  const n = unconfirmed.length
  const overflowCarbs = Math.max(0, consumed.carbs - (targets.carbsTarget ?? 0))
  const overflowProtein = Math.max(0, consumed.protein - (targets.proteinTarget ?? 0))
  const overflowFat = Math.max(0, consumed.fat - (targets.fatTarget ?? 0))
  if (overflowCarbs <= 0 && overflowProtein <= 0 && overflowFat <= 0) return null
  return {
    reduceCarbsPerMeal: overflowCarbs / n,
    reduceProteinPerMeal: overflowProtein / n,
    reduceFatPerMeal: overflowFat / n,
    unconfirmedMealIndices: unconfirmed.map((x) => x.mealIndex),
  }
}

/** 碳水主项：米饭、红薯等 */
const CARBS_INGREDIENT_IDS = ['rice-cooked', 'sweet-potato', 'convenience-riceball', 'laoxiangji-rice', 'rice-150']
/** 蛋白质主项：鸡胸、牛肉、鱼虾等 */
const PROTEIN_INGREDIENT_IDS = ['chicken', 'chicken-cooked', 'family-mart-chicken', 'beef-cooked', 'shrimp-cooked', 'fish', 'nanju-rice-noodle', 'super-bowl', 'chaomo-kitchen']

/**
 * 应用减量方案：对未打卡餐次中的碳水/蛋白质/脂肪主项按比例减克数
 */
export function applyReductionToMeals(meals, plan, useCookedWeight) {
  if (!plan || !plan.unconfirmedMealIndices?.length) return meals
  const { reduceCarbsPerMeal, reduceProteinPerMeal, reduceFatPerMeal, unconfirmedMealIndices } = plan
  const next = JSON.parse(JSON.stringify(meals))
  unconfirmedMealIndices.forEach((mealIndex) => {
    const meal = next[mealIndex]
    if (!meal?.ingredients) return
    if (reduceCarbsPerMeal > 0) {
      const carbsIng = meal.ingredients.find((i) => CARBS_INGREDIENT_IDS.includes(i.id) || (i.carbsPer100 != null && i.carbsPer100 > 10))
      if (carbsIng) {
        const carbsPer100 = carbsIng.carbsPer100 ?? 0
        if (carbsPer100 > 0) {
          const gramsToReduce = Math.min(carbsIng.grams || 0, Math.round((reduceCarbsPerMeal / carbsPer100) * 100))
          carbsIng.grams = Math.max(0, (carbsIng.grams || 0) - gramsToReduce)
        }
      }
    }
    if (reduceProteinPerMeal > 0) {
      const proteinIng = meal.ingredients.find((i) => PROTEIN_INGREDIENT_IDS.includes(i.id) || (i.proteinPer100 != null && i.proteinPer100 > 15))
      if (proteinIng) {
        const proteinPer100 = proteinIng.proteinPer100 ?? 0
        if (proteinPer100 > 0) {
          const gramsToReduce = Math.min(proteinIng.grams || 0, Math.round((reduceProteinPerMeal / proteinPer100) * 100))
          proteinIng.grams = Math.max(0, (proteinIng.grams || 0) - gramsToReduce)
        }
      }
    }
    if (reduceFatPerMeal > 0) {
      const fatIng = meal.ingredients.find((i) => i.fatPer100 != null && i.fatPer100 > 5)
      if (fatIng) {
        const fatPer100 = fatIng.fatPer100 ?? 0
        if (fatPer100 > 0) {
          const gramsToReduce = Math.min(fatIng.grams || 0, Math.round((reduceFatPerMeal / fatPer100) * 100))
          fatIng.grams = Math.max(0, (fatIng.grams || 0) - gramsToReduce)
        }
      }
    }
  })
  return next
}

/**
 * 未超标时：根据「除最后一餐外」的已摄入量，将最后一餐的碳水/蛋白质/脂肪限制在当日目标 110% 以内的合理区间。
 * 例：前三餐蛋白质 123g/130g，晚餐余量仅 7g → 晚餐蛋白质食材减少到「允许达到当天 110%」即 130*1.1-123=20g 以内。
 */
export function capLastMealToAllowance(meals, targets, useCookedWeight = true) {
  if (!meals?.length || !targets) return meals
  const lastIndex = meals.length - 1
  let consumedOthers = { protein: 0, carbs: 0, fat: 0 }
  for (let i = 0; i < lastIndex; i++) {
    const mac = macrosFromIngredients(meals[i].ingredients || [], useCookedWeight)
    consumedOthers.protein += mac.protein
    consumedOthers.carbs += mac.carbs
    consumedOthers.fat += mac.fat
  }
  const allowanceCarbs = Math.max(0, (targets.carbsTarget ?? 0) * THRESHOLD_FACTOR - consumedOthers.carbs)
  const allowanceProtein = Math.max(0, (targets.proteinTarget ?? 0) * THRESHOLD_FACTOR - consumedOthers.protein)
  const allowanceFat = Math.max(0, (targets.fatTarget ?? 0) * THRESHOLD_FACTOR - consumedOthers.fat)
  const next = JSON.parse(JSON.stringify(meals))
  const last = next[lastIndex]
  if (!last?.ingredients?.length) return next

  function capMealMacro(meal, macroKey, maxAmount) {
    const per100Key = macroKey === 'carbs' ? 'carbsPer100' : macroKey === 'protein' ? 'proteinPer100' : 'fatPer100'
    let current = macrosFromIngredients(meal.ingredients, useCookedWeight)[macroKey]
    while (current > maxAmount) {
      const excess = current - maxAmount
      const candidates = meal.ingredients.filter((i) => (i[per100Key] ?? 0) > 0 && (i.grams ?? 0) > 0)
      if (!candidates.length) break
      const main = candidates.reduce((a, b) => ((a[per100Key] ?? 0) >= (b[per100Key] ?? 0) ? a : b))
      const per100 = main[per100Key] ?? 0
      if (per100 <= 0) break
      const gramsToReduce = Math.min(main.grams ?? 0, Math.max(1, Math.round((excess / per100) * 100)))
      main.grams = Math.max(0, (main.grams ?? 0) - gramsToReduce)
      current = macrosFromIngredients(meal.ingredients, useCookedWeight)[macroKey]
    }
  }

  capMealMacro(last, 'carbs', allowanceCarbs)
  capMealMacro(last, 'protein', allowanceProtein)
  capMealMacro(last, 'fat', allowanceFat)
  return next
}

/**
 * 智能对齐：11:00 左右打卡早餐且当前为休息日时，建议切换为午训
 */
export function shouldSwitchToNoonMode(currentMode, checkInTime = new Date()) {
  if (currentMode !== TRAINING_MODES.REST) return false
  const hour = checkInTime.getHours()
  const min = checkInTime.getMinutes()
  const totalMin = hour * 60 + min
  const breakfastNoonStart = 10 * 60 + 0
  const breakfastNoonEnd = 12 * 60 + 0
  return totalMin >= breakfastNoonStart && totalMin <= breakfastNoonEnd
}
