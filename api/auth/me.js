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
      if (supabaseDb) {
        const { data } = await supabaseDb
          .from('profiles')
          .select('name, avatar_url, role, permission_tier, ink_balance')
          .eq('id', user.id)
          .maybeSingle()
        profile = data || null
        profileLoaded = true
      }
    } catch {
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
