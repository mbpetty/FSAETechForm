let resultsByTeam = new Map();
let expandedTeamIds = new Set();

function escapeHtml(text) {
  const el = document.createElement("span");
  el.textContent = text;
  return el.innerHTML;
}

function sortTeams(teams) {
  return sortTeamsByCarNumber(teams);
}

function computeTeamStats(team, requiredItems, resultsMap) {
  const results = resultsMap.get(team.id) ?? new Map();
  let pass = 0;
  let fail = 0;
  const failures = [];

  for (const item of requiredItems) {
    const result = results.get(item.key);
    if (result?.status === "pass") {
      pass += 1;
    } else if (result?.status === "fail") {
      fail += 1;
      failures.push({ item, comment: result.comment ?? "" });
    }
  }

  const total = requiredItems.length;
  const inspected = pass + fail;
  const pending = total - inspected;
  const pct = total ? Math.round((inspected / total) * 100) : 0;

  let statusKey = "not-started";
  let statusLabel = "Not started";

  if (fail > 0) {
    statusKey = "has-failures";
    statusLabel = fail === 1 ? "1 failure" : `${fail} failures`;
  } else if (total > 0 && inspected === total) {
    statusKey = "complete";
    statusLabel = "Complete";
  } else if (inspected > 0) {
    statusKey = "in-progress";
    statusLabel = "In progress";
  }

  return { pass, fail, pending, inspected, total, pct, failures, statusKey, statusLabel };
}

function matchesStatusFilter(stats, filter) {
  if (filter === "all") return true;
  if (filter === "has-failures") return stats.fail > 0;
  if (filter === "not-started") return stats.inspected === 0;
  if (filter === "in-progress") return stats.inspected > 0 && stats.inspected < stats.total;
  if (filter === "complete") return stats.total > 0 && stats.inspected === stats.total;
  return true;
}

function getSelectedCompetitionId() {
  return document.getElementById("dashboard-competition").value;
}

function getStatusFilter() {
  return document.getElementById("dashboard-status").value;
}

function getTeamFilter() {
  return document.getElementById("dashboard-team").value;
}

function initDashboardTeamFilter() {
  const competitionId = getSelectedCompetitionId();
  const select = document.getElementById("dashboard-team");
  const teams = getTeamsForCompetition(competitionId);

  fillTeamSelect(select, teams, { selectedValue: select.value, includeAll: true });
}

function inspectorUrl(competitionId, teamId) {
  const params = new URLSearchParams({ competition: competitionId, team: teamId });
  return `index.html?${params.toString()}`;
}

function renderSummary(teamsWithStats) {
  const el = document.getElementById("dashboard-summary");
  const totalTeams = teamsWithStats.length;
  const complete = teamsWithStats.filter((t) => t.stats.inspected === t.stats.total && t.stats.total > 0).length;
  const withFailures = teamsWithStats.filter((t) => t.stats.fail > 0).length;
  const inProgress = teamsWithStats.filter(
    (t) => t.stats.inspected > 0 && t.stats.inspected < t.stats.total
  ).length;

  el.innerHTML = `
    <div class="summary-stat">
      <span class="summary-stat-value">${totalTeams}</span>
      <span class="summary-stat-label">Teams</span>
    </div>
    <div class="summary-stat summary-stat--pass">
      <span class="summary-stat-value">${complete}</span>
      <span class="summary-stat-label">Complete</span>
    </div>
    <div class="summary-stat">
      <span class="summary-stat-value">${inProgress}</span>
      <span class="summary-stat-label">In progress</span>
    </div>
    <div class="summary-stat summary-stat--fail">
      <span class="summary-stat-value">${withFailures}</span>
      <span class="summary-stat-label">With failures</span>
    </div>
  `;
  el.hidden = false;
}

function renderFailures(failures) {
  if (!failures.length) return "";

  return `
    <div class="team-failures">
      <p class="team-failures-title">Failed items</p>
      ${failures
        .map(
          ({ item, comment }) => `
        <div class="failure-item">
          <span class="failure-item-id">${escapeHtml(item.itemId)}</span>
          <p class="failure-item-title">${escapeHtml(item.title)}</p>
          <p class="failure-item-comment${comment ? "" : " is-empty"}">${
            comment ? escapeHtml(comment) : "No comment provided"
          }</p>
        </div>
      `
        )
        .join("")}
    </div>
  `;
}

