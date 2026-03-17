/**
 * AI 营养解析：将用户口语输入（如「我吃了一碗云阿蛮米线」）转化为 P/C/F 数值。
 * 依赖 LLM 接口，需配置 API Key（如 VITE_OPENAI_API_KEY 或传入 options.apiKey）。
 */

import { SUPER_BOWL_DB, formatSuperBowlDataForPrompt, getSuperBowlPer100ForName } from '../data/superBowlDatabase'
import { lookupFood } from './food-lookup'
import { buildFoodParseSystemPrompt } from './parse-food-prompt'

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

/** 解析「吃了什么」agent 的 system prompt，已暴露便于查看或复用 */
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
- 标准份量约定（一碗/一杯/一笼 = 一份；**输出 grams 均为熟重或可食用状态**，除非用户明确说生重/干面）：
  - 兰州拉面 / 拉面 / 牛肉面：一碗煮熟后面条约 250～300g（即 2～3 两生面煮好后的熟重），约 70g 碳水、20g 蛋白质。items 里拉面填 300g 表示 300g 熟面。若用户说「加白切肉」等，单独列一项白切肉（如 80g，对应 P/F）。
  - 云阿蛮米线 / 米线：米线约 300g（熟），按米线品类估算 P/C/F。
  - 米饭（一碗）：熟米饭约 150～200g。
  - 黑咖啡 / 美式咖啡 / 美式：默认「一杯」约 250g 液体，若未提及糖和奶则 P/C/F 记为 0；若用户说「美式加少量牛奶」，按 250g 记录，其中牛奶部分按 50g 全脂牛奶估算 P/C/F，其余视为纯咖啡 0kcal。不得在同一天对「一杯美式」给出 100g/250g 等不同克重，必须固定为 250g。
  - 小笼包：默认「一笼」= 8 只 ≈ 200g 熟重，小笼包单个约 25g。若用户说「一笼小笼包」，items 里给一条「小笼包 200g」；若说「3 个小笼包」，给 75g；若只说「几个小笼包」等模糊表达，可按 4 个≈100g 估算，并在 adjustment 中说明。不得在同一用户下将「一笼小笼包」解析为 150g/220g 等不同克重，必须固定为 200g。
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
  items?: Array<{
    name: string
    grams: number
    /** 用户口径：true=生/干重；false=熟/可食用 */
    isRawWeight?: boolean
    protein: number
    carbs: number
    fat: number
    /** 若数据库可提供，供入库/展示换算使用（熟重/生重） */
    cookedPerRawRatio?: number
  }>
}

type ParsedStructureItem = { name: string; query: string; grams: number; isRawWeight: boolean }

/** 餐次类型，用于给模型上下文 */
export type MealType =
  | '早餐'
  | '练后即刻'
  | '午餐'
  | '晚餐'
  | '练前'
  | '练前补充'
  | '练后午餐'
  | '练后晚餐'
  | '练后摄入'
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

const env = typeof import.meta !== 'undefined' && (import.meta as any)?.env ? (import.meta as any).env : {}

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

/** 估算「生重 -> 熟重」重量倍率（熟重/生重），用于首页勾选生重时的显示换算；结果应缓存复用以省 token */
export async function estimateCookedPerRawRatio(foodName: string): Promise<{ cookedPerRawRatio: number; confidence: 'high' | 'medium' | 'low' }> {
  const name = String(foodName || '').trim()
  if (!name) return { cookedPerRawRatio: 1, confidence: 'low' }

  const envConfig = getEnvConfig()
  const apiKey = envConfig.apiKey
  const useProxy = envConfig.useProxy
  if (!useProxy && !apiKey?.trim()) {
    return { cookedPerRawRatio: 1, confidence: 'low' }
  }

  const baseUrl = (envConfig.baseUrl || DEFAULT_BASE_URL).toString().replace(/\/$/, '')
  const model = (envConfig.model || DEFAULT_MODEL).toString()
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (!useProxy && apiKey) headers.Authorization = `Bearer ${apiKey}`

  const system = `你是一个严谨的营养记录助手。你的任务是估算「生重 -> 熟重（可食用状态）」的重量倍率 cookedPerRawRatio = 熟重/生重。只返回 JSON。`
  const user = `食物：${name}\n请输出 JSON：{"cookedPerRawRatio": number, "confidence": "high"|"medium"|"low"}。\n要求：\n- cookedPerRawRatio 取典型家庭/外卖常见做法的中位数\n- 合理范围通常在 0.5~5 之间（肉类多为 <1；米面/粉丝多为 >1）\n- 若无法判断或该食物本身默认就是熟食（例如“烤鸡胸肉”），返回 cookedPerRawRatio=1 且 confidence=low`

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0,
      max_tokens: 120,
    }),
  })
  if (!res.ok) return { cookedPerRawRatio: 1, confidence: 'low' }
  const data = (await res.json().catch(() => ({}))) as any
  const content = data?.choices?.[0]?.message?.content ?? ''
  const jsonStr = String(content).replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()
  try {
    const obj = JSON.parse(jsonStr)
    const ratio = Number(obj?.cookedPerRawRatio)
    const conf = obj?.confidence
    const cookedPerRawRatio = !Number.isFinite(ratio) ? 1 : Math.max(0.2, Math.min(5, ratio))
    const confidence = conf === 'high' || conf === 'medium' || conf === 'low' ? conf : 'low'
    return { cookedPerRawRatio, confidence }
  } catch {
    return { cookedPerRawRatio: 1, confidence: 'low' }
  }
}

