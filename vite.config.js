import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      // 开发时用代理转发 LLM 请求，避免浏览器跨域且不暴露 API Key
      '/api/llm': {
        target: process.env.VITE_LLM_BASE_URL || 'https://api.openai.com/v1',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/llm/, ''),
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            const key = process.env.VITE_LLM_API_KEY || process.env.VITE_OPENAI_API_KEY
            if (key) proxyReq.setHeader('Authorization', `Bearer ${key}`)
          })
        },
      },
      // 语音识别 + 拍照识别：转发到本地 voice-server，实现「一个网址」访问
      '/api/voice-to-text': { target: 'http://localhost:5175', changeOrigin: true },
      '/api/image-to-meal-description': { target: 'http://localhost:5175', changeOrigin: true },
    },
  },
})
