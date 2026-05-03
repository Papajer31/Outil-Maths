const { createClient } = window.supabase;

const SUPABASE_URL = "https://uxmcwiyfhtvyekllpuze.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_9uJrGqzpAz7vNbxK9fI3PA_8CE9yuRG";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});
