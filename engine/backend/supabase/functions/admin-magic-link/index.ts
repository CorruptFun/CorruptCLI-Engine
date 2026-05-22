import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const debugLogs = [];

  try {
    const { email } = await req.json();
    if (!email) throw new Error("Email required");

    const cleanEmail = email.toLowerCase().trim();
    debugLogs.push(`Processing for: [${cleanEmail}]`);

    // Only allow specific admin emails
    // TODO: Configure these for your deployment
    const allowed = ['{{ADMIN_EMAIL}}', '{{DEV_EMAIL}}'];
    if (!allowed.includes(cleanEmail)) {
        debugLogs.push(`Access Denied: ${cleanEmail} not in whitelist.`);
        return new Response(JSON.stringify({ error: "Unauthorized email address.", debug: debugLogs }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 400,
        });
    }

    const supabaseAdmin = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // Check if user exists first
    const { data: userSearch, error: searchError } = await supabaseAdmin.auth.admin.listUsers();
    if (searchError) {
        debugLogs.push(`Supabase listUsers Error: ${searchError.message}`);
        throw new Error(`Auth Admin Error: ${searchError.message}`);
    }
    
    const userExists = userSearch?.users.find(u => u.email === cleanEmail);
    debugLogs.push(`User exists in auth.users: ${!!userExists}`);

    if (!userExists) {
        debugLogs.push(`Creating user in auth.users...`);
        const { error: createError } = await supabaseAdmin.auth.admin.createUser({
            email: cleanEmail,
            email_confirm: true,
            user_metadata: { role: 'admin' }
        });
        if (createError) {
            debugLogs.push(`User creation error: ${createError.message}`);
            throw new Error(`Failed to create admin user: ${createError.message}`);
        }
    }

    // Generate the magic link using the admin API
    const { data, error } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email: cleanEmail,
      options: {
          redirectTo: 'https://www.{{CLIENT_DOMAIN}}/admin'
      }
    });

    if (error) {
        debugLogs.push(`Magic link generation error: ${error.message}`);
        throw new Error(`Magic Link Generation Failed: ${error.message}`);
    }

    const magicLink = data.properties.action_link;
    debugLogs.push(`Magic link generated successfully.`);

    // Send the email via Resend
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "{{CLIENT_NAME}} Admin <bookings@updates.{{CLIENT_DOMAIN}}>",
        to: [cleanEmail],
        subject: "Your {{CLIENT_NAME}} Admin Magic Link 🔐",
        html: `
        <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 40px; border: 1px solid #eee; border-radius: 20px; text-align: center;">
            <h1 style="color: #D4AF37; font-size: 24px;">Admin Access Link</h1>
            <p style="color: #666; font-size: 16px; margin-bottom: 30px;">Click the button below to log into the {{CLIENT_NAME}} Admin Dashboard. This link will expire in 1 hour.</p>
            <a href="${magicLink}" style="background-color: #D4AF37; color: #000; padding: 16px 32px; border-radius: 50px; text-decoration: none; font-weight: bold; display: inline-block; text-transform: uppercase; letter-spacing: 1px;">Log In Now</a>
            <p style="margin-top: 40px; color: #999; font-size: 12px;">If you didn't request this link, you can safely ignore this email.</p>
        </div>`
      }),
    });

    const resBody = await res.text();
    debugLogs.push(`Resend Response Status: ${res.status}`);
    debugLogs.push(`Resend Body: ${resBody}`);

    if (!res.ok) {
        throw new Error(`Resend Error: ${resBody}`);
    }

    return new Response(JSON.stringify({ success: true, debug: debugLogs }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message, debug: debugLogs }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
