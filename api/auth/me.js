import { getAuthUser } from '../_auth.js'
import {
  getSupabaseAdmin,
  getSupabaseUserClient,
  isServiceRoleKey
} from '../_supabase.js'

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
          .select('name, avatar_url')
          .eq('id', user.id)
          .maybeSingle()
        profile = data || null
      }
    } catch {
      profile = null
    }

    res.status(200).json({
      user: {
        id: user.id,
        email: user.email,
        name: profile?.name || user.user_metadata?.full_name || user.user_metadata?.name || '',
        avatarUrl: profile?.avatar_url || user.user_metadata?.avatar_url || ''
      }
    })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Server error' })
  }
}
