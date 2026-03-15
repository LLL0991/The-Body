/**
 * 四种训练模式完整默认方案（按 72kg、不吃两包米粉 设定）。
 * 早训：练后即刻若加碳水（如饭团），App 自动扣除午餐米饭额度。
 */

const genId = () => Math.random().toString(36).slice(2, 10)

/** 午餐米饭额度池：练后即刻 + 午餐米饭共享（g 碳水），默认练后即刻 1.5g → 午餐 150g 米 */
export const LUNCH_RICE_CARB_POOL_G = 43.5

/** 熟米饭碳水 per100，用于 pool 换算 */
export const RICE_COOKED_CARBS_PER100 = 28

function normalizeIngredients(list) {
  return list.map((ing) => ({ ...ing, id: ing.id || genId() }))
}

// ─── 训练日早餐：固定配方（米粉 30g + 蛋白粉 25g + 羽衣甘蓝）────
export const DEFAULT_BREAKFAST_INGREDIENTS = [
  { id: 'nanju-rice-noodle', name: '南巨米粉', grams: 30, proteinPer100: 7, carbsPer100: 80, fatPer100: 0.5, rawToCookedRatio: 0.4 },
  { id: 'kangbite-protein', name: '康比特蛋白粉', grams: 25, proteinPer100: 80, carbsPer100: 5, fatPer100: 3, rawToCookedRatio: 1 },
  { id: 'kale-powder', name: '羽衣甘蓝粉', grams: 10, proteinPer100: 25, carbsPer100: 40, fatPer100: 2, rawToCookedRatio: 1 },
]

// ─── 休息日早餐：2 片全麦面包 + 2 个鸡蛋 + 豆浆 ───
const REST_BREAKFAST_INGREDIENTS = [
  { id: 'wholewheat-bread', name: '全麦面包', grams: 60, proteinPer100: 10, carbsPer100: 50, fatPer100: 2, rawToCookedRatio: 1 },
  { id: 'egg', name: '鸡蛋', grams: 100, proteinPer100: 12.5, carbsPer100: 1, fatPer100: 10, rawToCookedRatio: 1 },
  { id: 'soy-milk', name: '豆浆', grams: 250, proteinPer100: 3.5, carbsPer100: 1.5, fatPer100: 2, rawToCookedRatio: 1 },
]

// ─── 通用：150g 熟米饭 + 150g 瘦肉 + 蔬菜 ───
function mealRiceLeanVeg(riceG = 150, leanG = 150, vegG = 200) {
  return [
    { id: 'rice-cooked', name: '熟米饭', grams: riceG, proteinPer100: 2.6, carbsPer100: 28, fatPer100: 0.3, rawToCookedRatio: 0.4 },
    { id: 'chicken', name: '鸡胸肉', grams: leanG, proteinPer100: 31, carbsPer100: 0, fatPer100: 1.2, rawToCookedRatio: 0.7 },
    { id: 'veg', name: '蔬菜', grams: vegG, proteinPer100: 2, carbsPer100: 4, fatPer100: 0.2, rawToCookedRatio: 0.9 },
  ]
}

// ─── 晚餐型：红薯 + 瘦肉 + 绿叶菜 ───
function mealSweetPotatoLeanGreens(sweetPotatoG, leanG = 150) {
  return [
    { id: 'sweet-potato', name: '红薯', grams: sweetPotatoG, proteinPer100: 1.6, carbsPer100: 20, fatPer100: 0.1, rawToCookedRatio: 0.7 },
    { id: 'chicken', name: '鸡胸肉', grams: leanG, proteinPer100: 31, carbsPer100: 0, fatPer100: 1.2, rawToCookedRatio: 0.7 },
    { id: 'greens', name: '绿叶菜', grams: 200, proteinPer100: 2, carbsPer100: 3, fatPer100: 0.2, rawToCookedRatio: 0.95 },
  ]
}

