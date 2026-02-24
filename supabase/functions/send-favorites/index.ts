import { createClient } from "npm:@supabase/supabase-js@2";
import { Resend } from "npm:resend";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY")!;
    const senderEmail = "onboarding@resend.dev";

    const sb = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await sb.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: favorites, error: favError } = await sb
      .from("favorites")
      .select("phrase, sample, category")
      .eq("user_id", user.id);

    if (favError) {
      return new Response(JSON.stringify({ error: "Failed to fetch favorites" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!favorites || favorites.length === 0) {
      return new Response(JSON.stringify({ error: "No favorites to send" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const grouped: Record<string, typeof favorites> = {};
    for (const fav of favorites) {
      const cat = fav.category ?? "Other";
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(fav);
    }

    const htmlRows = Object.entries(grouped).map(([cat, items]) => {
      const rows = items.map(
        (f) => `
          <tr>
            <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${f.phrase}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#6b7280;font-style:italic;">${f.sample ?? ""}</td>
          </tr>`
      ).join("");
      return `
        <h3 style="margin:24px 0 8px;color:#4f46e5;">${cat}</h3>
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <thead>
            <tr style="background:#f3f4f6;">
              <th style="padding:8px 12px;text-align:left;color:#374151;">Phrase</th>
              <th style="padding:8px 12px;text-align:left;color:#374151;">Example</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>`;
    }).join("");

    const html = `
      <div style="font-family:sans-serif;max-width:700px;margin:auto;padding:32px;">
        <h1 style="color:#1f2937;">Your Saved Academic Phrases</h1>
        <p style="color:#6b7280;">Here are the ${favorites.length} phrases you saved in Academic Phrases.</p>
        ${htmlRows}
        <p style="margin-top:32px;color:#9ca3af;font-size:12px;">Sent from Academic Phrases app</p>
      </div>`;

    const resend = new Resend(resendApiKey);
    const { error: emailError } = await resend.emails.send({
      from: senderEmail,
      to: user.email!,
      subject: `Your ${favorites.length} saved academic phrases`,
      html,
    });

    if (emailError) {
      return new Response(JSON.stringify({ error: "Failed to send email", detail: JSON.stringify(emailError) }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
