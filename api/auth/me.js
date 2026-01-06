import { getAuthUser } from '../../server/_auth.js'
import {
  getSupabaseAdmin,
  getSupabaseUserClient,
  isServiceRoleKey
} from '../../server/_supabase.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method Not Allowed' })
    return
  }

  try {
    const { user, accessToken } = await getAuthUser(req, res)
    if (!user) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    let profile = null
    let profileLoaded = false
    try {
      const useAdmin = isServiceRoleKey()
      const supabaseDb = useAdmin
        ? getSupabaseAdmin()
        : accessToken
          ? getSupabaseUserClient(accessToken)
          : null

      console.log('🔍 Auth check:', {
        userId: user.id,
        useAdmin,
        hasAccessToken: !!accessToken,
        accessTokenLength: accessToken?.length || 0
      })

      if (supabaseDb) {
        const { data, error } = await supabaseDb
          .from('profiles')
          .select('name, avatar_url, role, permission_tier, ink_balance')
          .eq('id', user.id)
          .maybeSingle()

        if (error) {
          console.error('❌ Profile query failed:', {
            error: error.message,
            code: error.code,
            hint: error.hint,
            details: error.details,
            userId: user.id,
            useAdmin,
            hasAccessToken: !!accessToken
          })
        } else {
          console.log('✅ Profile query success')
        }

        profile = data || null
        profileLoaded = !!data

        // Debug: 記錄 profile 資料
        console.log('🔍 Profile data:', {
          userId: user.id,
          profileLoaded,
          hasData: !!data,
          hasError: !!error,
          profile,
          ink_balance: profile?.ink_balance,
          ink_balance_type: typeof profile?.ink_balance
        })
      } else {
        console.warn('⚠️ No Supabase client available', {
          useAdmin,
          hasAccessToken: !!accessToken,
          userId: user.id
        })
      }
    } catch (error) {
      console.error('❌ Profile query exception:', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        userId: user.id
      })
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
      }
    })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Server error' })
  }
}
