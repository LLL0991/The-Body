// food-lookup.ts
// 食物查询层：本地库优先，查不到走 Open Food Facts API
// 当前：纯前端实现。后端上线后只需替换 searchRemoteAPI 函数即可，其余逻辑不变

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

  // 重要：使用 includes 时可能出现“鸡蛋饼包含鸡蛋”的前缀/包含冲突。
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

// ─── 远程 API 查询 ────────────────────────────────────────────
// 当前：Open Food Facts（免费，无需 key）
// 后端上线后：把这个函数换成调用你自己后端的 /api/food/search?q=xxx 即可
const searchRemoteAPI = async (query: string): Promise<FoodEntry | null> => {
  try {
    const res = await fetch(
      `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(
        query
      )}&json=true&page_size=1&fields=product_name,nutriments`
    )
    if (!res.ok) return null
    const data = await res.json().catch(() => ({}))
    const product = data?.products?.[0]
    if (!product) return null

    const n = product.nutriments || {}
    return {
      aliases: [product.product_name ?? query],
      defaultGrams: 100,
      unit: '份',
      protein: n['proteins_100g'] ?? 0,
      carbs: n['carbohydrates_100g'] ?? 0,
      fat: n['fat_100g'] ?? 0,
      isRawWeight: false,
      note: '来源：Open Food Facts，数据仅供参考',
    }
  } catch {
    // 网络失败静默处理，降级到模型自行估算
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

// ─── 后端迁移说明（给未来的自己）────────────────────────────────
/**
 * 后端上线后的迁移步骤：
 *
 * 1. 后端实现接口：GET /api/food/search?q=xxx
 *    返回格式与 FoodEntry 一致
 *
 * 2. 把 searchRemoteAPI 替换为：
 *    const res = await fetch(\`/api/food/search?q=\${encodeURIComponent(query)}\`)
 *    const data = await res.json()
 *    return data ?? null
 *
 * 3. 后端可以：
 *    - 聚合多个数据源（USDA + Open Food Facts + 自建中文库）
 *    - 缓存查询结果，避免重复请求
 *    - 人工审核和修正远程数据
 *    - 接入薄荷/Keep 等中文数据库
 *
 * 前端代码完全不需要改动。
 */

