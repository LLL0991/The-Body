/**
 * AI 营养解析：将用户口语输入（如「我吃了一碗云阿蛮米线」）转化为 P/C/F 数值。
 * 依赖 LLM 接口，需配置 API Key（如 VITE_OPENAI_API_KEY 或传入 options.apiKey）。
 */

import { SUPER_BOWL_DB } from '../data/superBowlDatabase'

/** 练后大餐碳水锚点：150g 熟米饭 ≈ 42g 碳水 */
export const CARBS_ANCHOR_G = 42

/** 用户基准（教练建议：1.5g/kg 碳水、1.5g/kg 蛋白质、0.6g/kg 脂肪，按 73kg 计算） */
export const USER_BASELINE = {
  weightKg: 73,
  proteinTargetG: 110,  // 1.5 × 73
  carbsTargetG: 110,    // 1.5 × 73
  fatTargetG: 44,       // 0.6 × 73
  /** 训练日练后大餐碳水锚点 */
  postMealCarbsAnchorG: CARBS_ANCHOR_G,
  /** 主要餐饮场景，用于估算「一份」的参考 */
  eatingContext: '上海职场外卖/商场堂食',
}

/** 用户画像摘要（供 prompt 使用，便于模型理解用户目标与约束） */
export const USER_PERSONA_SUMMARY = `用户为 1994 年生男性，身高 175cm，体重 73kg，BMI 23.8；体脂率 20.5%，骨骼肌 32.3kg，腰臀比 0.87，内脏脂肪等级 6，躯干脂肪偏多。目标：6 月前将体脂率降至 12%，同时尽量保持肌肉不流失。训练：一周 4～5 次无氧撸铁，4 分化（胸/腿/背/肩），有时加练手臂与肩。饮食：需通过记录每日摄入控制热量，避免无意识多食；教练建议每日摄入 1.5 倍体重(g) 碳水、1.5 倍体重(g) 蛋白质、0.6 倍体重(g) 脂肪。酒精：用户有饮酒习惯，减脂期执行严格控酒（每月最多 2 次或戒断直至达成目标），若用户记录酒类摄入需如实解析并计入。`

export const SYSTEM_PROMPT = `## 用户画像（请基于以下信息理解用户并做营养估算）
${USER_PERSONA_SUMMARY}

## 每日摄入目标（教练建议，用于参考与 adjustment 提示）
- 体重：${USER_BASELINE.weightKg}kg
- 蛋白质：${USER_BASELINE.proteinTargetG}g/日（1.5g/kg）
- 碳水：${USER_BASELINE.carbsTargetG}g/日（1.5g/kg）
- 脂肪：${USER_BASELINE.fatTargetG}g/日（0.6g/kg）
- 练后大餐碳水锚点：150g 熟米饭 ≈ ${USER_BASELINE.postMealCarbsAnchorG}g 碳水
- 主要餐饮场景：${USER_BASELINE.eatingContext}（「一份」按该场景常见分量估算）

## 解析逻辑（估算原则）
将用户的口语输入转化为蛋白质(P)、碳水(C)、脂肪(F) 的克数，遵循：
- 整体估算偏保守：宁可略少算一些摄入，而不是明显高估；
- 优先参考「上海主流外卖/商场堂食」的一份标准分量，除非用户明确说了克数或数量；
- 当识别到具体品牌/店名时（如 云阿蛮米线、超级碗、全家饭团、老乡鸡葱油鸡 等），优先假定为一份标准量，并在 adjustment 中说明这基于「上海商场/外卖标准份量」的估算；
- 例如：默认上海商场云阿蛮一碗米线约 300g（后续若提供更精确的分量数据库时，你应优先使用该数据库中的具体克重，再结合实际描述微调）。

## 一致性（重要：同一表述每次解析结果应稳定）
- 同一或等价表述多次解析时，食物种类、份量(g)与 P/C/F 必须一致，不要前后矛盾。例如「一碗兰州拉面」始终按「拉面（面条）」解析，不得有时输出为米线、有时为面条。
- 标准份量约定（一碗 = 一份；**输出 grams 均为熟重**，除非用户明确说生重/干面）：
  - 兰州拉面 / 拉面 / 牛肉面：一碗煮熟后面条约 250～300g（即 2～3 两生面煮好后的熟重），约 70g 碳水、20g 蛋白质。items 里拉面填 300g 表示 300g 熟面。若用户说「加白切肉」等，单独列一项白切肉（如 80g，对应 P/F）。
  - 云阿蛮米线 / 米线：米线约 300g（熟），按米线品类估算 P/C/F。
  - 米饭（一碗）：熟米饭约 150～200g。
- 请举一反三处理「超级碗」「全家饭团」「老乡鸡葱油鸡」等，同类食物采用同一套份量与营养素估算。
- **超级碗**：若用户说「半份谷物饭」「半份沙拉」等，请在 items 中仍输出「谷物饭/混合谷物饭」「沙拉/混合沙拉叶」等具体名称；系统会按「半份」自动将克数换算为 100g（谷物饭一份 200g、沙拉一份按 200g 计半份 100g）。你只需正确拆出底料、蛋白、配菜名称即可。

## 输出要求
你必须返回且仅返回一个 JSON 对象，不要包含 markdown 代码块或其它前后文字。结构如下：
{
  "protein": number,
  "carbs": number,
  "fat": number,
  "deltaCarbs": number,
  "adjustment": "string | null",
  "items": [{"name": "string", "grams": number, "protein": number, "carbs": number, "fat": number}]
}

- protein, carbs, fat：本餐总 P/C/F（克）
- deltaCarbs：实际摄入碳水 - ${CARBS_ANCHOR_G}（锚点值），即 本餐carbs - ${CARBS_ANCHOR_G}
- adjustment：若用户描述模糊，你基于上海主流餐饮分量做了中值估算，在此简要说明估算逻辑；否则为 null。对于明显高油炸类（如炸鸡、薯条等），在 adjustment 中用温和、不过度说教的语气给出简短提醒，例如「此类食物较高油脂，本次按一份标准炸鸡估算」；
- items：必须拆解为具体食材与克数，每项包含 name、grams、protein、carbs、fat。**items 中的 grams 一律按「熟重」（可食用状态）给出**，除非用户明确说了「生重」「干面」「干重」等才用生重。例如一碗拉面给 250～300g（煮熟后面条重），而非 100～150g 生面。
  优先按「主食 + 主菜 + 配菜」拆分，语义上归为「主碳水」「主蛋白」「主要油脂」；各 item 的 protein/carbs/fat 之和等于本餐总 P/C/F。
  一碗云阿蛮米线示例：米线（主碳水）约 300g（熟）、牛肉/肉臊（主蛋白）若干克。

## 鲁棒性
- 若用户输入非常模糊（如只说「吃了一碗面」），按上海主流一份的中值估算，并在 adjustment 中说明你的估算依据和保守程度。
- 若用户提到酒类（啤酒、白酒、红酒、烧酒等），请如实解析并计入 items，可估算毫升/杯对应的碳水与热量；在 adjustment 中可简短提醒「已计入酒精，减脂期建议控酒」。`

