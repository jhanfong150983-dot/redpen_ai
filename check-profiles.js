import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'

// 讀取 .env.local
const envContent = readFileSync('.env.local', 'utf-8')
const envVars = {}
envContent.split('\n').forEach(line => {
  const [key, ...values] = line.split('=')
  if (key && values.length) {
    envVars[key.trim()] = values.join('=').trim()
  }
})

const supabase = createClient(
  envVars.SUPABASE_URL,
  envVars.SUPABASE_SERVICE_ROLE_KEY
)

async function checkProfiles() {
  console.log('🔍 檢查 Supabase 連線...')
  console.log('URL:', envVars.SUPABASE_URL)
  console.log('Service Key 長度:', envVars.SUPABASE_SERVICE_ROLE_KEY?.length || 0)
  console.log('')

  // 查詢所有 profiles
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, name, role, ink_balance')
    .limit(10)

  if (error) {
    console.log('❌ 查詢錯誤:', error)
    return
  }

  console.log('✅ 找到', data.length, '個 profiles:')
  data.forEach(p => {
    console.log(`  - ${p.email || 'no-email'} | ink_balance: ${p.ink_balance}`)
  })
  console.log('')

  // 檢查特定用戶
  const users = [
    { id: '8da06727-c25a-4dc8-a5dd-4a4d8cd36947', email: 'smart704@tmail.hc.edu.tw' },
    { id: 'a0a64c04-0ca8-4c8d-a085-24184bf19c7d', email: 'jhanfong150983@gmail.com' }
  ]

  for (const user of users) {
    const { data: profile, error: err } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle()

    console.log(`用戶: ${user.email}`)
    if (err) {
      console.log(`  ❌ 錯誤: ${err.message}`)
    } else if (profile) {
      console.log(`  ✅ 找到 profile`)
      console.log(`     - name: ${profile.name}`)
      console.log(`     - role: ${profile.role}`)
      console.log(`     - ink_balance: ${profile.ink_balance}`)
    } else {
      console.log(`  ❌ Profile 不存在於資料庫中`)
    }
    console.log('')
  }
}

checkProfiles().then(() => process.exit(0)).catch(err => {
  console.error('執行錯誤:', err)
  process.exit(1)
})
