export default async function handler(req, res) {
    // Only allow GET or POST
    if (req.method !== 'GET' && req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // We use the anon key or a dedicated cron secret to call the Supabase Edge Function
        // The edge function itself has the service role key to do the secure database queries
        const response = await fetch("YOUR_SUPABASE_URL/functions/v1/billing-reminders", {
            method: "POST",
            headers: {
                // Ensure this anon key or an authorization header is passed
                "Authorization": `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'YOUR_SUPABASE_ANON_KEY'}`,
                "Content-Type": "application/json"
            }
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Edge function returned ${response.status}: ${errorText}`);
        }

        const data = await response.json();
        res.status(200).json({ success: true, edgeResponse: data });
    } catch(err) {
        console.error("Billing Reminders Cron Error:", err);
        res.status(500).json({ error: err.message });
    }
}
