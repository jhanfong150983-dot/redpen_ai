import { getAuthUser } from '../../server/_auth.js'
import { getSupabaseAdmin } from '../../server/_supabase.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method Not Allowed' })
    return
  }

  try {
    const { user } = await getAuthUser(req, res)
    if (!user) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    let profile = null
    let profileLoaded = false
    let profileError = null

    try {
      // 後端始終使用 service role key 繞過 RLS
      const supabaseDb = getSupabaseAdmin()

      console.log('🔍 Querying profile for user:', user.id)

      const { data, error } = await supabaseDb
        .from('profiles')
        .select('name, avatar_url, role, permission_tier, ink_balance')
        .eq('id', user.id)
        .maybeSingle()

      if (error) {
        console.error('❌ Profile query failed:', {
          userId: user.id,
          error: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint
        })
        profileError = error.message
      } else if (data) {
        console.log('✅ Profile loaded:', {
          userId: user.id,
          hasName: !!data.name,
          hasRole: !!data.role,
          inkBalance: data.ink_balance
        })
        profile = data
        profileLoaded = true
      } else {
        console.warn('⚠️ Profile not found in database for user:', user.id)
        profileError = 'Profile not found'
      }
    } catch (error) {
      console.error('❌ Profile query exception:', {
        userId: user.id,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      })
      profileError = error instanceof Error ? error.message : 'Unknown error'
      profile = null
      profileLoaded = false
    }

    res.status(200).json({
      user: {
        id: user.id,
        email: user.email,
        name: profile?.name || user.user_metadata?.full_name || user.user_metadata?.name || '',
        avatarUrl: profile?.avatar_url || user.user_metadata?.avatar_url || '',
        role: profile?.role || 'user',
        permissionTier: profile?.permission_tier || 'basic',
        inkBalance:
          profileLoaded && typeof profile?.ink_balance === 'number'
            ? profile.ink_balance
            : null
      },
      // 除錯資訊：讓前端知道是否從資料庫載入成功
      _debug: {
        profileLoaded,
        profileError,
        dataSource: profileLoaded ? 'database' : 'oauth_metadata'
      }
    })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Server error' })
  }
}
