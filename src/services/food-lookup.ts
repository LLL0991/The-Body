// food-lookup.ts
// 食物查询层：本地库优先，查不到走 FatSecret API（后端代理）

import { FOOD_DATABASE, type FoodEntry, buildDatabaseSummary } from './food-database'

// ─── 类型 ────────────────────────────────────────────────────
export interface FoodLookupResult {
  entry: FoodEntry | null
  source: 'local' | 'remote' | 'not_found'
  matchedAlias?: string
}

// ─── 主查询入口 ───────────────────────────────────────────────
export const lookupFood = async (query: string): Promise<FoodLookupResult> => {
  // 1. 本地库优先
  const localResult = searchLocalDatabase(query)
  if (localResult) return { ...localResult, source: 'local' }

  // 2. 远程 API 补充
  const remoteResult = await searchRemoteAPI(query)
  if (remoteResult) return { entry: remoteResult, source: 'remote' }

  // 3. 都没有，返回 not_found，让模型自行估算
  return { entry: null, source: 'not_found' }
}

// ─── 本地库查询 ───────────────────────────────────────────────
const searchLocalDatabase = (query: string): { entry: FoodEntry; matchedAlias: string } | null => {
  const text = (query || '').trim()
  if (!text) return null

  // 重要：使用 includes 时可能出现"鸡蛋饼包含鸡蛋"的前缀/包含冲突。
  // 这里选择「别名长度最长」的命中，降低误匹配概率。
  let best: { entry: FoodEntry; matchedAlias: string } | null = null
  let bestLen = -1

  for (const entry of Object.values(FOOD_DATABASE)) {
    for (const alias of entry.aliases) {
      if (!alias) continue
      if (!text.includes(alias)) continue
      if (alias.length > bestLen) {
        bestLen = alias.length
        best = { entry, matchedAlias: alias }
      }
    }
  }

  return best
}

// ─── 远程 API 查询（FatSecret，后端代理）────────────────────────
const searchRemoteAPI = async (query: string): Promise<FoodEntry | null> => {
  try {
    const res = await fetch(`/api/food/search?q=${encodeURIComponent(query)}`)
    if (!res.ok) return null
    const data = await res.json().catch(() => null)
    if (!data?.name) return null
    return {
      aliases: [data.name, query],
      defaultGrams: 100,
      unit: '份',
      protein: Number(data.protein) || 0,
      carbs: Number(data.carbs) || 0,
      fat: Number(data.fat) || 0,
      isRawWeight: false,
      note: `来源：FatSecret（${data.name}，每100g）`,
    }
  } catch {
    return null
  }
}

// ─── 给 parse-food-prompt 用的数据库摘要（含查询结果注入）────────
// 如果本次解析前已经查到了某个食物，可以把结果注入到 prompt 里提高准确性
export const buildEnrichedDatabaseSummary = (extraEntries: FoodEntry[] = []): string => {
  const base = buildDatabaseSummary()
  if (!extraEntries.length) return base

  const extra = extraEntries
    .map(
      (e) =>
        `- [${e.aliases[0]}]：100g 含 P${e.protein}/C${e.carbs}/F${e.fat}（${
          e.note ?? '远程查询'
        }）`
    )
    .join('\n')

  return `${base}\n\n## 本次额外查询到的食物\n${extra}`
}