// ─── 鱼/虾餐 ───
function mealRiceFish(riceG = 150, fishG = 200) {
  return [
    { id: 'rice-cooked', name: '熟米饭', grams: riceG, proteinPer100: 2.6, carbsPer100: 28, fatPer100: 0.3, rawToCookedRatio: 0.4 },
    { id: 'fish', name: '鱼/虾', grams: fishG, proteinPer100: 22, carbsPer100: 0, fatPer100: 3, rawToCookedRatio: 0.8 },
  ]
}

// ─── 仅蛋白粉（练后即刻 1 勺康比特）────
const POST_IMMEDIATE_PROTEIN_ONLY = [
  { id: 'protein-shake', name: '康比特蛋白粉', grams: 30, proteinPer100: 80, carbsPer100: 5, fatPer100: 3, rawToCookedRatio: 1 },
]

// ─── 1 根香蕉（练前）────
const BANANA_ONE = [
  { id: 'banana', name: '香蕉', grams: 100, proteinPer100: 1.1, carbsPer100: 23, fatPer100: 0.3, rawToCookedRatio: 1 },
]

/** 晚练练前：1 根香蕉约 20g C */
const BANANA_20G_C = [
  { id: 'banana-pw', name: '香蕉', grams: 87, proteinPer100: 1.1, carbsPer100: 23, fatPer100: 0.3, rawToCookedRatio: 1 },
]

// ─── 1. 早训 (Morning Gym) ───
/** 练后即刻默认碳水（仅蛋白粉≈1.5g），用于算午餐米饭初始额度 */
function morningPostImmediateCarbsG() {
  return (30 * 5) / 100
}

export const MORNING_DEFAULTS = [
  { name: '早餐', ingredients: normalizeIngredients([...DEFAULT_BREAKFAST_INGREDIENTS]) },
  { name: '练后即刻', ingredients: normalizeIngredients([...POST_IMMEDIATE_PROTEIN_ONLY]) },
  {
    name: '午餐',
    ingredients: normalizeIngredients(
      mealRiceLeanVeg(
        Math.max(0, Math.round(((LUNCH_RICE_CARB_POOL_G - morningPostImmediateCarbsG()) / RICE_COOKED_CARBS_PER100) * 100)),
        150,
        200
      )
    ),
  },
  { name: '晚餐', ingredients: normalizeIngredients(mealSweetPotatoLeanGreens(100, 150)) },
]

// ─── 2. 午训 (Noon Gym) ───
export const NOON_DEFAULTS = [
  { name: '早餐', ingredients: normalizeIngredients([...DEFAULT_BREAKFAST_INGREDIENTS]) },
  { name: '练前', ingredients: normalizeIngredients([...BANANA_ONE]) },
  { name: '练后午餐', ingredients: normalizeIngredients(mealRiceLeanVeg(150, 150, 150)) },
  { name: '晚餐', ingredients: normalizeIngredients(mealSweetPotatoLeanGreens(50, 150)) },
]

// ─── 3. 晚练 (Evening Gym) ───
export const EVENING_DEFAULTS = [
  { name: '早餐', ingredients: normalizeIngredients([...DEFAULT_BREAKFAST_INGREDIENTS]) },
  { name: '午餐', ingredients: normalizeIngredients(mealSweetPotatoLeanGreens(50, 150)) },
  { name: '练前', ingredients: normalizeIngredients([...BANANA_20G_C]) },
  { name: '练后晚餐', ingredients: normalizeIngredients(mealRiceFish(150, 200)) },
]

// ─── 4. 休息 (Rest Day) ───
export const REST_DEFAULTS = [
  { name: '早餐', ingredients: normalizeIngredients([...REST_BREAKFAST_INGREDIENTS]) },
  { name: '午餐', ingredients: normalizeIngredients(mealRiceLeanVeg(150, 150, 150)) },
  { name: '晚餐', ingredients: normalizeIngredients(mealRiceLeanVeg(150, 150, 150)) },
]