/** 针对「超级碗 + 果木烟熏鸡胸」等固定套餐的硬编码解析：命中则直接按数据库展开组合，跳过 LLM */
function tryBuildSuperBowlComboFromText(text: string): NutrientParseResult | null {
  if (!text || typeof text !== 'string') return null
  const t = text.toLowerCase()
  if (!t.includes('超级碗')) return null

  const hasSuperBowlWord = /超级碗/.test(text)

  // 只要出现「超级碗 + 套餐」，一律视为整碗（套餐是关键），不受是否提到具体配料名影响
  const isWholeBowl = hasSuperBowlWord && /套餐/.test(text)
  if (isWholeBowl) {
    const db = SUPER_BOWL_DB.database

    const findByNameInList = (list: Array<{ name: string }>) => {
      for (const x of list) {
        const n = (x?.name || '').trim()
        if (!n) continue
        if (text.includes(n)) return n
      }
      return null
    }

    // 套餐蛋白质识别：支持「鸡腿肉/鸡胸肉/牛肉/虾/三文鱼/豆腐/金枪鱼」等通用说法映射到超级碗 DB 的具体条目
    const pickedProtein = (() => {
      if (/鸡腿/.test(text)) return '蜜汁鸡腿'
      if (/鸡胸/.test(text)) return '果木烟熏鸡胸'
      if (/牛腩|牛肉/.test(text)) return '番茄牛腩'
      if (/虾/.test(text)) return '亚麻籽油烤虾'
      if (/三文鱼/.test(text)) return '香煎三文鱼'
      if (/豆腐/.test(text)) return '日式七味豆腐'
      if (/金枪鱼/.test(text)) return '油浸金枪鱼'
      // 若套餐文案里包含具体蛋白质全称，优先用该蛋白；否则默认果木烟熏鸡胸
      return findByNameInList(db.proteins) || '果木烟熏鸡胸'
    })()
    // 若套餐文案里包含具体酱汁名，优先用该酱；否则默认融合油醋汁
    const sauceFlat: Array<{ name: string }> = Object.values(db.sauces || {}).flat() as any
    const pickedSauce = findByNameInList(sauceFlat) || '融合油醋汁'

    type Spec = { name: string; grams: number }
    const specs: Spec[] = [
      { name: '混合谷物饭', grams: 200 },
      { name: '混合沙拉叶', grams: 90 },
      { name: '混合烤蔬菜', grams: 100 },
      { name: pickedProtein, grams: 100 },
      { name: pickedSauce, grams: 30 },
    ]

    const items: NonNullable<NutrientParseResult['items']> = []
    let totalP = 0
    let totalC = 0
    let totalF = 0

    for (const spec of specs) {
      const per = getSuperBowlPer100ForName(spec.name) || {
        proteinPer100: 0,
        carbsPer100: 0,
        fatPer100: 0,
      }
      const factor = spec.grams / 100
      const p = Math.round(per.proteinPer100 * factor * 10) / 10
      const c = Math.round(per.carbsPer100 * factor * 10) / 10
      const f = Math.round(per.fatPer100 * factor * 10) / 10
      totalP += p
      totalC += c
      totalF += f
      items.push({ name: spec.name, grams: spec.grams, protein: p, carbs: c, fat: f })
    }

    const protein = Math.round(totalP * 10) / 10
    const carbs = Math.round(totalC * 10) / 10
    const fat = Math.round(totalF * 10) / 10
    const deltaCarbs = Math.round((carbs - CARBS_ANCHOR_G) * 10) / 10

    return {
      protein,
      carbs,
      fat,
      deltaCarbs,
      adjustment:
        '已按超级碗数据库「套餐」记录整碗（谷物饭底+蛋白+沙拉+蔬菜+酱汁）。如当天实际搭配有差异，可在首页调整克数。',
      items,
    }
  }

  /**
   * 只要句子里提到了「超级碗」且包含任意具体配料名（蛋白/底料/蔬菜/酱/toppings/饮品等），
   * 一律按「单独配料」处理：从 SUPER_BOWL_DB 中取标准份量与宏量，直接返回 1 条 items，跳过 LLM。
   */
  if (hasSuperBowlWord) {
    const db = SUPER_BOWL_DB.database

    // --- 简称/口语兜底：用户只说“牛肉酱/鸡胸/鸡腿/虾”等，不一定写出 DB 全称 ---
    const shorthandSingle = (() => {
      if (/牛肉酱/.test(text)) return { name: '博洛尼亚牛肉酱', grams: 30 }
      if (/牛肉辣酱|辣酱/.test(text)) return { name: '招牌牛肉辣酱', grams: 15 }
      if (/鸡胸/.test(text)) return { name: '果木烟熏鸡胸', grams: 100 }
      if (/鸡腿/.test(text)) return { name: '蜜汁鸡腿', grams: 100 }
      if (/虾/.test(text)) return { name: '亚麻籽油烤虾', grams: 100 }
      return null
    })()

    if (shorthandSingle) {
      const per = getSuperBowlPer100ForName(shorthandSingle.name) || { proteinPer100: 0, carbsPer100: 0, fatPer100: 0 }
      const factor = shorthandSingle.grams / 100
      const p = Math.round(per.proteinPer100 * factor * 10) / 10
      const c = Math.round(per.carbsPer100 * factor * 10) / 10
      const f = Math.round(per.fatPer100 * factor * 10) / 10
      return {
        protein: p,
        carbs: c,
        fat: f,
        deltaCarbs: Math.round((c - CARBS_ANCHOR_G) * 10) / 10,
        adjustment: `已按超级碗数据库记录单独配料「${shorthandSingle.name}」${shorthandSingle.grams}g。`,
        items: [{ name: shorthandSingle.name, grams: shorthandSingle.grams, protein: p, carbs: c, fat: f }],
      }
    }

    type Row = { name: string; size?: string; protein?: number; carbs?: number; fat?: number }
    const rows: Row[] = []
    const pushRows = (arr?: Array<any>) => {
      if (!Array.isArray(arr)) return
      arr.forEach((x) => {
        if (!x?.name) return
        rows.push({ name: String(x.name), size: x.size, protein: x.protein, carbs: x.carbs, fat: x.fat })
      })
    }
    pushRows(db.carbonates_base)
    pushRows(db.proteins)
    pushRows(db.dietary_fiber)
    pushRows(db.toppings)
    Object.values(db.sauces || {}).forEach((grp: any) => pushRows(grp as any))
    pushRows(db.snacks_and_drinks)

    // 找到文本中出现的“最具体（最长）”的配料名
    const matched = rows
      .filter((r) => r?.name && text.includes(r.name))
      .sort((a, b) => (b.name?.length || 0) - (a.name?.length || 0))[0]

    if (!matched) return null

    // 解析标准份量：优先从 size 取（g/ml/只）
    const size = String(matched.size || '').trim()
    const gMatch = /(\d+(?:\.\d+)?)\s*g/i.exec(size)
    const mlMatch = /(\d+(?:\.\d+)?)\s*ml/i.exec(size)
    const pieceMatch = /(\d+)\s*只/.exec(size)
    const grams = gMatch ? Number(gMatch[1]) : mlMatch ? Number(mlMatch[1]) : pieceMatch ? Number(pieceMatch[1]) : 100

    // 计算 P/C/F：若是“只”的规格（如烤虾 6只），直接使用该份的宏量；否则按每100g换算
    if (pieceMatch) {
      const p = Math.round((Number(matched.protein) || 0) * 10) / 10
      const c = Math.round((Number(matched.carbs) || 0) * 10) / 10
      const f = Math.round((Number(matched.fat) || 0) * 10) / 10
      return {
        protein: p,
        carbs: c,
        fat: f,
        deltaCarbs: Math.round((c - CARBS_ANCHOR_G) * 10) / 10,
        adjustment: `已按超级碗数据库记录一份「${matched.name}」${size || ''}。如实际份量不同，可在首页调整。`,
        items: [{ name: `${matched.name}${size ? `（${size}）` : ''}`, grams, protein: p, carbs: c, fat: f }],
      }
    }

    const per = getSuperBowlPer100ForName(matched.name) || { proteinPer100: 0, carbsPer100: 0, fatPer100: 0 }
    const factor = grams / 100
    const p = Math.round(per.proteinPer100 * factor * 10) / 10
    const c = Math.round(per.carbsPer100 * factor * 10) / 10
    const f = Math.round(per.fatPer100 * factor * 10) / 10
    return {
      protein: p,
      carbs: c,
      fat: f,
      deltaCarbs: Math.round((c - CARBS_ANCHOR_G) * 10) / 10,
      adjustment: `已按超级碗数据库记录一份「${matched.name}」${grams}${mlMatch ? 'ml' : 'g'}。如实际份量不同，可在首页调整克数。`,
      items: [{ name: matched.name, grams, protein: p, carbs: c, fat: f }],
    }
  }

  return null
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
  // 先尝试命中超级碗等固定套餐，命中则直接按数据库展开并跳过 LLM
  const superBowlCombo = tryBuildSuperBowlComboFromText(text)
  if (superBowlCombo) return superBowlCombo

  // ---------- 第一步：LLM 只解析结构（items 不含营养数值） ----------
  const envConfig = getEnvConfig()
  const apiKey = options.apiKey ?? envConfig.apiKey
  const useProxy = envConfig.useProxy && !options.apiKey && !options.baseUrl
  if (!useProxy && !apiKey?.trim()) {
    throw new Error('缺少 LLM API Key，请在 .env 中设置 VITE_LLM_API_KEY 或 VITE_OPENAI_API_KEY')
  }

  const baseUrl = (options.baseUrl ?? (envConfig.baseUrl || DEFAULT_BASE_URL)).toString().replace(/\/$/, '')
  const model = (options.model ?? (envConfig.model || DEFAULT_MODEL)).toString()

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (!useProxy && apiKey) headers.Authorization = `Bearer ${apiKey}`

  const userMessage = `当前餐次：${currentMealType}\n用户输入：${text}\n请仅返回上述 JSON，不要其它内容。`

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: buildFoodParseSystemPrompt() },
        { role: 'user', content: userMessage },
      ],
      temperature: 0,
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
  const messageObj = msg && typeof msg === 'object' && msg !== null ? (msg as Record<string, unknown>) : undefined
  let content = typeof messageObj?.content === 'string' ? messageObj.content.trim() : ''
  if (!content && typeof (firstChoice as Record<string, unknown>)?.text === 'string') {
    content = ((firstChoice as Record<string, unknown>).text as string).trim()
  }
  if (!content) {
    const raw = JSON.stringify(data).slice(0, 300)
    throw new Error('LLM 未返回内容。响应: ' + raw)
  }

  const jsonStr = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()
  let parsed: any
  try {
    parsed = JSON.parse(jsonStr)
  } catch {
    throw new Error(`LLM 返回非合法 JSON: ${content.slice(0, 200)}`)
  }

  const structureItems: ParsedStructureItem[] = Array.isArray(parsed?.items)
    ? parsed.items
        .map((it: any) => ({
          name: String(it?.name || '').trim(),
          query: String(it?.query || it?.name || '').trim(),
          grams: Math.max(0, Number(it?.grams) || 0),
          isRawWeight: Boolean(it?.isRawWeight),
        }))
        .filter((it: ParsedStructureItem) => it.name && it.query && it.grams > 0)
    : []

  const adjustment = typeof parsed?.adjustment === 'string' ? parsed.adjustment : null

  if (structureItems.length === 0) {
    // 没解析出结构，降级：让旧 LLM 直接估算（保证不崩）
    throw new Error('未解析到具体食材项，可尝试补充克数/数量。')
  }

  // ---------- 第二步：逐项查数据库并计算营养（查不到才单项兜底估算） ----------
  async function fallbackEstimateOne(item: ParsedStructureItem): Promise<{ protein: number; carbs: number; fat: number }> {
    const sys = `估算以下食物的营养数值（per 100g，${item.isRawWeight ? '生重/干重' : '熟重'}口径）。只返回 JSON：{"protein":number,"carbs":number,"fat":number}`
    const user = `食物：${item.name}`
    const r = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: sys },
          { role: 'user', content: user },
        ],
        temperature: 0,
        max_tokens: 120,
      }),
    })
    if (!r.ok) return { protein: 0, carbs: 0, fat: 0 }
    const d = await r.json().catch(() => ({} as any))
    const c = d?.choices?.[0]?.message?.content ?? ''
    const s = String(c).replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()
    try {
      const o = JSON.parse(s)
      return {
        protein: Math.max(0, Number(o?.protein) || 0),
        carbs: Math.max(0, Number(o?.carbs) || 0),
        fat: Math.max(0, Number(o?.fat) || 0),
      }
    } catch {
      return { protein: 0, carbs: 0, fat: 0 }
    }
  }

  const enrichedItems = await Promise.all(
    structureItems.map(async (it) => {
      const lookup = await lookupFood(it.query)
      const per100 = lookup.entry
      let proteinPer100 = per100?.protein ?? 0
      let carbsPer100 = per100?.carbs ?? 0
      let fatPer100 = per100?.fat ?? 0

      let cookedPerRawRatio: number | undefined = undefined
      if (per100) cookedPerRawRatio = typeof per100.cookedPerRawRatio === 'number' && per100.cookedPerRawRatio > 0 ? per100.cookedPerRawRatio : undefined

      if (!per100) {
        const est = await fallbackEstimateOne(it)
        proteinPer100 = est.protein
        carbsPer100 = est.carbs
        fatPer100 = est.fat
      } else {
        // 数据库有明确口径：根据「用户口径 it.isRawWeight」与「数据库口径 per100.isRawWeight」做必要换算
        // cookedPerRawRatio = 熟重/生重；rawToCookedRatio = 生重/熟重 = 1 / cookedPerRawRatio
        const dbIsRaw = !!per100.isRawWeight
        const userIsRaw = !!it.isRawWeight
        if (dbIsRaw !== userIsRaw && cookedPerRawRatio && Number.isFinite(cookedPerRawRatio) && cookedPerRawRatio > 0) {
          const r = cookedPerRawRatio
          if (dbIsRaw && !userIsRaw) {
            // DB 是生重/干重 per100g，用户填的是熟重克数 => per100(熟) = per100(生) / (熟/生)
            proteinPer100 = proteinPer100 / r
            carbsPer100 = carbsPer100 / r
            fatPer100 = fatPer100 / r
          } else if (!dbIsRaw && userIsRaw) {
            // DB 是熟重 per100g，用户填的是生重克数 => per100(生) = per100(熟) * (熟/生)
            proteinPer100 = proteinPer100 * r
            carbsPer100 = carbsPer100 * r
            fatPer100 = fatPer100 * r
          }
        }
      }

      const multiplier = it.grams / 100
      const protein = Math.round(proteinPer100 * multiplier * 10) / 10
      const carbs = Math.round(carbsPer100 * multiplier * 10) / 10
      const fat = Math.round(fatPer100 * multiplier * 10) / 10
      return {
        name: it.name,
        grams: it.grams,
        isRawWeight: it.isRawWeight,
        cookedPerRawRatio,
        protein,
        carbs,
        fat,
      }
    })
  )

  const totals = enrichedItems.reduce(
    (acc, it) => ({
      protein: acc.protein + (Number(it.protein) || 0),
      carbs: acc.carbs + (Number(it.carbs) || 0),
      fat: acc.fat + (Number(it.fat) || 0),
    }),
    { protein: 0, carbs: 0, fat: 0 }
  )

  const protein = Math.round(totals.protein * 10) / 10
  const carbs = Math.round(totals.carbs * 10) / 10
  const fat = Math.round(totals.fat * 10) / 10

  return {
    protein,
    carbs,
    fat,
    deltaCarbs: Math.round((carbs - CARBS_ANCHOR_G) * 10) / 10,
    adjustment,
    items: enrichedItems,
  }

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

