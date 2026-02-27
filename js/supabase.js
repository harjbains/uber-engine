const SUPABASE_URL = "https://doaokmhdfwdwtkwxxksx.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_r_oYKrDrzU-BGgNIerSu9w_DSLnSTLJ";

const { createClient } = window.supabase;

const supabaseClient = createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);
