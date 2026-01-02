// 測試 SUPABASE_SERVICE_ROLE_KEY 是否正確
import { readFileSync } from 'fs'

// 手動讀取 .env.local
const envContent = readFileSync('.env.local', 'utf-8')
const envVars = {}
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)="?([^"]*)"?$/)
  if (match && !match[1].startsWith('#')) {
    envVars[match[1]] = match[2]
  }
})

// 設定環境變數
process.env.SUPABASE_SERVICE_ROLE_KEY = envVars.SUPABASE_SERVICE_ROLE_KEY

function decodeJwtPayload(token) {
  if (!token) return null
  const parts = token.split('.')
  if (parts.length < 2) return null
  const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized + '==='.slice((normalized.length + 3) % 4)
  try {
    const json = Buffer.from(padded, 'base64').toString('utf8')
    return JSON.parse(json)
  } catch {
    return null
  }
}

const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
console.log('環境變數存在:', !!serviceRoleKey)
console.log('Key 長度:', serviceRoleKey?.length)

const payload = decodeJwtPayload(serviceRoleKey)
console.log('JWT Payload:', payload)
console.log('是否為 service_role:', payload?.role === 'service_role')

if (payload?.role !== 'service_role') {
  console.error('❌ 錯誤: SUPABASE_SERVICE_ROLE_KEY 不是 service_role key!')
  console.error('   請確認您使用的是 service_role key,而不是 anon key')
} else {
  console.log('✅ service_role key 設定正確')
}