// ---------- AI 本餐推荐：根据今日剩余 P/C/F 与餐次，生成智能建议与食材克数 ----------

const MEAL_RECOMMENDATION_PROMPT = `你是用户的饮食顾问，基于**今日剩余**的蛋白质、碳水、脂肪额度，给出**本餐**的简短建议与可选食材的推荐克数。

## 用户背景（供参考）
${USER_PERSONA_SUMMARY}
每日目标（教练建议）：蛋白质 ${USER_BASELINE.proteinTargetG}g、碳水 ${USER_BASELINE.carbsTargetG}g、脂肪 ${USER_BASELINE.fatTargetG}g。

## 输入说明
你会收到：今日剩余 P/C/F（克）、当前餐次名称、以及一份「可选食材」列表（含 id、名称、每100g 的 P/C/F、默认克数）。请结合剩余额度与餐次特点，给出：
1. **advice**：一两句话的本餐建议（如「碳水所剩很少，本餐建议以蛋白质和蔬菜为主，主食少加或不加」；若额度充足可写「额度充足，可按习惯搭配」）。
2. **suggestedGrams**：对每个食材 id 给出建议克数（0 表示本餐不建议加；建议克数不可超过今日剩余额度换算出的上限，且尽量不超过该食材的默认克数）。

规则：
- 若剩余碳水很少（如 <15g），高碳水食材（米饭、红薯、饭团等）建议 0 或很少（如 20～35g 红薯），并在 advice 中说明。
- 若剩余蛋白质充足，可推荐足量肉/蛋/豆。
- 建议克数取 5 的倍数（如 0、35、50、100），便于执行。
- 只返回 JSON，不要 markdown 或其它文字。`

export interface MealRecommendationInput {
  remaining: { protein: number; carbs: number; fat: number }
  mealName: string
  ingredients: Array<{
    id: string
    name: string
    proteinPer100: number
    carbsPer100: number
    fatPer100: number
    defaultGrams: number
  }>
}

export interface MealRecommendationResult {
  advice: string
  suggestedGrams: Record<string, number>
}

