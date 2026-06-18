import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

async function run() {
  const { data: policies, error } = await supabaseAdmin
    .rpc('get_pg_policies'); // Supabase RPC might not exist, but let's try raw query if we can

  if (error) {
     console.log("No RPC get_pg_policies", error.message);
  } else {
     console.log("Policies:", policies);
  }
}

run();
