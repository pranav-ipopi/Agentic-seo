import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

async function test() {
  console.log('Signing up dummy user...')
  const email = 'dummy' + Date.now() + '@example.com'
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password: 'password123',
  })
  
  if (authError) {
    console.error('Signup error:', authError.message)
    return
  }
  
  console.log('User signed up. ID:', authData.user?.id)
  
  const { data, error } = await supabase.from('clients').select('*')
  console.log('Clients Data:', data)
  console.log('Clients Error:', error)
}

test()