/** 解析结果（与 LLM 约定一致） */
export interface NutrientParseResult {
  protein: number
  carbs: number
  fat: number
  deltaCarbs: number
  adjustment: string | null
  /** 拆解后的食材与克数，用于卡片展示（如 米线 100g、牛肉 15g） */
  items?: Array<{ name: string; grams: number; protein: number; carbs: number; fat: number }>
}

/** 餐次类型，用于给模型上下文 */
export type MealType =
  | '早餐'
  | '练后即刻'
  | '午餐'
  | '晚餐'
  | '练前'
  | '练后午餐'
  | '练后晚餐'
  | string

export interface ParseMealInputOptions {
  /** 可选：API Key，不传则用 import.meta.env.VITE_OPENAI_API_KEY */
  apiKey?: string
  /** 可选：API 基础 URL，默认 OpenAI */
  baseUrl?: string
  /** 可选：模型，默认 gpt-4o-mini */
  model?: string
}

const DEFAULT_BASE_URL = 'https://api.openai.com/v1'
const DEFAULT_MODEL = 'gpt-4o-mini'

const env = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env : {}

/** 从环境变量读取 LLM 配置（支持 OpenAI / DeepSeek / 智谱 / 硅基流动 等兼容接口） */
function getEnvConfig() {
  const apiKey = (env.VITE_LLM_API_KEY ?? env.VITE_OPENAI_API_KEY) as string | undefined
  let baseUrl = env.VITE_LLM_BASE_URL as string | undefined
  const model = env.VITE_LLM_MODEL as string | undefined
  const useProxy = env.VITE_LLM_USE_PROXY === 'true' || env.VITE_LLM_USE_PROXY === '1'
  if (useProxy && typeof location !== 'undefined') {
    baseUrl = '/api/llm'
  }
  return { apiKey, baseUrl, model, useProxy }
}

/**
 * 调用 LLM 解析用户输入，返回 P/C/F 及 deltaCarbs。
 * 支持 OpenAI、DeepSeek、智谱、通义、Moonshot 等兼容 OpenAI 格式的接口。
 */
