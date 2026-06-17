function escapeHtml(text) {
  const el = document.createElement("span");
  el.textContent = text;
  return el.innerHTML;
}

document.addEventListener("DOMContentLoaded", async () => {
  const profile = await requireAuth({ allowPending: true });
  if (!profile) return;

  document.getElementById("logout-btn")?.addEventListener("click", () => signOut());

  const rejected = new URLSearchParams(window.location.search).get("rejected") === "1";
  const title = document.getElementById("pending-title");
  const body = document.getElementById("pending-body");
  const detail = document.getElementById("pending-detail");
  const icon = document.getElementById("pending-icon");

  if (profile.status === "approved") {
    window.location.href = getHomeUrl(profile);
    return;
  }

  if (rejected || profile.status === "rejected") {
    icon.textContent = "✕";
    title.textContent = "Access not approved";
    body.textContent =
      "Your access request was not approved. Visit the Tech Inspection admin desk if you believe this is an error.";
    detail.textContent = `Signed in as ${profile.fullName || profile.email}`;
    return;
  }

  detail.textContent = `${profile.fullName || profile.email} · Requested: ${getRoleLabel(profile.requestedRole)}`;

  if (profile.requestedRole === "team_member" && profile.requestedTeamId) {
    detail.textContent += " · Team assignment pending approval";
  }
});