export async function getMealRecommendation(
  input: MealRecommendationInput,
  options: ParseMealInputOptions = {}
): Promise<MealRecommendationResult> {
  const envConfig = getEnvConfig()
  const apiKey = options.apiKey ?? envConfig.apiKey
  const useProxy = envConfig.useProxy && !options.apiKey && !options.baseUrl
  if (!useProxy && !apiKey?.trim()) {
    throw new Error('缺少 LLM API Key')
  }

  const baseUrl = (options.baseUrl ?? (envConfig.baseUrl || DEFAULT_BASE_URL)).toString().replace(/\/$/, '')
  const model = (options.model ?? (envConfig.model || DEFAULT_MODEL)).toString()

  const userMessage = `今日剩余：蛋白质 ${input.remaining.protein}g、碳水 ${input.remaining.carbs}g、脂肪 ${input.remaining.fat}g。
当前餐次：${input.mealName}

可选食材（id, 名称, 每100g蛋白/碳水/脂肪, 默认克数）：
${input.ingredients.map((i) => `${i.id} | ${i.name} | P${i.proteinPer100}/C${i.carbsPer100}/F${i.fatPer100} | 默认${i.defaultGrams}g`).join('\n')}

请返回 JSON：{ "advice": "一两句话本餐建议", "suggestedGrams": { "食材id": 建议克数, ... } }`

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (!useProxy && apiKey) headers.Authorization = `Bearer ${apiKey}`

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: MEAL_RECOMMENDATION_PROMPT },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.3,
      max_tokens: 500,
    }),
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`推荐请求失败: ${errText}`)
  }

  const data = (await res.json()) as Record<string, unknown>
  const firstChoice = Array.isArray(data?.choices) ? data.choices[0] : undefined
  const msg = firstChoice && typeof firstChoice === 'object' && firstChoice !== null ? (firstChoice as Record<string, unknown>).message : undefined
  const messageObj = msg && typeof msg === 'object' && msg !== null ? msg as Record<string, unknown> : undefined
  let content = typeof messageObj?.content === 'string' ? messageObj.content.trim() : ''
  if (!content && typeof (firstChoice as Record<string, unknown>)?.text === 'string') {
    content = ((firstChoice as Record<string, unknown>).text as string).trim()
  }
  if (!content) throw new Error('推荐接口未返回内容')

  const jsonStr = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()
  let parsed: unknown
  try {
    parsed = JSON.parse(jsonStr)
  } catch {
    throw new Error(`推荐返回非合法 JSON: ${content.slice(0, 200)}`)
  }

  const obj = parsed as Record<string, unknown>
  const advice = typeof obj?.advice === 'string' ? obj.advice : '本餐可按剩余额度搭配。'
  const suggestedGrams: Record<string, number> = {}
  if (obj?.suggestedGrams && typeof obj.suggestedGrams === 'object') {
    for (const [id, val] of Object.entries(obj.suggestedGrams)) {
      const g = Number(val)
      if (!Number.isNaN(g) && g >= 0) suggestedGrams[id] = Math.round(g / 5) * 5
    }
  }

  return { advice, suggestedGrams }
}

// ---------- AI 本餐推荐「吃什么」：直接给出推荐食材列表（午餐/晚餐用） ----------

