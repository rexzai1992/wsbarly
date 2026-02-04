
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://hafkwvdcmfenbbzvufkv.supabase.co'
const SUPABASE_KEY = 'sb_publishable_McTQKF73jZv_ekbxLFw2IQ_LG8YuZ0o'

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
