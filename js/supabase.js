import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://doaokmhdfwdwtkwxxksx.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_r_oYKrDrzU-BGgNIerSu9w_DSLnSTLJ";

export const supabaseClient = createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);
