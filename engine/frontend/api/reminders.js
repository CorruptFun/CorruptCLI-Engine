export default async function handler(req, res) {
    try {
        const response = await fetch("YOUR_SUPABASE_URL/functions/v1/send-reminders", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'YOUR_SUPABASE_ANON_KEY'}`,
                "Content-Type": "application/json"
            }
        });
        const data = await response.json();
        res.status(200).json({ success: true, edgeResponse: data });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
}
