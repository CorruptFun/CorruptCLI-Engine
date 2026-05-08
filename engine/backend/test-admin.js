const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const env = fs.readFileSync('/Users/lucid/.openclaw/workspace/app/.env.local', 'utf8');
const SUPABASE_URL = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const SUPABASE_SERVICE_KEY = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/);

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY ? SUPABASE_SERVICE_KEY[1].trim() : '');

async function test() {
    const { data, error } = await supabase.from('bookings').select('id');
    console.log(JSON.stringify({ data, error }, null, 2));
}
test();
