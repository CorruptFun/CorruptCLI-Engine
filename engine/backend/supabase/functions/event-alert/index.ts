// event-alert Edge Function
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

serve(async (req) => {
  const { event_id, status } = await req.json()
  console.log(`Alert for event ${event_id}: ${status}`)
  
  return new Response(
    JSON.stringify({ message: "Alert received" }),
    { headers: { "Content-Type": "application/json" } },
  )
})