export async function parseMealInput(
  text: string,
  currentMealType: MealType,
  options: ParseMealInputOptions = {}
): Promise<NutrientParseResult> {
  const envConfig = getEnvConfig()
  const apiKey = options.apiKey ?? envConfig.apiKey
  const useProxy = envConfig.useProxy && !options.apiKey && !options.baseUrl
  if (!useProxy && !apiKey?.trim()) {
    throw new Error('缺少 LLM API Key，请在 .env 中设置 VITE_LLM_API_KEY 或 VITE_OPENAI_API_KEY')
  }

  const baseUrl = (options.baseUrl ?? (envConfig.baseUrl || DEFAULT_BASE_URL)).toString().replace(/\/$/, '')
  const model = (options.model ?? (envConfig.model || DEFAULT_MODEL)).toString()

  const userMessage = `当前餐次：${currentMealType}\n用户输入：${text}\n请仅返回上述 JSON，不要其它内容。`

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (!useProxy && apiKey) headers.Authorization = `Bearer ${apiKey}`

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
      temperature: 0,  // 同一输入尽量得到相同解析，提高稳定性
      max_tokens: 800,
    }),
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`LLM 请求失败 ${res.status}: ${errText}`)
  }

  const data = (await res.json()) as Record<string, unknown>
  const firstChoice = Array.isArray(data?.choices) ? data.choices[0] : undefined
  const msg = firstChoice && typeof firstChoice === 'object' && firstChoice !== null ? (firstChoice as Record<string, unknown>).message : undefined
  const messageObj = msg && typeof msg === 'object' && msg !== null ? msg as Record<string, unknown> : undefined
  let content = typeof messageObj?.content === 'string' ? messageObj.content.trim() : ''
  if (!content && typeof (firstChoice as Record<string, unknown>)?.text === 'string') {
    content = ((firstChoice as Record<string, unknown>).text as string).trim()
  }
  if (!content) {
    const raw = JSON.stringify(data).slice(0, 300)
    throw new Error('LLM 未返回内容。响应: ' + raw)
  }

  const jsonStr = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()
  let parsed: unknown
  try {
    parsed = JSON.parse(jsonStr)
  } catch {
    throw new Error(`LLM 返回非合法 JSON: ${content.slice(0, 200)}`)
  }

  const obj = parsed as Record<string, unknown>
  const protein = Number(obj?.protein)
  const carbs = Number(obj?.carbs)
  const fat = Number(obj?.fat)
  const deltaCarbs = Number(obj?.deltaCarbs)

  if (Number.isNaN(protein) || Number.isNaN(carbs) || Number.isNaN(fat)) {
    throw new Error(`解析结果缺少有效 P/C/F: ${jsonStr.slice(0, 200)}`)
  }

  const result: NutrientParseResult = {
    protein: Math.round(protein * 10) / 10,
    carbs: Math.round(carbs * 10) / 10,
    fat: Math.round(fat * 10) / 10,
    deltaCarbs: Number.isNaN(deltaCarbs) ? carbs - CARBS_ANCHOR_G : Math.round(deltaCarbs * 10) / 10,
    adjustment: typeof obj?.adjustment === 'string' ? obj.adjustment : null,
  }

  if (Array.isArray(obj?.items) && obj.items.length > 0) {
    result.items = (obj.items as Array<Record<string, unknown>>).map((it) => {
      const grams = Math.max(0, Number(it?.grams) ?? 0)
      const protein = Number(it?.protein) || 0
      const carbs = Number(it?.carbs) || 0
      const fat = Number(it?.fat) || 0
      return {
        name: String(it?.name ?? ''),
        grams: grams || 100,
        protein,
        carbs,
        fat,
      }
    })
  }

  const withDb = applySuperBowlDatabase(text, result)
  return normalizeComboItems(text, withDb)
}

/** 从原文中解析与某食材相关的份量倍数（半份→0.5，一份→1，两份→2） */
function getQuantityMultiplier(text: string, itemName: string, dbName: string): number {
  const lower = text.replace(/\s/g, '').toLowerCase()
  const names = [itemName, dbName].filter(Boolean).map((n) => n.replace(/\s/g, '').toLowerCase())
  if (names.length === 0) return 1

  const phraseMatches: Array<{ mult: number; phrase: string }> = []
  const halfRegex = /(?:半份|一半|1\/2份?)([^，。、；份\s半两一]+)/g
  const twoRegex = /(?:两份|2份)([^，。、；份\s半两一]+)/g
  let m
  while ((m = halfRegex.exec(lower)) !== null) phraseMatches.push({ mult: 0.5, phrase: m[1] })
  while ((m = twoRegex.exec(lower)) !== null) phraseMatches.push({ mult: 2, phrase: m[1] })

  for (const { mult, phrase } of phraseMatches) {
    if (names.some((n) => n.includes(phrase) || phrase.includes(n))) return mult
  }
  if (/半份|一半/.test(lower) && names.some((n) => n.includes('谷物') || n.includes('饭') || n.includes('沙拉'))) {
    if (names.some((n) => n.includes('沙拉')) && /半份沙拉|一半沙拉/.test(lower)) return 0.5
    if (names.some((n) => n.includes('谷物') || n.includes('饭')) && /半份.*[饭谷物]|一半.*[饭谷物]/.test(lower)) return 0.5
  }
  return 1
}

