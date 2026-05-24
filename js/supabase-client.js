let supabaseClient = null;

function assertSupabaseConfig() {
  if (!window.SUPABASE_URL || !window.SUPABASE_ANON_KEY) {
    throw new Error(
      "Supabase is not configured. Copy js/supabase-config.example.js to js/supabase-config.js and add your Project URL and anon key."
    );
  }
  if (window.SUPABASE_URL.includes("YOUR_PROJECT")) {
    throw new Error("Replace the placeholder values in js/supabase-config.js with your Supabase keys.");
  }
}

function getSupabase() {
  assertSupabaseConfig();
  if (!supabaseClient) {
    supabaseClient = window.supabase.createClient(
      window.SUPABASE_URL,
      window.SUPABASE_ANON_KEY
    );
  }
  return supabaseClient;
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value)
  );
}

function throwIfError(error, context) {
  if (error) {
    console.error(context, error);
    throw new Error(error.message || `Database error: ${context}`);
  }
}
