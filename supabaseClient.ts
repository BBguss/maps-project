import { createClient } from '@supabase/supabase-js';

// Configuration provided by user
const SUPABASE_URL = 'https://rmbqmcgmywqjobseklsi.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_oaL4EeN-KaGJWa-77ZhT8Q_llcp0-V0';

export const isSupabaseConfigured = true;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);