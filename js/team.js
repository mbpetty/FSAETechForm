function escapeHtml(text) {
  const el = document.createElement("span");
  el.textContent = text;
  return el.innerHTML;
}

function statusLabel(status) {
  if (status === "pass") return "Pass";
  if (status === "fail") return "Fail";
  return "Not inspected";
}

function statusClass(status) {
  if (status === "pass") return "team-status-pill--pass";
  if (status === "fail") return "team-status-pill--fail";
  return "team-status-pill--pending";
}

async function renderTeamView(profile) {
  const team = getTeams().find((t) => t.id === profile.teamId);
  if (!team) {
    document.getElementById("team-load-status").textContent =
      "Your team assignment is missing. Contact an admin.";
    return;
  }

  const banner = document.getElementById("team-readonly-banner");
  banner.hidden = false;
  banner.textContent = `#${team.carNumber} ${team.teamName} · ${getCompetitionLabel(team.competition)} — read-only view`;

  const items = getInspectionsForCompetition(team.competition);
  const results = await fetchTeamResults(team.id);
  const resultMap = new Map(results.map((r) => [r.item_key, r]));

  const list = document.getElementById("team-inspection-list");
  const loadStatus = document.getElementById("team-load-status");
  const empty = document.getElementById("team-empty-state");

  if (!items.length) {
    loadStatus.hidden = true;
    empty.hidden = false;
    return;
  }

  let pass = 0;
  let fail = 0;

  list.innerHTML = items
    .map((item) => {
      const result = resultMap.get(item.key);
      const status = result?.status ?? "pending";
      if (status === "pass") pass += 1;
      if (status === "fail") fail += 1;
      const comment =
        status === "fail" && result?.comment
          ? `<p class="team-item-comment">${escapeHtml(result.comment)}</p>`
          : status === "pass" && result?.comment
            ? `<p class="team-item-comment">${escapeHtml(result.comment)}</p>`
            : "";
      const attribution = formatAttribution(result?.updated_by_name, result?.updated_at);
      const attributionHtml = attribution
        ? `<p class="team-item-meta">${escapeHtml(attribution)}</p>`
        : "";

      return `
    <li class="inspection-item" data-status="${status}">
      <div class="item-head">
        <span class="item-id">${escapeHtml(item.itemId)}</span>
        <h3 class="item-title">${escapeHtml(item.title)}</h3>
        <span class="team-status-pill ${statusClass(status)}">${statusLabel(status)}</span>
      </div>
      <details class="item-description" open>
        <summary class="description-toggle">Hide description</summary>
        <p>${escapeHtml(item.description)}</p>
      </details>
      ${comment}
      ${attributionHtml}
    </li>
  `;
    })
    .join("");

  list.querySelectorAll(".item-description").forEach((details) => {
    const toggle = details.querySelector(".description-toggle");
    details.addEventListener("toggle", () => {
      toggle.textContent = details.open ? "Hide description" : "Show description";
    });
  });

  const pending = items.length - pass - fail;
  document.getElementById("team-list-count").textContent =
    `${pass} pass · ${fail} fail · ${pending} open`;

  loadStatus.hidden = true;
  list.hidden = false;
}

document.addEventListener("DOMContentLoaded", async () => {
  const profile = await requireAuth({ roles: ["team_member"] });
  if (!profile) return;

  renderAuthHeader(profile, "team");

  if (profile.role === "team_member" && !profile.teamId) {
    document.getElementById("team-load-status").textContent =
      "No team assigned to your account. Contact an admin.";
    return;
  }

  try {
    await detectDbSchema();
    await loadCompetitions();
    await loadInspections();
    await loadTeams();
    await loadCompetitionAssignments();
    await renderTeamView(profile);
  } catch (err) {
    document.getElementById("team-load-status").textContent = err.message;
    document.getElementById("team-load-status").classList.add("is-error");
  }
});
