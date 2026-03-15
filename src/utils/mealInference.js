/**
 * 从用户输入文本中识别时间/餐次关键词，推断应记录到哪一餐。
 * 用于首页文字/语音/识图后的「记录到哪一餐」的默认选择与确认。
 *
 * 关键词示例：今天中午、练完后、早上吃了、晚餐、午饭、练后即刻 等。
 */

/** 匹配顺序：更具体的在前（练后+晚/午 > 练后 > 练前 > 早/午/晚） */
const MEAL_PATTERNS = [
  { pattern: /练后.*[晚夜]|[晚夜].*练后|练后[晚饭]|练后晚餐/, nameContains: ['练后', '晚'] },
  { pattern: /练后.*[午]|[午].*练后|练后[午饭]|练后午餐/, nameContains: ['练后', '午'] },
  { pattern: /练后即刻|练后立刻|练完后?|训练后|撸铁后|练后(?!午|晚)/, nameContains: ['练后'] },
  { pattern: /练前/, nameContains: ['练前'] },
  { pattern: /早上|早晨|早餐|早饭|早上吃了|早晨吃了/, nameContains: ['早餐'] },
  { pattern: /中午|午餐|午饭|今天中午|中午吃了/, nameContains: ['午餐'] },
  { pattern: /晚上|晚餐|晚饭|晚上吃了|今晚/, nameContains: ['晚餐'] },
]

/**
 * 根据用户输入推断应记录到的餐次索引。
 * @param {string} text - 用户输入（如「今天中午吃了一碗拉面」「练完后吃了鸡胸」）
 * @param {Array<{ name: string }>} meals - 当前模式下的餐次列表
 * @returns {number | null} 推断的餐次索引，无法推断时返回 null
 */
export function inferMealIndexFromText(text, meals) {
  if (!text || typeof text !== 'string' || !Array.isArray(meals) || meals.length === 0) return null
  const t = text.trim()
  if (!t) return null

  for (const { pattern, nameContains } of MEAL_PATTERNS) {
    if (!pattern.test(t)) continue
    const idx = meals.findIndex((m) => {
      const name = (m?.name || '').trim()
      return nameContains.every((part) => name.includes(part))
    })
    if (idx !== -1) return idx
  }
  return null
}
