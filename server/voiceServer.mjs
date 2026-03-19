import express from 'express'
import multer from 'multer'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'

dotenv.config()

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DIST_PATH = path.join(__dirname, '..', 'dist')
const isProduction = process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT != null

const app = express()
app.use(cors())
app.use(express.json({ limit: '1mb' }))

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
})

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB for images
  fileFilter: (req, file, cb) => {
    const ok = /^image\/(jpeg|png|webp|gif)$/i.test(file.mimetype)
    if (ok) cb(null, true)
    else cb(new Error('仅支持图片：JPEG/PNG/WebP/GIF'), false)
  },
})

const SILICONFLOW_API_KEY =
  process.env.SILICONFLOW_API_KEY ||
  process.env.VOICE_SILICONFLOW_API_KEY ||
  process.env.VITE_LLM_API_KEY

if (!SILICONFLOW_API_KEY) {
  console.warn(
    '[voiceServer] 未配置 SILICONFLOW_API_KEY / VOICE_SILICONFLOW_API_KEY / VITE_LLM_API_KEY，/api/voice-to-text 将返回错误提示'
  )
}

app.post('/api/voice-to-text', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '缺少音频文件 file' })
    }
    if (!SILICONFLOW_API_KEY) {
      return res
        .status(500)
        .json({ error: '语音识别未配置：请在 .env 中设置 SILICONFLOW_API_KEY 或 VOICE_SILICONFLOW_API_KEY' })
    }

    const form = new FormData()
    form.append('file', new Blob([req.file.buffer]), 'audio.webm')
    form.append('model', 'FunAudioLLM/SenseVoiceSmall')

    const resp = await fetch('https://api.siliconflow.cn/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SILICONFLOW_API_KEY}`,
      },
      body: form,
    })

    if (!resp.ok) {
      const errText = await resp.text()
      return res.status(resp.status).json({ error: `SiliconFlow 语音识别失败: ${errText}` })
    }

    const data = await resp.json()
    const text = (data.text || '').trim()
    if (!text) {
      return res.status(500).json({ error: '语音识别成功但返回空文本' })
    }
    return res.json({ text })
  } catch (err) {
    console.error('[voiceServer] error', err)
    return res.status(500).json({ error: err?.message || String(err) })
  }
})

// ---------- 照片识别：图像 → 一句话餐食描述（供前端再走 parseMealInput 算热量）----------
const LLM_API_KEY =
  process.env.VITE_LLM_API_KEY ||
  process.env.SILICONFLOW_API_KEY
const LLM_BASE_URL = (process.env.VITE_LLM_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '')
const isSiliconFlow = /siliconflow/i.test(LLM_BASE_URL)
const DEFAULT_VISION_MODEL = isSiliconFlow ? 'Qwen/Qwen2.5-VL-7B-Instruct' : 'gpt-4o-mini'
const LLM_VISION_MODEL = process.env.VITE_LLM_VISION_MODEL || DEFAULT_VISION_MODEL
const SILICONFLOW_VISION_FALLBACKS = [
  'Qwen/Qwen3.5-122B-A10B',
  'Qwen/Qwen2.5-VL-7B-Instruct',
  'Qwen/Qwen3-VL-8B-Instruct',
  'Qwen/Qwen2.5-VL-32B-Instruct',
  'Qwen/Qwen2-VL-7B-Instruct',
]

const GEMINI_API_KEY = process.env.GEMINI_API_KEY
const GEMINI_VISION_MODEL = 'gemini-1.5-flash'

const IMAGE_DESCRIPTION_PROMPT = `你是一位专业营养师助手，请识别图中所有食物，逐项列出食物名称和估算克数。
格式要求：每项食物单独一行，格式为「食物名 克数g」，例如：
米饭 200g
清蒸鸡胸 150g
炒青菜 100g
只输出食物列表，不要任何解释和多余文字。若无法判断克数，按常见一份估算。`

function isModelNotFound(errText) {
  if (!errText || typeof errText !== 'string') return false
  return /20012|Model does not exist|model.*not.*found|模型不存在/i.test(errText)
}