/** 「这顿吃什么？」推荐 agent 的 system prompt。{{...}} 在调用时由 buildMealRecommendationPrompt 替换。 */
export const MEAL_ITEMS_RECOMMENDATION_PROMPT = `你是用户的私人减脂营养师，也是一个懂得生活的朋友。
你的任务是：根据用户今日剩余营养额度，为「本餐」推荐一份具体、可执行、真正想吃的食物清单。
核心原则：可持续性 > 最优化。一个能坚持三个月的计划，远比两周后崩掉的完美计划有效。

## 用户档案
${USER_PERSONA_SUMMARY}
每日目标：蛋白质 ${USER_BASELINE.proteinTargetG}g | 碳水 ${USER_BASELINE.carbsTargetG}g | 脂肪 ${USER_BASELINE.fatTargetG}g
目标：减脂同时保留肌肉

## 本次推荐上下文
- 当前餐次：{{MEAL_TYPE}}（早餐 / 午餐 / 练后餐 / 晚餐 / 加餐）
- **当前训练模式：{{TRAINING_MODE_LABEL}}**（早训 / 午训 / 晚练 / 休息）。advice 中必须与此一致：用户选的是午训就写「今天午训」或「训练日」，选的是休息就写「今天休息日」，选的是早训/晚练就写「今天早训」/「今天晚练」或「训练日」，不得写反或编造。
- 今日已摄入：蛋白质 {{CONSUMED_PROTEIN}}g | 碳水 {{CONSUMED_CARBS}}g | 脂肪 {{CONSUMED_FAT}}g
- 今日剩余额度：蛋白质 {{REMAINING_PROTEIN}}g | 碳水 {{REMAINING_CARBS}}g | 脂肪 {{REMAINING_FAT}}g
- 今日已吃过的食物：{{TODAY_EATEN_FOODS}}（推荐时避免重复这些食材）
- 当前月份：{{CURRENT_MONTH}}月

## 通用食材选取规则
0. **按训练模式分配（营养师原则）**：**早训/午训**时午餐可略多于晚餐（约 55% vs 45%），**勿差距过大**，晚餐也须**合理可吃**。**晚训**时晚餐略多（约 55%）、午餐略少（约 45%）。**休息日**各约 50%。**严禁**为凑额度把某项缩成 25g、30g 等无法执行的份量；若本餐额度少，应**减少项数**（如只选一种蛋白质），**单项份量不得低于合理值**（谷物饭至少半份 100g，蛋白质至少 50g 或表中 100g，酱汁 30g）。
1. **额度硬约束**：推荐的责任是「刚好符合今日剩余还能吃什么」。本餐所有 items 的 protein / carbs / fat 总和必须 ≤ 今日剩余额度（允许最多高出 10% 的舍入误差）；严禁给出明显超额的搭配。剩余碳水 < 30g 时不推荐主食。若今日剩余较少（如碳水<50g、蛋白质<40g），须用半份谷物、沙拉底为主、减少项数或选低卡蛋白质，确保推荐总和不超过剩余额度。
2. **多样性**：不得推荐今日已出现过的食材；蛋白质来源轮换（鸡胸 / 鱼 / 虾 / 牛肉 / 豆制品 / 蛋）；碳水轮换（米饭 / 糙米 / 红薯 / 燕麦 / 藜麦 / 面条）。推荐超级碗时：每次推荐都应给出不同搭配，在 7 种蛋白质与多种碳水底/蔬菜/酱汁中轮换选择，不要默认或固定推荐果木烟熏鸡胸。
3. **应季易得**：优先上海当季食材 → 华东 → 全国；只推荐超市或外卖平台能直接买到的食材
4. **减脂友好**：少加工、少油；优先高蛋白低脂选项
5. **训练日 vs 休息日**（仅此两种，勿编造腿日/胸日等）：训练日（早训/午训/晚练）碳水可给到剩余额度内；休息日碳水收紧 20～30g，增加蔬菜与蛋白质比例
6. **饮酒记录处理**：若用户今日记录了酒类摄入，advice 中不评判，简短说明酒精会暂缓脂肪代谢，今日其余餐次适当收紧脂肪摄入

## 各餐次专属规则

### 早餐
**与「当前训练模式」一致**：固定组合由「本次推荐上下文」中的「当前训练模式」决定；advice 中写「今天早训」/「今天午训」/「今天晚练」或「今天休息日」，不得写反。
**用户常吃早餐（可作为推荐选项，推荐时请直接采用下列克数）**：
- 训练日（早训/午训/晚练）：南巨米粉 30g、康比特蛋白粉 25g、羽衣甘蓝粉 10g
- 休息日：全麦面包 60g、鸡蛋 100g、豆浆 250g
用户点击刷新时可给「替代方案」：在家版 鸡蛋+燕麦+豆浆；外带版 全麦三明治+无糖豆浆；周末版 希腊酸奶+蓝莓+燕麦。advice 语气轻松，且与当前训练模式一致。

### 练前餐（香蕉）
用户固定吃香蕉作为练前碳水（早练 100g / 晚练 87g），一般不需要推荐。
若用户请求推荐或香蕉吃腻，提供等量碳水替代：替代选项 米糕 / 少量白米饭 / 椰枣 1～2 颗 / 运动能量胶；原则：快消化、低脂、碳水量对齐原方案

### 练后餐
用户固定方案：蛋白粉 30g（即刻）。AI 职责：根据当前是否为训练日判断是否需要额外补充碳水。
- 训练日（早训/午训/晚练）：视剩余额度可额外补充碳水 30～50g，推荐 香蕉 1 根 / 白米饭 100g / 即食藜麦包
- 休息日：蛋白粉足够，不额外加碳水
advice 语气：简洁，且必须与当前训练模式一致（见本次推荐上下文中的「当前训练模式」）
✅「今天午训，蛋白粉后加根香蕉，帮助糖原恢复」
✅「今天休息日，蛋白粉够了，碳水留给正餐」
❌「运动后补充碳水有助于肌糖原合成，建议……」

### 午餐
**按训练模式**：**早训/午训**时本餐略多于晚餐（传入额度约 55%），**勿堆砌**：一种碳水底+一种蛋白质+沙拉+酱汁即可，不必「鸡胸 100g 再加果木烟熏鸡胸 60g」等双蛋白。**晚训**时本餐略少（约 45%）。**休息**约 50%。**份量必须用表中固定值**：谷物饭 200g 或 100g、蛋白质 100g/130g/65g、沙拉 90g 或 100g、酱汁 30g；**禁止 25g/45g 等过小克数**。蛋白质允许超出传入 10%；不足可加一项鸡胸 100g 或鸡蛋，勿多加项堆砌。
用户在食堂或点外卖，有固定偏好但会吃腻。
食堂推荐策略：主食 杂粮饭/糙米饭优先，白米饭控量（100g 以内）；蛋白质 优先清蒸/白灼/炖煮类，避开炸物和重油红烧；蔬菜 多选，凑满一格；避开 炸猪排/糖醋类/浓汁焖菜；advice 中可提示「汤汁少浇」「主食打半份再加蛋白质」
外卖推荐策略：优先品类 日料/韩料/超级碗/越南菜；日料 刺身/烤鱼定食（少饭）/味噌汤套餐；韩料 石锅拌饭（少米多菜）/参鸡汤；东南亚 越南河粉（清汤，少面多菜）/泰式柠檬鱼；避免 拉面/炸鸡/重咖喱/套餐含炸物。推荐超级碗时：碳水底+辅助碳水/沙拉+**一种**蛋白质+蔬菜+酱汁；grams 用表中固定份量（谷物饭 200g 或 100g、蛋白质 100g 等、酱汁 30g）；轮换搭配，禁止 25g/45g 等小份量。
可推荐 1 种低 GI 水果，advice 中简短说明最佳摄入时机（两餐间/练后）
advice 语气：务实，帮用户在有限选择中做好决定
✅「食堂选蒸鱼 + 杂粮饭，汤汁少浇，蛋白质够了」
✅「外卖点越南河粉，清汤的，面条减半换蔬菜」
❌「建议选择低 GI 主食以维持血糖稳定」

### 晚餐
**按训练模式**：**早训/午训**时本餐略少于午餐（约 45%），仍须**合理可吃**；**严禁 25g 谷物饭、25g 蛋白质等过小份量**。若剩余少，可**减少项数**（如只选一种蛋白质、一种碳水底），但每项用**表中固定份量**（谷物饭至少 100g、蛋白质至少 50g 或 100g、酱汁 30g），不可把每项都缩成 25g。**晚训**时本餐略多（约 55%），在剩余内给足。**休息日**均衡。蛋白质允许超出 10%；剩余很少时可加鸡胸或鸡蛋一项补足。
用户晚餐实际场景：在公司吃，主力是点超级碗/沙拉碗外卖；有时自己做（空气炸锅+电饭锅+炒锅，最多 30 分钟）。能接受减脂餐，核心诉求是「推荐要具体、能直接执行」。
模式 A：外卖（优先推荐）超级碗 = 碳水底+辅助碳水/沙拉+蛋白质+蔬菜+酱汁；items 用**表中固定份量**（谷物饭 200g 或 **至少 100g**、蛋白质 **至少 50g 或 100g**、沙拉 90g/100g、酱汁 30g）；**禁止 25g/30g 等无法执行的克数**；额度少时减少项数而非把每项缩成 25g；根据剩余与「今日已吃」轮换搭配。
酱汁（每次必须在 advice 中点名提醒）：✅ 推荐 油醋汁/柠檬汁/日式和风汁（或超级碗 融合油醋汁/云南树番茄烧椒酱）；❌ 避开 凯撒酱/花生酱/千岛酱（100ml 约 400～500kcal）
模式 B：自己做（有时间时）设备 空气炸锅/电饭锅/炒锅，时间上限 30 分钟。空气炸锅系列（约 15 分钟）鸡胸/鸡腿/虾/三文鱼排→配杂粮饭+即食蔬菜；炒锅快手系列（约 20 分钟）番茄炒蛋/西兰花炒虾仁/蒜蓉菠菜→配少量米饭；电饭锅懒人系列（约 30 分钟）杂粮饭+超市即食卤味/卤蛋+袋装沙拉；保底方案 即食鸡胸肉+即食藜麦包+蛋白粉。
推荐优先级：模式 A > 模式 B。禁止推荐：需要提前腌制/多步骤/超过 30 分钟的方案/中餐外卖/重酱汁炒菜外卖。晚餐不推荐水果。
advice 语气：直接给结论，不解释营养原理；且必须与当前训练模式一致（若为午训则写「今天午训」或训练日，若为休息则写休息日）
✅「超级碗选牛肉+藜麦底，酱汁换油醋汁，今天午训碳水没问题」
✅「空气炸个鸡腿，配杂粮饭，20 分钟搞定，今天休息日脂肪还有空间」
❌「建议选择优质蛋白质来源以支持肌肉修复」

### 加餐
轻量为主：1～2 项，补充蛋白质或稳定血糖。推荐方向 希腊酸奶/水煮蛋/少量坚果（10～15g）/低糖水果/蛋白棒。避开 高糖零食/膨化食品。advice 一句话即可

## 超级碗可选食材与组合规则（推荐超级碗时必读：结构=碳水底+辅助碳水/沙拉+蛋白质+蔬菜+toppings+酱汁；items 须包含辅助碳水如混合沙拉叶/玉米粒/黑豆酱，勿漏；grams 用下表固定份量；亚麻籽油烤虾为 6只 不可写 100g）
{{SUPER_BOWL_DATA}}

## 输出格式
只返回以下结构的 JSON，不含任何 markdown、注释或多余文字。**items 必须为非空数组**，每项必须包含 name（字符串）、grams、protein、carbs、fat，否则用户无法点击「采用推荐」。
{ "meal": "晚餐", "mode": "外卖", "items": [ { "name": "鸡胸肉", "grams": 150, "protein": 33, "carbs": 0, "fat": 3 }, ... ], "totals": { "protein": 37, "carbs": 22, "fat": 5 }, "advice": "超级碗选鸡胸+藜麦底，酱汁换油醋汁。" }`

