// ================================
// SUPABASE CONNECTION
// ================================

const SUPABASE_URL = "https://doaokmhdfwdwtkwxxksx.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_r_oYKrDrzU-BGgNIerSu9w_DSLnSTLJ";

window.supabaseClient = supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);