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
// 未配置时：硅基流动用千问视觉模型，OpenAI 用 gpt-4o-mini（均支持识图）
const isSiliconFlow = /siliconflow/i.test(LLM_BASE_URL)
const DEFAULT_VISION_MODEL = isSiliconFlow ? 'Qwen/Qwen2.5-VL-7B-Instruct' : 'gpt-4o-mini'
const LLM_VISION_MODEL = process.env.VITE_LLM_VISION_MODEL || DEFAULT_VISION_MODEL
// 硅基国内接口可能模型名不同，20012 时依次尝试以下视觉/多模态模型
const SILICONFLOW_VISION_FALLBACKS = [
  'Qwen/Qwen3.5-122B-A10B',       // 千问多模态，支持图像
  'Qwen/Qwen2.5-VL-7B-Instruct',
  'Qwen/Qwen3-VL-8B-Instruct',
  'Qwen/Qwen2.5-VL-32B-Instruct',
  'Qwen/Qwen2-VL-7B-Instruct',
]

const IMAGE_DESCRIPTION_PROMPT = `你是一位营养助手。请用一句话简短描述图中的食物/餐食，便于后续估算热量与三大营养素。
描述要具体到品类与份量，例如：一碗云阿蛮米线、一份超级碗配鸡胸肉和谷物饭、两块全家鸡胸。
只输出这一句话，不要解释、不要句号结尾。`

function isModelNotFound(errText) {
  if (!errText || typeof errText !== 'string') return false
  return /20012|Model does not exist|model.*not.*found|模型不存在/i.test(errText)
}

app.post('/api/image-to-meal-description', imageUpload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '请上传一张图片（字段名 image）' })
    }
    if (!LLM_API_KEY) {
      return res
        .status(500)
        .json({ error: '照片识别未配置：请在 .env 中设置 VITE_LLM_API_KEY 或 SILICONFLOW_API_KEY' })
    }

    const mime = req.file.mimetype || 'image/jpeg'
    const base64 = req.file.buffer.toString('base64')
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
        max_tokens: 150,
        temperature: 0.2,
      }

      const resp = await fetch(`${LLM_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${LLM_API_KEY}`,
        },
        body: JSON.stringify(body),
      })

      lastErrText = await resp.text()

      if (resp.ok) {
        const data = JSON.parse(lastErrText)
        const content = data?.choices?.[0]?.message?.content
        const text = (typeof content === 'string' ? content : '').trim()
        if (text) {
          return res.json({ text })
        }
        lastErrText = '模型未返回餐食描述'
        continue
      }

      if (isModelNotFound(lastErrText) && modelsToTry.indexOf(model) < modelsToTry.length - 1) {
        continue
      }
      break
    }

    let msg = lastErrText.slice(0, 400)
    if (isModelNotFound(msg)) {
      msg += ' 请在 .env 中设置 VITE_LLM_VISION_MODEL 为你在控制台可见的视觉模型（如 Qwen/Qwen3-VL-8B-Instruct）。'
    } else if (/vision|image|multimodal|不支持|does not support/i.test(lastErrText)) {
      msg += '（提示：请设置 VITE_LLM_VISION_MODEL 为视觉模型）'
    }
    return res.status(500).json({ error: `视觉模型请求失败: ${msg}` })
  } catch (err) {
    console.error('[voiceServer] image-to-meal-description error', err)
    return res.status(500).json({ error: err?.message || '照片识别失败' })
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

