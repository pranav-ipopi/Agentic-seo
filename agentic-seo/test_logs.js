
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function test() {
  const { data, error } = await supabase.from('task_run_logs').select('*').limit(5);
  console.log('Logs data:', data);
  console.log('Logs error:', error);
  
  if (error) {
     console.log('Trying to query columns of task_run_logs...');
     // if table missing or policy issues...
  }
}
test();