// Gemini 图片识别
async function recognizeWithGemini(base64, mime) {
  if (!GEMINI_API_KEY) return null
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_VISION_MODEL}:generateContent?key=${GEMINI_API_KEY}`
    const body = {
      contents: [{
        parts: [
          { text: IMAGE_DESCRIPTION_PROMPT },
          { inline_data: { mime_type: mime, data: base64 } },
        ],
      }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 300 },
    }
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!resp.ok) return null
    const data = await resp.json()
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
    return text || null
  } catch {
    return null
  }
}

app.post('/api/image-to-meal-description', imageUpload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '请上传一张图片（字段名 image）' })
    }

    const mime = req.file.mimetype || 'image/jpeg'
    const base64 = req.file.buffer.toString('base64')

    // 优先用 Gemini（识别更准，免费额度大）
    const geminiText = await recognizeWithGemini(base64, mime)
    if (geminiText) {
      return res.json({ text: geminiText })
    }

    // Gemini 不可用时降级到 SiliconFlow/OpenAI
    if (!LLM_API_KEY) {
      return res.status(500).json({ error: '照片识别未配置：请在 .env 中设置 GEMINI_API_KEY 或 VITE_LLM_API_KEY' })
    }

    const dataUrl = `data:${mime};base64,${base64}`
    const modelsToTry = process.env.VITE_LLM_VISION_MODEL
      ? [LLM_VISION_MODEL]
      : isSiliconFlow
        ? [...SILICONFLOW_VISION_FALLBACKS]
        : [LLM_VISION_MODEL]

    let lastErrText = ''
    for (const model of modelsToTry) {
      const body = {
        model,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: IMAGE_DESCRIPTION_PROMPT },
              { type: 'image_url', image_url: { url: dataUrl } },
            ],
          },
        ],
        max_tokens: 300,
        temperature: 0.1,
      }

      const resp = await fetch(`${LLM_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${LLM_API_KEY}` },
        body: JSON.stringify(body),
      })

      lastErrText = await resp.text()

      if (resp.ok) {
        const data = JSON.parse(lastErrText)
        const content = data?.choices?.[0]?.message?.content
        const text = (typeof content === 'string' ? content : '').trim()
        if (text) return res.json({ text })
        lastErrText = '模型未返回餐食描述'
        continue
      }

      if (isModelNotFound(lastErrText) && modelsToTry.indexOf(model) < modelsToTry.length - 1) continue
      break
    }

    let msg = lastErrText.slice(0, 400)
    if (isModelNotFound(msg)) {
      msg += ' 请在 .env 中设置 VITE_LLM_VISION_MODEL 为你在控制台可见的视觉模型。'
    }
    return res.status(500).json({ error: `视觉模型请求失败: ${msg}` })
  } catch (err) {
    console.error('[voiceServer] image-to-meal-description error', err)
    return res.status(500).json({ error: err?.message || '照片识别失败' })
  }
})

// ---------- 临时：查询服务器出口 IP（用完删掉）----------
app.get('/api/myip', async (req, res) => {
  try {
    const r = await fetch('https://ifconfig.me')
    const ip = (await r.text()).trim()
    res.json({ ip })
  } catch (e) {
    res.status(500).json({ error: e?.message })
  }
})

// ---------- FatSecret 食物搜索（OAuth 2.0 client_credentials）----------
const FATSECRET_CLIENT_ID = process.env.FATSECRET_CLIENT_ID
const FATSECRET_CLIENT_SECRET = process.env.FATSECRET_CLIENT_SECRET

// 内存缓存 token，避免每次请求都重新获取（token 有效期 86400s）
let fsToken = null
let fsTokenExpiresAt = 0

async function getFatSecretToken() {
  if (fsToken && Date.now() < fsTokenExpiresAt - 60_000) return fsToken
  const creds = Buffer.from(`${FATSECRET_CLIENT_ID}:${FATSECRET_CLIENT_SECRET}`).toString('base64')
  const resp = await fetch('https://oauth.fatsecret.com/connect/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${creds}`,
    },
    body: 'grant_type=client_credentials&scope=basic',
  })
  if (!resp.ok) throw new Error(`FatSecret token 获取失败: ${await resp.text()}`)
  const data = await resp.json()
  fsToken = data.access_token
  fsTokenExpiresAt = Date.now() + (data.expires_in || 86400) * 1000
  return fsToken
}

