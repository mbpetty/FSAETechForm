let teamItems = [];
let teamResultMap = new Map();

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

function getTeamItemResult(key) {
  return teamResultMap.get(key)?.status ?? "pending";
}

function initTeamStationFilter(competitionId) {
  const select = document.getElementById("team-filter-station");
  if (!select) return;

  select.innerHTML =
    '<option value="all">All stations</option>' +
    getStations(competitionId)
      .map((s) => `<option value="${escapeHtml(s.id)}">${escapeHtml(s.name)}</option>`)
      .join("");
}

function matchesTeamFilters(item) {
  const station = document.getElementById("team-filter-station")?.value ?? "all";
  const status = document.getElementById("team-filter-status")?.value ?? "all";

  if (station !== "all" && !item.stationIds.includes(station)) return false;
  if (status !== "all" && getTeamItemResult(item.key) !== status) return false;

  return true;
}

function applyTeamFilters() {
  let visible = 0;
  let pass = 0;
  let fail = 0;

  document.querySelectorAll("#team-inspection-list .inspection-item").forEach((card) => {
    const item = teamItems.find((i) => i.key === card.dataset.key);
    const show = item && matchesTeamFilters(item);
    card.hidden = !show;

    if (show && item) {
      visible += 1;
      const status = getTeamItemResult(item.key);
      if (status === "pass") pass += 1;
      if (status === "fail") fail += 1;
    }
  });

  const total = teamItems.length;
  const pending = visible - pass - fail;
  const countEl = document.getElementById("team-list-count");

  if (countEl) {
    countEl.textContent =
      visible === total
        ? `${pass} pass · ${fail} fail · ${pending} open`
        : `${visible} of ${total} · ${pass} pass · ${fail} fail · ${pending} open`;
  }

  const empty = document.getElementById("team-empty-state");
  const list = document.getElementById("team-inspection-list");

  if (empty) {
    empty.hidden = visible > 0;
    empty.textContent =
      total === 0 ? "No inspections assigned yet." : "No inspections match these filters.";
  }

  if (list) list.hidden = total === 0 || visible === 0;
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

  teamItems = getInspectionsForCompetition(team.competition);
  const results = await fetchTeamResults(team.id);
  teamResultMap = new Map(results.map((r) => [r.item_key, r]));

  const list = document.getElementById("team-inspection-list");
  const loadStatus = document.getElementById("team-load-status");
  const empty = document.getElementById("team-empty-state");
  const filters = document.getElementById("team-filters");

  if (!teamItems.length) {
    loadStatus.hidden = true;
    if (filters) filters.hidden = true;
    if (empty) {
      empty.hidden = false;
      empty.textContent = "No inspections assigned yet.";
    }
    if (list) list.hidden = true;
    return;
  }

  if (filters) filters.hidden = false;
  initTeamStationFilter(team.competition);

  list.innerHTML = teamItems
    .map((item) => {
      const result = teamResultMap.get(item.key);
      const status = result?.status ?? "pending";
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
    <li class="inspection-item" data-key="${escapeHtml(item.key)}" data-status="${status}">
      <div class="item-head">
        <span class="item-id">${escapeHtml(item.itemId)}</span>
        <h3 class="item-title">${escapeHtml(item.title)}</h3>
        <span class="team-status-pill ${statusClass(status)}">${statusLabel(status)}</span>
      </div>
      <details class="item-description" open>
        <summary class="description-toggle">Hide description</summary>
        <div class="rich-content item-description-body"></div>
      </details>
      ${comment}
      ${attributionHtml}
    </li>
  `;
    })
    .join("");

  list.querySelectorAll(".inspection-item").forEach((card, index) => {
    const item = teamItems[index];
    if (!item) return;
    const body = card.querySelector(".item-description-body");
    if (body) mountDescriptionContent(body, item.description);
  });

  list.querySelectorAll(".item-description").forEach((details) => {
    const toggle = details.querySelector(".description-toggle");
    details.addEventListener("toggle", () => {
      toggle.textContent = details.open ? "Hide description" : "Show description";
    });
  });

  loadStatus.hidden = true;
  applyTeamFilters();
}

document.addEventListener("DOMContentLoaded", async () => {
  const profile = await requireAuth({ roles: ["team_member"] });
  if (!profile) return;

  renderAuthHeader(profile, "team");

  document.getElementById("team-filter-station")?.addEventListener("change", applyTeamFilters);
  document.getElementById("team-filter-status")?.addEventListener("change", applyTeamFilters);

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