/**
 * 若输入中包含「超级碗」/ Super Bowl，则用超级碗数据库覆盖匹配到的食材克数与宏量（更贴近真实份量）。
 * 支持「半份谷物饭」→100g、「半份沙拉」→100g 等数量词修正。
 */
function applySuperBowlDatabase(text: string, result: NutrientParseResult): NutrientParseResult {
  const t = text.toLowerCase()
  if (!t.includes('超级碗') && !t.includes('super bowl')) return result
  if (!result.items || result.items.length === 0) return result

  const db = SUPER_BOWL_DB.database
  const allEntries: Array<{
    name: string
    size?: string
    kcal: number
    protein: number
    fat: number
    carbs: number
  }> = []

  const pushFromArray = (arr?: Array<any>) => {
    if (!Array.isArray(arr)) return
    arr.forEach((e) => {
      if (!e?.name || e.kcal == null) return
      allEntries.push({
        name: String(e.name),
        size: e.size,
        kcal: Number(e.kcal) || 0,
        protein: Number(e.protein) || 0,
        fat: Number(e.fat) || 0,
        carbs: Number(e.carbs) || 0,
      })
    })
  }

  pushFromArray(db.carbonates_base)
  pushFromArray(db.proteins)
  pushFromArray(db.dietary_fiber)
  pushFromArray(db.toppings)
  Object.values(db.sauces || {}).forEach((grp: any) => pushFromArray(grp as any))
  pushFromArray(db.wraps)
  pushFromArray(db.snacks_and_drinks)

  const cloned: NutrientParseResult = {
    ...result,
    items: result.items?.map((it) => ({ ...it })) ?? [],
  }

  cloned.items!.forEach((item) => {
    const name = (item.name || '').toLowerCase()
    const match = allEntries.find((e) => e.name.toLowerCase().includes(name) || name.includes(e.name.toLowerCase()))
    if (!match) return
    const mult = getQuantityMultiplier(text, item.name || '', match.name)
    const sizeMatch = /(\d+(\.\d+)?)g/.exec(match.size || '')
    let baseGrams = sizeMatch ? Number(sizeMatch[1]) : 100
    if (mult === 0.5 && (match.name.includes('沙拉') || name.includes('沙拉'))) {
      baseGrams = 200
    }
    const grams = Math.round(baseGrams * mult)
    item.grams = Math.max(1, grams)
    const scale = mult
    item.protein = Math.round((Number(match.protein) || 0) * scale * 10) / 10
    item.carbs = Math.round((Number(match.carbs) || 0) * scale * 10) / 10
    item.fat = Math.round((Number(match.fat) || 0) * scale * 10) / 10
  })

  return cloned
}

/**
 * 处理「超级碗」这类组合菜：不把「超级碗」本身当成一个独立食材，只保留其拆解后的底料/蛋白/配菜/酱料。
 * 同时基于 items 重新汇总总 P/C/F，保证卡片与总量一致。
 */
function normalizeComboItems(text: string, result: NutrientParseResult): NutrientParseResult {
  if (!result.items || result.items.length === 0) return result
  const comboPattern = /(超级碗|super\s*bowl)/i

  const keptItems = result.items.filter((it) => !comboPattern.test(it.name || ''))
  const removedCount = result.items.length - keptItems.length

  if (keptItems.length === 0) {
    // 如果全被过滤掉，保留原结果以避免完全丢失
    return result
  }

  const normalized: NutrientParseResult = {
    ...result,
    items: keptItems,
  }

  // 基于剩余 items 重新汇总总 P/C/F
  let p = 0
  let c = 0
  let f = 0
  keptItems.forEach((it) => {
    p += Number(it.protein) || 0
    c += Number(it.carbs) || 0
    f += Number(it.fat) || 0
  })

  normalized.protein = Math.round(p * 10) / 10
  normalized.carbs = Math.round(c * 10) / 10
  normalized.fat = Math.round(f * 10) / 10
  normalized.deltaCarbs = normalized.carbs - CARBS_ANCHOR_G

  if (removedCount > 0) {
    const extraNote = '「超级碗」作为组合标签未单独计入，只拆解为底料/蛋白/配菜/酱料等具体食材。'
    if (normalized.adjustment) {
      normalized.adjustment = normalized.adjustment + ' ' + extraNote
    } else {
      normalized.adjustment = extraNote
    }
  }

  return normalized
}