function renderTeamList() {
  const competitionId = getSelectedCompetitionId();
  const statusFilter = getStatusFilter();
  const teamFilter = getTeamFilter();
  const requiredItems = getInspectionsForCompetition(competitionId);
  const teams = sortTeams(getTeamsForCompetition(competitionId));

  const teamsWithStats = teams.map((team) => ({
    team,
    stats: computeTeamStats(team, requiredItems, resultsByTeam),
  }));

  const filtered = teamsWithStats.filter(({ team, stats }) => {
    if (teamFilter !== "all" && team.id !== teamFilter) return false;
    return matchesStatusFilter(stats, statusFilter);
  });

  renderSummary(filtered);

  const list = document.getElementById("dashboard-team-list");
  const empty = document.getElementById("dashboard-empty");

  if (!teams.length) {
    list.hidden = true;
    empty.hidden = false;
    empty.textContent = "No teams in this competition yet. Add teams in Admin.";
    return;
  }

  if (!requiredItems.length) {
    list.hidden = true;
    empty.hidden = false;
    empty.textContent = "No inspections assigned to this competition. Assign them in Admin → Competitions.";
    return;
  }

  if (!filtered.length) {
    list.hidden = true;
    empty.hidden = false;
    empty.textContent = "No teams match these filters.";
    return;
  }

  empty.hidden = true;
  list.hidden = false;

  list.innerHTML = filtered
    .map(({ team, stats }) => {
      const expanded = expandedTeamIds.has(team.id);
      const progressClass = stats.fail > 0 ? "has-failures" : stats.inspected === stats.total ? "is-complete" : "";

      return `
    <li class="dashboard-team-card" data-team-id="${escapeHtml(team.id)}">
      <div class="team-card-head">
        <div class="team-card-title-row">
          <div>
            <h3 class="team-card-title">${escapeHtml(formatTeamFilterLabel(team))}</h3>
            <p class="team-card-meta">${stats.pass} passed · ${stats.fail} failed · ${stats.pending} remaining</p>
          </div>
          <span class="team-status-pill team-status-pill--${stats.statusKey}">${escapeHtml(stats.statusLabel)}</span>
        </div>
        <div class="team-progress-row">
          <div class="team-progress-bar" role="progressbar" aria-valuenow="${stats.pct}" aria-valuemin="0" aria-valuemax="100" aria-label="${escapeHtml(team.teamName)} progress">
            <div class="team-progress-fill ${progressClass}" style="width: ${stats.pct}%"></div>
          </div>
          <span class="team-progress-label">${stats.inspected}/${stats.total}</span>
        </div>
        <div class="team-counts">
          <span class="count-pass">${stats.pass} pass</span>
          <span class="count-fail">${stats.fail} fail</span>
          <span>${stats.pending} open</span>
        </div>
      </div>
      <div class="team-card-actions">
        <a class="btn-dashboard btn-dashboard--primary" href="${inspectorUrl(competitionId, team.id)}">Inspect</a>
        <a class="btn-dashboard" href="${exportUrl(team.id, competitionId)}">Export PDF</a>
        ${
          stats.fail > 0
            ? `<button type="button" class="btn-dashboard btn-toggle-failures" data-expanded="${expanded}">${expanded ? "Hide failures" : "Show failures"}</button>`
            : ""
        }
      </div>
      ${expanded && stats.fail > 0 ? renderFailures(stats.failures) : ""}
    </li>
  `;
    })
    .join("");

  list.querySelectorAll(".btn-toggle-failures").forEach((btn) => {
    btn.addEventListener("click", () => {
      const teamId = btn.closest(".dashboard-team-card").dataset.teamId;
      if (expandedTeamIds.has(teamId)) expandedTeamIds.delete(teamId);
      else expandedTeamIds.add(teamId);
      renderTeamList();
    });
  });
}

async function refreshResults() {
  const competitionId = getSelectedCompetitionId();
  const teams = getTeamsForCompetition(competitionId);
  const rows = await fetchResultsForTeamIds(teams.map((t) => t.id));
  resultsByTeam = groupResultsByTeam(rows);
  renderTeamList();
}

async function initCompetitionFilter() {
  const competitions = await loadCompetitions();
  const select = document.getElementById("dashboard-competition");
  select.innerHTML = competitions
    .map((c) => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.label)}</option>`)
    .join("");

  const params = new URLSearchParams(window.location.search);
  const fromUrl = params.get("competition");
  if (fromUrl && competitions.some((c) => c.id === fromUrl)) {
    select.value = fromUrl;
  } else if (competitions.some((c) => c.id === "june-ev")) {
    select.value = "june-ev";
  } else {
    select.value = DEFAULT_COMPETITION;
  }
}

function showToast(message) {
  const el = document.getElementById("dashboard-toast");
  el.textContent = message;
  el.hidden = false;
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => {
    el.hidden = true;
  }, 4000);
}

document.addEventListener("DOMContentLoaded", async () => {
  const profile = await requireAuth({ roles: ["admin", "inspector"] });
  if (!profile) return;

  renderAuthHeader(profile, "dashboard");

  const loadEl = document.getElementById("dashboard-load");
  const syncEl = document.getElementById("dashboard-sync");

  document.getElementById("dashboard-competition").addEventListener("change", async () => {
    expandedTeamIds.clear();
    initDashboardTeamFilter();
    try {
      await refreshResults();
    } catch (err) {
      showToast(err.message);
    }
  });

  document.getElementById("dashboard-status").addEventListener("change", renderTeamList);
  document.getElementById("dashboard-team").addEventListener("change", renderTeamList);

  document.getElementById("dashboard-refresh-btn")?.addEventListener("click", async () => {
    const btn = document.getElementById("dashboard-refresh-btn");
    if (btn) btn.disabled = true;

    try {
      resultsByTeam = new Map();
      expandedTeamIds.clear();
      await refreshResults();
      showToast("Data refreshed.");
    } catch (err) {
      showToast(err.message, true);
    } finally {
      if (btn) btn.disabled = false;
    }
  });

  try {
    await detectDbSchema();
    await loadCompetitions();
    await loadInspections();
    await loadTeams();
    await loadCompetitionAssignments();
    await initCompetitionFilter();
    initDashboardTeamFilter();
    await refreshResults();

    loadEl.hidden = true;
    syncEl.hidden = false;

    subscribeToDashboardResults(async () => {
      try {
        await refreshResults();
      } catch (err) {
        console.error(err);
      }
    });
  } catch (err) {
    loadEl.textContent = err.message;
    loadEl.classList.add("is-error");
    showToast(err.message);
  }
});
