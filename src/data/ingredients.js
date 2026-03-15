/**
 * 营养素 → 食材生重建议（每 100g 可食部约含克数）
 * 用于计算：目标克数 → 食材生重(g)
 */
const PROTEIN_SOURCES = [
  { name: '鸡胸肉', proteinPer100: 31 },
  { name: '鸡蛋', proteinPer100: 12.6 }, // 每 100g 鸡蛋
]
const CARB_SOURCES = [
  { name: '米饭', carbsPer100: 28 },   // 熟重
  { name: '燕麦', carbsPer100: 66 },  // 干燕麦
]
const FAT_SOURCES = [
  { name: '橄榄油', fatPer100: 100 },
  { name: '牛油果', fatPer100: 15 },
]

/** 方案 A：鸡胸+米饭+橄榄油 */
function weightA(protein, carbs, fat) {
  const p = protein && protein > 0 ? Math.round((protein / PROTEIN_SOURCES[0].proteinPer100) * 100) : 0
  const c = carbs && carbs > 0 ? Math.round((carbs / CARB_SOURCES[0].carbsPer100) * 100) : 0
  const f = fat && fat > 0 ? Math.round((fat / FAT_SOURCES[0].fatPer100) * 100) : 0
  return [
    p ? { name: PROTEIN_SOURCES[0].name, weight: p } : null,
    c ? { name: CARB_SOURCES[0].name, weight: c } : null,
    f ? { name: FAT_SOURCES[0].name, weight: f } : null,
  ].filter(Boolean)
}

/** 方案 B：鸡蛋+燕麦+牛油果 */
function weightB(protein, carbs, fat) {
  const p = protein && protein > 0 ? Math.round((protein / PROTEIN_SOURCES[1].proteinPer100) * 100) : 0
  const c = carbs && carbs > 0 ? Math.round((carbs / CARB_SOURCES[1].carbsPer100) * 100) : 0
  const f = fat && fat > 0 ? Math.round((fat / FAT_SOURCES[1].fatPer100) * 100) : 0
  return [
    p ? { name: PROTEIN_SOURCES[1].name, weight: p } : null,
    c ? { name: CARB_SOURCES[1].name, weight: c } : null,
    f ? { name: FAT_SOURCES[1].name, weight: f } : null,
  ].filter(Boolean)
}

export function getIngredientSets(protein, carbs, fat) {
  return {
    primary: weightA(protein, carbs, fat),
    alternative: weightB(protein, carbs, fat),
  }
}
