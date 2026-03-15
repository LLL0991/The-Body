/**
 * 食材数据库：快捷食材库数据源，所有克数均为熟重。
 * 用于智能推荐与一键填充，熟重开关默认开启时直接使用 grams 与 per100 计算 P/C/F。
 */

/** 所有可选的快捷食材（含原有 + 新增高频） */
export const FOOD_DATABASE = [
  { id: 'laoxiangji-rice', name: '老乡鸡米饭', grams: 200, proteinPer100: 2.6, carbsPer100: 28, fatPer100: 0.3, rawToCookedRatio: 1 },
  { id: 'convenience-riceball', name: '便利店饭团', grams: 120, proteinPer100: 4, carbsPer100: 35, fatPer100: 2, rawToCookedRatio: 1 },
  { id: 'family-mart-chicken', name: '全家鸡胸肉', grams: 100, proteinPer100: 31, carbsPer100: 0, fatPer100: 1.2, rawToCookedRatio: 1 },
  { id: 'super-bowl', name: '超级碗', grams: 150, proteinPer100: 31, carbsPer100: 28, fatPer100: 1.2, rawToCookedRatio: 1 },
  { id: 'rice-150', name: '150g 米饭', grams: 150, proteinPer100: 2.6, carbsPer100: 28, fatPer100: 0.3, rawToCookedRatio: 1 },
  { id: 'avocado-sauce', name: '饿梨酱', grams: 30, proteinPer100: 1, carbsPer100: 6, fatPer100: 15, rawToCookedRatio: 1 },
  { id: 'chaomo-kitchen', name: '超模厨房', grams: 200, proteinPer100: 15, carbsPer100: 20, fatPer100: 5, rawToCookedRatio: 1 },
  { id: 'chicken-cooked', name: '熟鸡胸肉', grams: 100, proteinPer100: 31, carbsPer100: 0, fatPer100: 1.2, rawToCookedRatio: 1 },
  { id: 'beef-cooked', name: '熟牛肉', grams: 100, proteinPer100: 26, carbsPer100: 0, fatPer100: 10, rawToCookedRatio: 1 },
  { id: 'shrimp-cooked', name: '熟虾仁', grams: 100, proteinPer100: 24, carbsPer100: 0, fatPer100: 0.5, rawToCookedRatio: 1 },
  { id: 'sweet-potato', name: '红薯', grams: 100, proteinPer100: 1.6, carbsPer100: 20, fatPer100: 0.1, rawToCookedRatio: 1 },
]

/** 练后餐优先展示的食材 id（超级碗、150g 米饭） */
const POST_WORKOUT_IDS = ['super-bowl', 'rice-150']
/** 晚餐优先展示的食材 id（红薯、虾仁） */
const DINNER_IDS = ['sweet-potato', 'shrimp-cooked']

/** 仅这些「主食/碳水」类快捷食材会询问是否替换南巨米粉；蛋白质等只做添加 */
export const QUICK_IDS_REPLACE_NANJU = ['super-bowl', 'rice-150', 'laoxiangji-rice', 'convenience-riceball']

/**
 * 根据餐次名称返回本餐推荐的食材（优先显示在快捷食材库前面）
 */
export function getRecommendedIdsForMeal(mealName) {
  if (!mealName) return []
  if (mealName.includes('练后')) return POST_WORKOUT_IDS
  if (mealName === '晚餐') return DINNER_IDS
  return []
}
