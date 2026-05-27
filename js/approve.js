function getFunctionsBaseUrl() {
  const base = window.SUPABASE_URL?.replace(/\/$/, "");
  if (!base) throw new Error("Supabase is not configured.");
  return `${base}/functions/v1`;
}

async function processApprovalToken(token) {
  const url = `${getFunctionsBaseUrl()}/process-approval-link?token=${encodeURIComponent(token)}`;
  const headers = { Accept: "application/json" };
  if (window.SUPABASE_ANON_KEY) {
    headers.Authorization = `Bearer ${window.SUPABASE_ANON_KEY}`;
    headers.apikey = window.SUPABASE_ANON_KEY;
  }

  const res = await fetch(url, { method: "GET", headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok && !data.error) {
    throw new Error("Could not reach the approval service.");
  }
  return data;
}

document.addEventListener("DOMContentLoaded", async () => {
  const title = document.getElementById("approve-title");
  const body = document.getElementById("approve-body");
  const detail = document.getElementById("approve-detail");
  const actions = document.getElementById("approve-actions");

  const token = new URLSearchParams(window.location.search).get("token");
  if (!token) {
    title.textContent = "Invalid link";
    body.textContent = "This approval link is missing a token. Use the link from your email or open Admin → Users.";
    actions.hidden = false;
    return;
  }

  try {
    const result = await processApprovalToken(token);

    if (result.ok) {
      title.textContent = result.action === "reject" ? "Access rejected" : "Access approved";
      body.textContent = result.message || "The user can now log in if approved.";
      if (result.email) {
        detail.hidden = false;
        detail.textContent = result.email;
      }
    } else {
      title.textContent = "Could not complete";
      body.textContent = result.error || "This link may be expired or already used.";
      if (result.email) {
        detail.hidden = false;
        detail.textContent = result.email;
      }
    }
  } catch (err) {
    title.textContent = "Something went wrong";
    body.textContent = err.message;
  }

  actions.hidden = false;
});