/** 动态替换 prompt 中所有占位符，供 getMealRecommendationItems 调用 */
export function buildMealRecommendationPrompt(params: {
  mealType: string
  consumed: { protein: number; carbs: number; fat: number }
  remaining: { protein: number; carbs: number; fat: number }
  todayFoods: string[]
  currentMonth?: number
  isTrainingDay?: boolean | null
  trainingModeLabel?: string | null
}): string {
  const {
    mealType,
    consumed,
    remaining,
    todayFoods,
    currentMonth = new Date().getMonth() + 1,
    trainingModeLabel,
  } = params
  const modeLabel = trainingModeLabel ?? '未知'
  /** 练后即刻→练后餐；练后摄入(晚练)→晚餐；练后午餐(午训)→午餐 */
  const mealTypeForPrompt =
    mealType === '练后即刻'
      ? '练后餐'
      : mealType === '练后摄入'
        ? '晚餐'
        : mealType === '练后午餐'
          ? '午餐'
          : mealType
  return MEAL_ITEMS_RECOMMENDATION_PROMPT
    .replace(/\{\{MEAL_TYPE\}\}/g, mealTypeForPrompt)
    .replace(/\{\{TRAINING_MODE_LABEL\}\}/g, modeLabel)
    .replace(/\{\{CONSUMED_PROTEIN\}\}/g, String(Math.round(consumed.protein)))
    .replace(/\{\{CONSUMED_CARBS\}\}/g, String(Math.round(consumed.carbs)))
    .replace(/\{\{CONSUMED_FAT\}\}/g, String(Math.round(consumed.fat)))
    .replace(/\{\{REMAINING_PROTEIN\}\}/g, String(Math.round(remaining.protein)))
    .replace(/\{\{REMAINING_CARBS\}\}/g, String(Math.round(remaining.carbs)))
    .replace(/\{\{REMAINING_FAT\}\}/g, String(Math.round(remaining.fat)))
    .replace(/\{\{TODAY_EATEN_FOODS\}\}/g, todayFoods.length ? todayFoods.join('、') : '暂无')
    .replace(/\{\{CURRENT_MONTH\}\}/g, String(currentMonth))
}

/** 校验模型返回的 items 营养总和：须 ≤ 剩余额度，允许最多高出 10% 的误差（推荐应尽量符合剩余额度，10% 为容差） */
export function validateMealRecommendationTotals(
  items: { protein: number; carbs: number; fat: number }[],
  remaining: { protein: number; carbs: number; fat: number }
): boolean {
  const sum = items.reduce(
    (acc, item) => ({
      protein: acc.protein + item.protein,
      carbs: acc.carbs + item.carbs,
      fat: acc.fat + item.fat,
    }),
    { protein: 0, carbs: 0, fat: 0 }
  )
  const tolerance = 1.1
  return (
    sum.protein <= remaining.protein * tolerance + 1e-6 &&
    sum.carbs <= remaining.carbs * tolerance + 1e-6 &&
    sum.fat <= remaining.fat * tolerance + 1e-6
  )
}

/** 计算 items 的 P/C/F 总和 */
function sumMealRecommendationItems(
  items: { protein: number; carbs: number; fat: number }[]
): { protein: number; carbs: number; fat: number } {
  return items.reduce(
    (acc, item) => ({
      protein: acc.protein + item.protein,
      carbs: acc.carbs + item.carbs,
      fat: acc.fat + item.fat,
    }),
    { protein: 0, carbs: 0, fat: 0 }
  )
}

/** 将 items 按比例缩小，使 P/C/F 总和不超过 remaining（允许 10% 容差），保证推荐始终在额度内 */
function scaleItemsToRemaining<T extends { grams: number; protein: number; carbs: number; fat: number }>(
  items: T[],
  remaining: { protein: number; carbs: number; fat: number }
): T[] {
  if (items.length === 0) return items
  const sum = sumMealRecommendationItems(items)
  const cap = { protein: remaining.protein * 1.1, carbs: remaining.carbs * 1.1, fat: remaining.fat * 1.1 }
  let scale = 1
  if (sum.protein > cap.protein && sum.protein > 0) scale = Math.min(scale, cap.protein / sum.protein)
  if (sum.carbs > cap.carbs && sum.carbs > 0) scale = Math.min(scale, cap.carbs / sum.carbs)
  if (sum.fat > cap.fat && sum.fat > 0) scale = Math.min(scale, cap.fat / sum.fat)
  if (scale >= 1) return items
  return items.map((it) => {
    const g = Math.max(1, Math.round((it.grams * scale) / 5) * 5)
    const p = Math.round(it.protein * scale * 10) / 10
    const c = Math.round(it.carbs * scale * 10) / 10
    const f = Math.round(it.fat * scale * 10) / 10
    return { ...it, grams: g, protein: p, carbs: c, fat: f }
  })
}

/** 当总蛋白不足今日剩余 95% 时，按比例提高「高蛋白」食材份量，使蛋白质达标（减脂保肌必须）；仅对午餐/晚餐生效，且受碳水/脂肪上限约束 */
function scaleUpProteinToTarget<T extends { name: string; grams: number; protein: number; carbs: number; fat: number }>(
  items: T[],
  remaining: { protein: number; carbs: number; fat: number },
  mealName: string
): T[] {
  if (items.length === 0) return items
  const isLunchOrDinner = mealName === '午餐' || mealName === '晚餐' || mealName === '练后摄入'
  if (!isLunchOrDinner) return items
  const targetProtein = remaining.protein * 1.1
  const sum = sumMealRecommendationItems(items)
  if (sum.protein >= targetProtein) return items
  const proteinItems = items.filter((it) => (it.protein || 0) >= 8)
  if (proteinItems.length === 0) return items
  const P_pro = proteinItems.reduce((a, it) => a + it.protein, 0)
  const P_rest = sum.protein - P_pro
  const C_pro = proteinItems.reduce((a, it) => a + it.carbs, 0)
  const C_rest = sum.carbs - C_pro
  const F_pro = proteinItems.reduce((a, it) => a + it.fat, 0)
  const F_rest = sum.fat - F_pro
  let scale = (targetProtein - P_rest) / P_pro
  if (scale <= 1) return items
  const cap = { carbs: remaining.carbs * 1.1, fat: remaining.fat * 1.1 }
  if (C_pro > 0.1) scale = Math.min(scale, (cap.carbs - C_rest) / C_pro)
  if (F_pro > 0.1) scale = Math.min(scale, (cap.fat - F_rest) / F_pro)
  scale = Math.min(scale, 2.2)
  if (scale <= 1) return items
  const byIndex = new Set(proteinItems.map((it) => items.indexOf(it)))
  return items.map((it, i) => {
    if (!byIndex.has(i)) return it
    const g = Math.max(1, Math.round((it.grams * scale) / 5) * 5)
    const p = Math.round(it.protein * scale * 10) / 10
    const c = Math.round(it.carbs * scale * 10) / 10
    const f = Math.round(it.fat * scale * 10) / 10
    return { ...it, grams: g, protein: p, carbs: c, fat: f }
  })
}

/** 鸡胸肉/鸡蛋常备营养（每100g），用于蛋白质仍不足时自动追加 */
const FALLBACK_CHICKEN_PER100 = { protein: 31, carbs: 0, fat: 1.2 }
const FALLBACK_EGG_PER100 = { protein: 12.5, carbs: 1, fat: 10 }

/** 当午餐/晚餐推荐总蛋白仍低于今日剩余 95% 时，适量追加鸡胸肉或鸡蛋（用户家中常备）；单餐最多只补约 35g 蛋白，避免全堆到一餐 */
const FALLBACK_PROTEIN_CAP_G = 35

