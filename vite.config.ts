import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['logo.png', 'logo.svg'],

      manifest: {
        name: 'RedPen AI - 作業批改',
        short_name: 'RedPen AI',
        id: '/redpen-ai/',
        description: 'AI 輔助教師快速批改作業,自動辨識錯誤並提供個人化建議',
        theme_color: '#2563eb',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        lang: 'zh-TW',
        dir: 'ltr',
        categories: ['education', 'productivity'],
        icons: [
          {
            src: '/pwa-64x64.png',
            sizes: '64x64',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ],
        screenshots: [
          {
            src: '/screenshot-upload.png',
            sizes: '844x1500',
            type: 'image/png',
            form_factor: 'narrow',
            label: '上傳學生作業'
          },
          {
            src: '/screenshot-grading.png',
            sizes: '497x1080',
            type: 'image/png',
            form_factor: 'narrow',
            label: 'AI 批改中'
          },
          {
            src: '/screenshot-report.png',
            sizes: '106x230',
            type: 'image/png',
            form_factor: 'narrow',
            label: '批改報告'
          },
          {
            src: '/screenshot-summary.png',
            sizes: '85x184',
            type: 'image/png',
            form_factor: 'narrow',
            label: '成績總覽'
          }
        ],
        shortcuts: [
          {
            name: '新增作業',
            short_name: '新增',
            description: '建立新的批改作業',
            url: '/assignment-setup',
            icons: [{ src: '/pwa-192x192.png', sizes: '192x192' }]
          },
          {
            name: '開始批改',
            short_name: '批改',
            description: '查看待批改作業清單',
            url: '/grading-list',
            icons: [{ src: '/pwa-192x192.png', sizes: '192x192' }]
          },
          {
            name: '成績總覽',
            short_name: '成績',
            description: '查看學生成績統計',
            url: '/gradebook',
            icons: [{ src: '/pwa-192x192.png', sizes: '192x192' }]
          }
        ],
        share_target: {
          action: '/assignment-import',
          method: 'POST',
          enctype: 'multipart/form-data',
          params: {
            title: 'title',
            text: 'text',
            url: 'url',
            files: [
              {
                name: 'files',
                accept: ['image/*', 'application/pdf']
              }
            ]
          }
        }
      },

      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        globIgnores: ['**/intro-video.mp4'],
        maximumFileSizeToCacheInBytes: 2 * 1024 * 1024,

        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/rest\/v1\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-api-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60
              },
              cacheableResponse: {
                statuses: [0, 200]
              },
              networkTimeoutSeconds: 10
            }
          },
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/storage\/v1\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'supabase-storage-cache',
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 7 * 24 * 60 * 60
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 365 * 24 * 60 * 60
              }
            }
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'gstatic-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 365 * 24 * 60 * 60
              }
            }
          },
          {
            urlPattern: /^https:\/\/.*\/api\/proxy$/i,
            handler: 'NetworkOnly'
          }
        ],

        navigateFallback: null,
        skipWaiting: true,
        clientsClaim: true
      },

      devOptions: {
        enabled: true,
        type: 'module',
        navigateFallback: 'index.html'
      }
    })
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
