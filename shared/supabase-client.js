const { createClient } = window.supabase;

const SUPABASE_URL = "https://diksadcyyvxatovwhyei.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_LjK5bP952ZRjuPh3Sp_x7Q_j83o_ZCQ";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});