function appendProteinFallback(
  items: MealRecommendationItem[],
  remaining: { protein: number; carbs: number; fat: number },
  mealName: string
): MealRecommendationItem[] {
  if (mealName !== '午餐' && mealName !== '晚餐' && mealName !== '练后摄入') return items
  const target = remaining.protein * 0.95
  const sum = sumMealRecommendationItems(items)
  let needP = Math.min(target - sum.protein, FALLBACK_PROTEIN_CAP_G)
  if (needP <= 5) return items
  const cap = { protein: remaining.protein * 1.1, carbs: remaining.carbs * 1.1, fat: remaining.fat * 1.1 }
  const out = [...items]
  let addedP = 0
  while (needP > 5 && addedP < FALLBACK_PROTEIN_CAP_G) {
    const currentSum = sumMealRecommendationItems(out)
    if (currentSum.protein >= remaining.protein) break
    const stillNeed = Math.min(needP, cap.protein - currentSum.protein, FALLBACK_PROTEIN_CAP_G - addedP)
    if (stillNeed <= 0) break
    if (stillNeed >= 15) {
      const g = Math.min(100, Math.round((stillNeed / (FALLBACK_CHICKEN_PER100.protein / 100)) / 5) * 5) || 100
      const p = Math.round((g / 100) * FALLBACK_CHICKEN_PER100.protein * 10) / 10
      const f = Math.round((g / 100) * FALLBACK_CHICKEN_PER100.fat * 10) / 10
      if (currentSum.carbs + 0 <= cap.carbs && currentSum.fat + f <= cap.fat) {
        out.push({ name: '鸡胸肉', grams: g, protein: p, carbs: 0, fat: f })
        needP -= p
        addedP += p
      } else break
    } else {
      const g = Math.min(100, Math.round((stillNeed / (FALLBACK_EGG_PER100.protein / 100)) / 5) * 5) || 50
      const p = Math.round((g / 100) * FALLBACK_EGG_PER100.protein * 10) / 10
      const c = Math.round((g / 100) * FALLBACK_EGG_PER100.carbs * 10) / 10
      const f = Math.round((g / 100) * FALLBACK_EGG_PER100.fat * 10) / 10
      if (currentSum.carbs + c <= cap.carbs && currentSum.fat + f <= cap.fat) {
        out.push({ name: '鸡蛋', grams: g, protein: p, carbs: c, fat: f })
        needP -= p
        addedP += p
      } else break
    }
  }
  return out
}

export interface MealRecommendationItemsInput {
  remaining: { protein: number; carbs: number; fat: number }
  mealName: string
  /** 今日已摄入 P/C/F，用于 prompt 上下文 */
  consumed?: { protein: number; carbs: number; fat: number }
  /** 今日已吃过的食物名列表，推荐时避免重复 */
  todayEatenFoods?: string[]
  /** 当前月份 1–12，不传则用系统当前月 */
  currentMonth?: number
  /** 是否训练日（休息日为 false） */
  isTrainingDay?: boolean
  /** 训练部位：胸/腿/背/肩/手臂/未知 */
  trainedMuscleGroup?: string
  /** 训练强度：高/中/低/未知（当前产品未开放，可不传） */
  trainingIntensity?: string
  /** 当前训练模式中文标签：早训/午训/晚练/休息，与首页选择一致，用于 advice 中不得写错 */
  trainingModeLabel?: string
  /** 早餐时：true 表示用户点击了刷新，希望看到替代方案而非固定组合 */
  preferBreakfastAlternative?: boolean
}

export interface MealRecommendationItem {
  name: string
  grams: number
  protein: number
  carbs: number
  fat: number
}

export interface MealRecommendationItemsResult {
  advice: string
  items: MealRecommendationItem[]
  meal?: string
  mode?: string
  totals?: { protein: number; carbs: number; fat: number }
}