// 解析 food_description 字段，标准化为每 100g 的 P/C/F
// 格式示例：
//   "Per 100g - Calories: 130kcal | Fat: 2.50g | Carbs: 25.00g | Protein: 3.00g"
//   "Per 1 serving (150g) - Calories: 195kcal | Fat: 3.75g | Carbs: 37.50g | Protein: 4.50g"
function parseFatSecretDescription(desc) {
  if (!desc) return null
  const fat = parseFloat(/Fat:\s*([\d.]+)g/i.exec(desc)?.[1])
  const carbs = parseFloat(/Carbs:\s*([\d.]+)g/i.exec(desc)?.[1])
  const protein = parseFloat(/Protein:\s*([\d.]+)g/i.exec(desc)?.[1])
  if (isNaN(fat) || isNaN(carbs) || isNaN(protein)) return null

  // 提取 serving 克数（"Per 100g" 或 "Per 1 serving (150g)" 等格式）
  const perGrams =
    parseFloat(/Per\s+[\d./]+\s+\w+\s+\((\d+\.?\d*)g\)/i.exec(desc)?.[1]) ||
    parseFloat(/Per\s+(\d+\.?\d*)g/i.exec(desc)?.[1]) ||
    100

  const factor = 100 / perGrams
  return {
    protein: Math.round(protein * factor * 10) / 10,
    carbs: Math.round(carbs * factor * 10) / 10,
    fat: Math.round(fat * factor * 10) / 10,
  }
}

app.get('/api/food/search', async (req, res) => {
  const query = (req.query.q || '').trim()
  if (!query) return res.status(400).json({ error: '缺少参数 q' })
  if (!FATSECRET_CLIENT_ID || !FATSECRET_CLIENT_SECRET) {
    return res.status(500).json({ error: 'FatSecret 未配置' })
  }
  try {
    const token = await getFatSecretToken()
    const params = new URLSearchParams({
      method: 'foods.search',
      search_expression: query,
      format: 'json',
      max_results: '5',
    })
    const resp = await fetch(`https://platform.fatsecret.com/rest/server.api?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!resp.ok) return res.status(resp.status).json({ error: await resp.text() })
    const data = await resp.json()

    const foods = data?.foods?.food
    const list = Array.isArray(foods) ? foods : foods ? [foods] : []

    // 找第一条能解析出 P/C/F 的结果
    for (const food of list) {
      const macros = parseFatSecretDescription(food.food_description)
      if (!macros) continue
      return res.json({
        name: food.food_name,
        protein: macros.protein,
        carbs: macros.carbs,
        fat: macros.fat,
        source: 'fatsecret',
      })
    }

    return res.json(null) // 没有可用结果
  } catch (err) {
    console.error('[food/search]', err)
    return res.status(500).json({ error: err?.message || 'FatSecret 查询失败' })
  }
})

// ---------- 生产环境：LLM 代理（前端走 /api/llm 避免跨域与暴露 Key）----------
const LLM_PROXY_BASE = process.env.VITE_LLM_BASE_URL || process.env.VITE_OPENAI_API_BASE || 'https://api.openai.com/v1'
const LLM_PROXY_KEY = process.env.VITE_LLM_API_KEY || process.env.VITE_OPENAI_API_KEY
app.post('/api/llm/chat/completions', async (req, res) => {
  const base = LLM_PROXY_BASE.replace(/\/$/, '')
  const url = `${base}/chat/completions`
  const headers = { 'Content-Type': 'application/json' }
  if (LLM_PROXY_KEY) headers.Authorization = `Bearer ${LLM_PROXY_KEY}`
  try {
    const proxyRes = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(req.body || {}),
    })
    const text = await proxyRes.text()
    res.status(proxyRes.status).set('Content-Type', 'application/json; charset=utf-8').send(text)
  } catch (e) {
    res.status(502).json({ error: e?.message || 'LLM 代理请求失败' })
  }
})

// ---------- 生产环境：托管前端静态 + SPA 回退（仅 use，不用 get 通配）----------
if (isProduction) {
  app.use(express.static(DIST_PATH, { index: false }))
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api/')) return next()
    res.sendFile(path.join(DIST_PATH, 'index.html'), (err) => {
      if (err) next(err)
    })
  })
}

const port = process.env.PORT || process.env.VOICE_SERVER_PORT || 5175
app.listen(port, () => {
  console.log(`[voiceServer] listening on http://localhost:${port}` + (isProduction ? ' (production, serving frontend)' : ''))
})

