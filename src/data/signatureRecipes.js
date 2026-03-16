/**
 * 招牌模式固定配方：每份宏量（打卡时扣除）
 */
export const SIGNATURE_RECIPES = {
  早餐: {
    name: '固定早餐',
    items: [
      { name: '米粉', amount: 30, unit: 'g' },
      { name: '蛋白粉', amount: 25, unit: 'g' },
      { name: '羽衣甘蓝粉', amount: 10, unit: 'g' },
    ],
    macros: { protein: 28, carbs: 22, fat: 1 },
  },
  练前餐: {
    name: '练前小餐',
    items: [
      { name: '香蕉', amount: 1, unit: '根' },
      { name: '燕麦', amount: 30, unit: 'g' },
    ],
    macros: { protein: 4, carbs: 32, fat: 2 },
  },
  练前加餐: {
    name: '练前快碳（17:00 建议）',
    items: [
      { name: '香蕉', amount: 1, unit: '根' },
      { name: '或白吐司', amount: 1, unit: '片' },
    ],
    macros: { protein: 0, carbs: 15, fat: 0 },
  },
  练后餐: {
    name: '练后餐（约 190g 熟米饭）',
    items: [
      { name: '熟米饭', amount: 190, unit: 'g' },
      { name: '鸡胸肉', amount: 150, unit: 'g 熟重' },
      { name: '蔬菜', amount: 1, unit: '份' },
    ],
    macros: { protein: 46, carbs: 54, fat: 3 },
  },
  练后即刻: {
    name: '练后即刻（10:30 补剂）',
    items: [
      { name: '香蕉', amount: 1, unit: '根' },
      { name: '蛋白粉', amount: 1, unit: '份' },
    ],
    macros: { protein: 15, carbs: 15, fat: 0 },
  },
  练后正餐: {
    name: '练后正餐（12:30 午餐）',
    items: [
      { name: '熟米饭', amount: 140, unit: 'g' },
      { name: '鸡胸肉', amount: 150, unit: 'g 熟重' },
      { name: '蔬菜', amount: 1, unit: '份' },
    ],
    macros: { protein: 46, carbs: 39, fat: 3 },
  },
  午餐: {
    name: '健身餐方案 A',
    items: [
      { name: '鸡胸肉', amount: 150, unit: 'g 熟重' },
      { name: '蒸红薯', amount: 100, unit: 'g' },
      { name: '西兰花', amount: 1, unit: '大份' },
    ],
    macros: { protein: 46, carbs: 26, fat: 3 },
  },
  晚餐: {
    name: '轻盈方案',
    items: [
      { name: '鱼肉/虾仁', amount: 150, unit: 'g' },
      { name: '巨量绿叶菜', amount: 1, unit: '份' },
    ],
    macros: { protein: 32, carbs: 0, fat: 5 },
  },
}

export function getSignatureRecipe(mealName) {
  if (SIGNATURE_RECIPES[mealName]) return SIGNATURE_RECIPES[mealName]
  if (mealName === '练前补充') return SIGNATURE_RECIPES['练前加餐']
  if (mealName === '练后摄入') return SIGNATURE_RECIPES['练后餐']
  return null
}
