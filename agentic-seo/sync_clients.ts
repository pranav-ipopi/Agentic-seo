import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

async function run() {
  const { data: users, error: uErr } = await supabaseAdmin.from('profiles').select('id');
  if (uErr || !users) return console.error('Failed to load users');

  const { data: clients, error: cErr } = await supabaseAdmin.from('clients').select('id');
  if (cErr || !clients) return console.error('Failed to load clients');

  const { data: existingMembers, error: mErr } = await supabaseAdmin.from('client_members').select('client_id, user_id');
  
  const existingSet = new Set(existingMembers?.map(m => `${m.client_id}-${m.user_id}`) || []);
  
  const inserts: {client_id: string, user_id: string}[] = [];
  
  for (const c of clients) {
    for (const u of users) {
      if (!existingSet.has(`${c.id}-${u.id}`)) {
        inserts.push({ client_id: c.id, user_id: u.id });
      }
    }
  }
  
  if (inserts.length > 0) {
    console.log(`Inserting ${inserts.length} new client_members...`);
    const { error } = await supabaseAdmin.from('client_members').insert(inserts);
    if (error) console.error('Error inserting:', error.message);
    else console.log('Successfully synced all users to all clients.');
  } else {
    console.log('All users are already synced to all clients.');
  }
}

run();
