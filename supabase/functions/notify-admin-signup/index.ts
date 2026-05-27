import { Resend } from "https://esm.sh/resend@4.1.2";
import {
  approvalLink,
  corsHeaders,
  getServiceClient,
} from "../_shared/approval-utils.ts";

type ProfileRecord = {
  id: string;
  email: string;
  full_name: string;
  status: string;
  requested_role: string;
  requested_team_id: string | null;
  created_at: string;
};

function verifyWebhook(req: Request) {
  const secret = Deno.env.get("APPROVAL_WEBHOOK_SECRET");
  if (!secret) return true;
  return req.headers.get("x-webhook-secret") === secret;
}

function roleLabel(role: string) {
  if (role === "team_member") return "Team member";
  return "Inspector";
}

function buildEmailHtml(opts: {
  name: string;
  email: string;
  requestedRole: string;
  teamLabel: string | null;
  approveInspectorUrl: string;
  approveTeamUrl: string;
  rejectUrl: string;
}) {
  const teamLine = opts.teamLabel
    ? `<p><strong>Requested team:</strong> ${opts.teamLabel}</p>`
    : opts.requestedRole === "team_member"
      ? `<p><strong>Requested team:</strong> <em>Not selected — use Admin to assign if approving as team member</em></p>`
      : "";

  return `<!DOCTYPE html>
<html>
<body style="font-family:Inter,Segoe UI,sans-serif;line-height:1.5;color:#111;max-width:560px">
  <h2 style="margin:0 0 12px">New signup — approval needed</h2>
  <p><strong>${opts.name || opts.email}</strong> (${opts.email}) signed up for FSAE Tech Inspection.</p>
  <p><strong>Requested role:</strong> ${roleLabel(opts.requestedRole)}</p>
  ${teamLine}
  <p style="margin:24px 0 12px">Choose an action (links expire in 72 hours):</p>
  <p style="margin:0 0 10px">
    <a href="${opts.approveInspectorUrl}" style="display:inline-block;background:#059669;color:#fff;text-decoration:none;padding:10px 16px;border-radius:999px;font-weight:600">Approve as inspector</a>
  </p>
  <p style="margin:0 0 10px">
    <a href="${opts.approveTeamUrl}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:10px 16px;border-radius:999px;font-weight:600">Approve as team member</a>
  </p>
  <p style="margin:0 0 16px">
    <a href="${opts.rejectUrl}" style="display:inline-block;background:#e11d48;color:#fff;text-decoration:none;padding:10px 16px;border-radius:999px;font-weight:600">Reject</a>
  </p>
  <p style="font-size:13px;color:#64748b">You can also approve in the app: Admin → Users. Links are one-time use.</p>
</body>
</html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!verifyWebhook(req)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const record = (body.record ?? body.data?.record ?? body) as ProfileRecord;

    if (!record?.id || record.status !== "pending") {
      return new Response(JSON.stringify({ ok: true, skipped: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminEmail = Deno.env.get("ADMIN_EMAIL") || "mbpetty@gmail.com";
    const resendKey = Deno.env.get("RESEND_API_KEY");
    const fromEmail = Deno.env.get("RESEND_FROM_EMAIL") || "FSAETechForm <noreply@fsaetechform.com>";

    if (!resendKey) {
      throw new Error("Missing RESEND_API_KEY");
    }

    const supabase = getServiceClient();

    const { data: tokens, error: tokenError } = await supabase.rpc(
      "create_approval_email_tokens",
      { p_profile_id: record.id },
    );

    if (tokenError) throw tokenError;

    let teamLabel: string | null = null;
    if (record.requested_team_id) {
      const { data: team } = await supabase
        .from("teams")
        .select("car_number, team_name")
        .eq("id", record.requested_team_id)
        .maybeSingle();
      if (team) teamLabel = `#${team.car_number} ${team.team_name}`;
    }

    const html = buildEmailHtml({
      name: record.full_name,
      email: record.email,
      requestedRole: record.requested_role,
      teamLabel,
      approveInspectorUrl: approvalLink(tokens.approve_inspector),
      approveTeamUrl: approvalLink(tokens.approve_team_member),
      rejectUrl: approvalLink(tokens.reject),
    });

    const resend = new Resend(resendKey);
    const { error: sendError } = await resend.emails.send({
      from: fromEmail,
      to: [adminEmail],
      subject: `Approve signup: ${record.full_name || record.email}`,
      html,
    });

    if (sendError) throw sendError;

    return new Response(JSON.stringify({ ok: true, sent_to: adminEmail }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("notify-admin-signup", err);
    return new Response(
      JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
