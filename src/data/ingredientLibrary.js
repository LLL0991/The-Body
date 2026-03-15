/**
 * 食材库：熟重/可食部每 100g 的 P/C/F（用于灵活模式计算建议克数）
 */
export const INGREDIENT_LIBRARY = [
  { id: 'chicken', name: '鸡胸肉', protein: 31, carbs: 0, fat: 1.2 },
  { id: 'beef', name: '牛肉', protein: 26, carbs: 0, fat: 10 },
  { id: 'fish', name: '鱼肉', protein: 22, carbs: 0, fat: 3 },
  { id: 'shrimp', name: '虾仁', protein: 24, carbs: 0.2, fat: 0.3 },
  { id: 'egg', name: '鸡蛋', protein: 12.6, carbs: 0.7, fat: 9.5 },
  { id: 'rice', name: '米饭', protein: 2.6, carbs: 28, fat: 0.3 },
  { id: 'sweet_potato', name: '蒸红薯', protein: 1.6, carbs: 20, fat: 0.1 },
  { id: 'oats', name: '燕麦', protein: 16.9, carbs: 66, fat: 6.9 },
  { id: 'broccoli', name: '西兰花', protein: 2.8, carbs: 7, fat: 0.4 },
  { id: 'spinach', name: '菠菜', protein: 2.9, carbs: 3.6, fat: 0.4 },
  { id: 'banana', name: '香蕉', protein: 1.1, carbs: 23, fat: 0.3 },
  { id: 'olive_oil', name: '橄榄油', protein: 0, carbs: 0, fat: 100 },
]

/**
 * 根据该餐目标 P/C/F 与已选食材，计算建议熟重克数（优先满足 P、C）
 * 支持 1～2 种食材；2 种时用 P、C 列方程求解
 */
export function suggestAmounts(mealTarget, selectedIngredients) {
  if (!selectedIngredients?.length || !mealTarget) return []
  const { protein: tP, carbs: tC, fat: tF } = mealTarget
  const list = selectedIngredients.filter((ing) => ing != null)

  if (list.length === 1) {
    const ing = list[0]
    const p = ing.protein || 0
    const c = ing.carbs || 0
    const f = ing.fat || 0
    let g = 0
    if (p > 0 && tP > 0) g = Math.max(g, (tP / p) * 100)
    if (c > 0 && tC > 0) g = Math.max(g, (tC / c) * 100)
    if (f > 0 && tF > 0 && g === 0) g = (tF / f) * 100
    return [{ ...ing, suggestedGrams: Math.round(g) }]
  }

  if (list.length === 2) {
    const [a, b] = list
    const p1 = (a.protein || 0) / 100
    const c1 = (a.carbs || 0) / 100
    const p2 = (b.protein || 0) / 100
    const c2 = (b.carbs || 0) / 100
    const det = p1 * c2 - p2 * c1
    if (Math.abs(det) < 1e-6) {
      const g1 = p1 > 0 ? (tP / p1) : (tC / c1)
      return [
        { ...a, suggestedGrams: Math.round(g1) },
        { ...b, suggestedGrams: 0 },
      ]
    }
    const gA = (tP * c2 - tC * p2) / det
    const gB = (tC * p1 - tP * c1) / det
    return [
      { ...a, suggestedGrams: Math.round(Math.max(0, gA)) },
      { ...b, suggestedGrams: Math.round(Math.max(0, gB)) },
    ]
  }

  return list.map((ing) => ({ ...ing, suggestedGrams: 0 }))
}

/** 根据建议克数计算实际宏量（用于打卡） */
export function macrosFromAmounts(ingredientsWithGrams) {
  let protein = 0
  let carbs = 0
  let fat = 0
  for (const ing of ingredientsWithGrams) {
    const g = (ing.suggestedGrams || 0) / 100
    protein += (ing.protein || 0) * g
    carbs += (ing.carbs || 0) * g
    fat += (ing.fat || 0) * g
  }
  return {
    protein: Math.round(protein * 10) / 10,
    carbs: Math.round(carbs * 10) / 10,
    fat: Math.round(fat * 10) / 10,
  }
}