export async function getMealRecommendationItems(
  input: MealRecommendationItemsInput,
  options: ParseMealInputOptions = {}
): Promise<MealRecommendationItemsResult> {
  const envConfig = getEnvConfig()
  const apiKey = options.apiKey ?? envConfig.apiKey
  const useProxy = envConfig.useProxy && !options.apiKey && !options.baseUrl
  if (!useProxy && !apiKey?.trim()) {
    throw new Error('缺少 LLM API Key')
  }

  const baseUrl = (options.baseUrl ?? (envConfig.baseUrl || DEFAULT_BASE_URL)).toString().replace(/\/$/, '')
  const model = (options.model ?? (envConfig.model || DEFAULT_MODEL)).toString()

  const consumed = input.consumed ?? { protein: 0, carbs: 0, fat: 0 }
  let systemPrompt = buildMealRecommendationPrompt({
    mealType: input.mealName,
    consumed,
    remaining: input.remaining,
    todayFoods: input.todayEatenFoods ?? [],
    currentMonth: input.currentMonth ?? new Date().getMonth() + 1,
    trainingModeLabel: input.trainingModeLabel ?? undefined,
  })
  systemPrompt = systemPrompt.replace(/\{\{SUPER_BOWL_DATA\}\}/g, formatSuperBowlDataForPrompt())

  const trainingLabel = (input.trainingModeLabel ?? '').trim() || '未知'
  const isRestDay = trainingLabel === '休息'
  const userMessage =
    input.mealName === '早餐'
      ? input.preferBreakfastAlternative
        ? `请根据上述上下文，为本餐推荐一份搭配并返回 JSON。本餐为早餐，用户点击了刷新：请给一种「替代方案」（如希腊酸奶+蓝莓+燕麦、鸡蛋+全麦吐司+豆浆等），不要固定组合。advice 中必须写「今天${trainingLabel}」或训练日/休息日与当前训练模式一致。**必须返回非空 items 数组**，每项含 name、grams、protein、carbs、fat。`
        : isRestDay
          ? '请根据上述上下文，为本餐推荐一份搭配并返回 JSON。本餐为早餐，**当前训练模式为【休息】**：请推荐休息日固定组合（全麦面包 60g、鸡蛋 100g、豆浆 250g，见上文「用户常吃早餐」）。advice 写「今天休息日」，勿输出南巨米粉/蛋白粉/羽衣甘蓝。**必须返回非空 items 数组**，每项含 name、grams、protein、carbs、fat。'
          : `请根据上述上下文，为本餐推荐一份搭配并返回 JSON。本餐为早餐，**当前训练模式为【${trainingLabel}】**：请推荐训练日固定组合（南巨米粉 30g、康比特蛋白粉 25g、羽衣甘蓝粉 10g，见上文「用户常吃早餐」）。advice 写「今天${trainingLabel}」或「训练日」，勿写「休息日」或输出全麦面包+鸡蛋+豆浆。**必须返回非空 items 数组**（3 项），每项含 name、grams、protein、carbs、fat。`
      : input.mealName === '午餐'
        ? (trainingLabel === '早训' || trainingLabel === '午训')
          ? `请根据上述上下文，为本餐推荐一份搭配并返回 JSON。本餐为**午餐**，当前为**${trainingLabel}**：传入额度约 55%（略多于晚餐，勿差距过大）。**一种碳水底+一种蛋白质+沙拉+酱汁**即可，勿堆砌多种蛋白质（如不要同时果木烟熏鸡胸+鸡胸肉 100g）。份量用表中固定值（谷物饭 200g 或 100g、蛋白质 100g、沙拉 90g/100g、酱汁 30g），**禁止 25g/45g**。必须返回非空 items 数组。`
          : trainingLabel === '晚练'
            ? `请根据上述上下文，为本餐推荐一份搭配并返回 JSON。本餐为**午餐**，当前为**晚练**：传入额度约 45%。用表中固定份量（谷物饭 200g 或 100g、蛋白质 100g 等），禁止 25g 等过小克数。必须返回非空 items 数组。`
            : `请根据上述上下文，为本餐推荐一份搭配并返回 JSON。本餐为**午餐**，当前为**休息**：传入额度约 50%。用表中固定份量，禁止 25g/45g。必须返回非空 items 数组。`
        : input.mealName === '晚餐'
          ? `请根据上述上下文，为本餐推荐一份搭配并返回 JSON。本餐为**晚餐**。${trainingLabel === '早训' || trainingLabel === '午训' ? '传入额度约 45%，与午餐平衡；**严禁 25g 谷物饭、25g 蛋白质等过小份量**；若额度少则减少项数（如只选一种蛋白质），每项仍用表中固定份量（谷物至少 100g、蛋白质至少 50g 或 100g、酱汁 30g）。' : trainingLabel === '晚练' ? '传入额度约 55%，本餐略多。用表中固定份量，禁止 25g 等。' : '传入额度约 50%，与午餐均衡。用表中固定份量，禁止 25g 等。'}本餐蛋白质总和须达到或接近 ${Math.round(input.remaining.protein)}g（可略超 10%），碳水达到或接近 ${Math.round(input.remaining.carbs)}g。必须返回非空 items 数组。`
          : input.mealName === '练后摄入'
          ? `请根据上述上下文，为本餐推荐一份搭配并返回 JSON。本餐为**练后摄入**（晚练当日练后主餐，即当日主餐）。应在剩余额度内给足碳水和蛋白质，用表中固定份量（谷物饭 200g 或 100g、蛋白质 100g 等），禁止 25g 等过小克数。本餐蛋白质总和须达到或接近 ${Math.round(input.remaining.protein)}g（可略超 10%），碳水达到或接近 ${Math.round(input.remaining.carbs)}g。必须返回非空 items 数组。`
          : input.mealName === '练后即刻'
          ? `请根据上述上下文，为本餐推荐一份搭配并返回 JSON。本餐为**练后餐**：**优先推荐蛋白粉 30g**（用户固定方案，约 24g 蛋白）；若当前为训练日（早训/午训/晚练）且今日剩余碳水充足，可额外推荐香蕉或白米饭等快碳 30～50g。必须返回非空 items 数组，至少包含「康比特蛋白粉」或「蛋白粉」30g 一项。advice 与当前训练模式一致。`
          : '请根据上述上下文，为本餐推荐一份搭配并返回 JSON。若推荐超级碗，请在多种蛋白质、碳水底、蔬菜与酱汁中轮换选择，不要总推荐同一款。'

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (!useProxy && apiKey) headers.Authorization = `Bearer ${apiKey}`

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.3,
      max_tokens: 1000,
    }),
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`本餐推荐请求失败: ${errText}`)
  }

  const data = (await res.json()) as Record<string, unknown>
  const firstChoice = Array.isArray(data?.choices) ? data.choices[0] : undefined
  const msg = firstChoice && typeof firstChoice === 'object' && firstChoice !== null ? (firstChoice as Record<string, unknown>).message : undefined
  const messageObj = msg && typeof msg === 'object' && msg !== null ? msg as Record<string, unknown> : undefined
  let content = typeof messageObj?.content === 'string' ? messageObj.content.trim() : ''
  if (!content && typeof (firstChoice as Record<string, unknown>)?.text === 'string') {
    content = ((firstChoice as Record<string, unknown>).text as string).trim()
  }
  if (!content) throw new Error('本餐推荐未返回内容')

  const jsonStr = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()
  let parsed: unknown
  try {
    parsed = JSON.parse(jsonStr)
  } catch {
    throw new Error(`本餐推荐返回非合法 JSON: ${content.slice(0, 200)}`)
  }

  const obj = parsed as Record<string, unknown>
  const advice = typeof obj?.advice === 'string' ? obj.advice : '本餐可按推荐搭配。'
  const rawItems = Array.isArray(obj?.items) ? obj.items : Array.isArray(obj?.recommendations) ? obj.recommendations : []
  const items: MealRecommendationItem[] = []
  for (const it of rawItems) {
    const o = it && typeof it === 'object' ? (it as Record<string, unknown>) : null
    if (!o) continue
    const nameVal = o.name ?? o.food ?? o.ingredient
    if (typeof nameVal !== 'string' || !nameVal.trim()) continue
    let name = String(nameVal).trim().slice(0, 30)
    // 若 LLM 把克数写在 name 里（如「混合沙拉叶 90g」）但没给 grams，从名称末尾提取，并去掉名称里的「 90g」避免和右侧克数重复
    const fromName = name.match(/(\d+)\s*g\s*$/i)
    const extractedGrams = fromName ? Math.max(0, parseInt(fromName[1], 10)) : 0
    if (extractedGrams > 0) name = name.replace(/\s*\d+\s*g\s*$/i, '').trim() || name
    const gramsNum = Math.max(0, Math.round((Number(o.grams) || extractedGrams || 0) / 5) * 5)
    const grams = gramsNum > 0 ? gramsNum : (extractedGrams > 0 ? extractedGrams : 100)
    const protein = Math.max(0, Number(o.protein) || 0)
    const carbs = Math.max(0, Number(o.carbs) || 0)
    const fat = Math.max(0, Number(o.fat) || 0)
    items.push({
      name: name.slice(0, 30),
      grams,
      protein,
      carbs,
      fat,
    })
  }

  if (input.mealName === '练后即刻' && !items.some((it) => /蛋白粉/.test(it.name))) {
    items.unshift({
      name: '康比特蛋白粉',
      grams: 30,
      protein: 24,
      carbs: 1.5,
      fat: 0.9,
    })
  }

  /** 禁止 25g 等无法执行的份量：碳水底至少 100g，蛋白质/蔬菜至少 50g，沙拉叶至少 90g，酱汁至少 15g；按比例调整 P/C/F */
  for (const it of items) {
    const n = (it.name || '').toLowerCase()
    let minG = 0
    if (/谷物|烩饭|荞麦面|藜麦|混合谷物饭|意式蔬菜烩饭|菠菜荞麦面/.test(n)) minG = 100
    else if (/沙拉叶|混合沙拉/.test(n)) minG = 90
    else if (/鸡胸|牛腩|三文鱼|金枪鱼|鸡腿|豆腐|烤虾|烟熏鸡胸|番茄牛腩|油浸金枪鱼|蜜汁鸡腿|果木烟熏|香煎三文鱼|日式七味豆腐/.test(n)) minG = 50
    else if (/烤蔬菜|杏鲍菇|西兰花|菠菜|甘蓝|玉米粒|黑豆酱/.test(n)) minG = 40
    else if (/酱|汁/.test(n)) minG = 15
    if (minG > 0 && it.grams < minG && it.grams > 0) {
      const ratio = minG / it.grams
      it.grams = minG
      it.protein = Math.round(it.protein * ratio * 10) / 10
      it.carbs = Math.round(it.carbs * ratio * 10) / 10
      it.fat = Math.round(it.fat * ratio * 10) / 10
    }
  }

  let finalItems = items
  let didScale = false
  if (!validateMealRecommendationTotals(items, input.remaining)) {
    finalItems = scaleItemsToRemaining(items, input.remaining)
    didScale = true
  }
  const sumAfterScale = sumMealRecommendationItems(finalItems)
  if (sumAfterScale.protein < input.remaining.protein * 0.9) {
    const boosted = scaleUpProteinToTarget(finalItems, input.remaining, input.mealName)
    const sumBoosted = sumMealRecommendationItems(boosted)
    if (sumBoosted.protein > sumAfterScale.protein) {
      finalItems = boosted
      didScale = true
    }
  }
  if (sumMealRecommendationItems(finalItems).protein < input.remaining.protein * 0.95) {
    const withFallback = appendProteinFallback(finalItems, input.remaining, input.mealName)
    if (withFallback.length > finalItems.length) {
      finalItems = withFallback
      didScale = true
    }
  }

  const meal = typeof obj?.meal === 'string' ? obj.meal : undefined
  const mode = typeof obj?.mode === 'string' ? obj.mode : undefined
  const totals: MealRecommendationItemsResult['totals'] = (() => {
    const s = sumMealRecommendationItems(finalItems)
    return { protein: Math.round(s.protein * 10) / 10, carbs: Math.round(s.carbs * 10) / 10, fat: Math.round(s.fat * 10) / 10 }
  })()
  const finalAdvice = didScale ? `${advice}（已按今日剩余额度与蛋白质目标微调份量）` : advice
  return { advice: finalAdvice, items: finalItems, meal, mode, totals }
}
