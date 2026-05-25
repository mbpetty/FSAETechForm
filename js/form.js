let inspections = [];
const state = new Map();

function escapeHtml(text) {
  const el = document.createElement("span");
  el.textContent = text;
  return el.innerHTML;
}

function getResult(key) {
  return state.get(key)?.result ?? "pending";
}

function getComment(key) {
  return state.get(key)?.comment ?? "";
}

function getSelectedTeamId() {
  return document.getElementById("filter-school").value;
}

function isTeamSelected() {
  return getSelectedTeamId() !== "all";
}

function showInspectorToast(message, isError = false) {
  const el = document.getElementById("inspector-toast");
  el.textContent = message;
  el.classList.toggle("is-error", isError);
  el.hidden = false;
  clearTimeout(showInspectorToast._timer);
  showInspectorToast._timer = setTimeout(() => {
    el.hidden = true;
  }, 3500);
}

async function setResult(key, result) {
  const teamId = getSelectedTeamId();
  if (!isTeamSelected()) {
    showInspectorToast("Select a team before recording pass or fail.", true);
    return;
  }

  const entry = state.get(key) ?? { comment: "" };
  const newResult = entry.result === result ? "pending" : result;
  entry.result = newResult;
  state.set(key, entry);
  updateCardUI(key);
  applyFilters();

  try {
    await saveInspectionResult(teamId, key, newResult, entry.comment);
    const profile = getCurrentProfile();
    entry.updatedByName = profile?.fullName || profile?.email || "";
    entry.updatedAt = new Date().toISOString();
    state.set(key, entry);
    updateCardUI(key);
    setSyncStatus(true);
  } catch (err) {
    showInspectorToast(`Could not save: ${err.message}`, true);
  }
}

async function submitComment(key, card) {
  const teamId = getSelectedTeamId();
  if (!isTeamSelected()) {
    showInspectorToast("Select a team before saving a comment.", true);
    return;
  }

  const input = card.querySelector(".comment-input");
  const btn = card.querySelector(".btn-save-comment");
  const status = card.querySelector(".save-status");
  const comment = input.value.trim();
  const entry = state.get(key) ?? { result: "pending" };
  entry.comment = comment;
  state.set(key, entry);

  try {
    if (entry.result === "pass" || entry.result === "fail") {
      await saveInspectionResult(teamId, key, entry.result, comment);
      const profile = getCurrentProfile();
      entry.updatedByName = profile?.fullName || profile?.email || "";
      entry.updatedAt = new Date().toISOString();
      state.set(key, entry);
      updateCardUI(key);
    }

    btn.disabled = true;
    btn.textContent = "Saved";
    btn.classList.add("is-saved");
    status.hidden = false;
    status.textContent = "Comment saved";
    setSyncStatus(true);
  } catch (err) {
    showInspectorToast(`Could not save comment: ${err.message}`, true);
  }
}

function markCommentDirty(card) {
  const btn = card.querySelector(".btn-save-comment");
  const status = card.querySelector(".save-status");
  if (!btn) return;
  btn.disabled = false;
  btn.textContent = "Save";
  btn.classList.remove("is-saved");
  status.hidden = true;
}

async function initCompetitionFilter() {
  const competitions = await loadCompetitions();
  const select = document.getElementById("filter-competition");
  select.innerHTML =
    '<option value="all">All competitions</option>' +
    competitions
      .map((c) => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.label)}</option>`)
      .join("");
  select.value = DEFAULT_COMPETITION;
}

function initTeamFilter() {
  const select = document.getElementById("filter-school");
  const competition = document.getElementById("filter-competition").value;
  const current = select.value;

  select.querySelectorAll("option:not([value='all'])").forEach((o) => o.remove());

  getTeamsForCompetition(competition).forEach((team) => {
    const opt = document.createElement("option");
    opt.value = team.id;
    opt.textContent = `${team.teamName} #${team.carNumber}`;
    select.appendChild(opt);
  });

  const stillValid = [...select.options].some((o) => o.value === current);
  select.value = stillValid ? current : "all";
}

function initStationFilter() {
  const select = document.getElementById("filter-station");
  const competition = document.getElementById("filter-competition").value;
  const current = select.value;

  select.querySelectorAll("option:not([value='all'])").forEach((o) => o.remove());

  getStations(competition).forEach((s) => {
    const opt = document.createElement("option");
    opt.value = s.id;
    opt.textContent = s.name;
    select.appendChild(opt);
  });

  const stillValid = [...select.options].some((o) => o.value === current);
  select.value = stillValid ? current : "all";
}

function updateTeamBanner() {
  const banner = document.getElementById("team-banner");
  banner.hidden = isTeamSelected();
}

function setSyncStatus(on) {
  const el = document.getElementById("sync-status");
  el.hidden = !on;
}

async function loadResultsIntoState(teamId) {
  state.clear();
  const rows = await fetchTeamResults(teamId);

  for (const row of rows) {
    state.set(row.item_key, {
      result: row.status,
      comment: row.comment || "",
      updatedByName: row.updated_by_name || "",
      updatedAt: row.updated_at || null,
    });
  }

  document.querySelectorAll(".inspection-item").forEach((card) => {
    const key = card.dataset.key;
    const entry = state.get(key);
    const commentInput = card.querySelector(".comment-input");
    const btn = card.querySelector(".btn-save-comment");
    const status = card.querySelector(".save-status");

    if (commentInput && entry) {
      commentInput.value = entry.comment;
      const saved = entry.comment.length > 0;
      btn.disabled = saved;
      btn.textContent = saved ? "Saved" : "Save";
      btn.classList.toggle("is-saved", saved);
      status.hidden = !saved;
      status.textContent = saved ? "Comment saved" : "";
    }

    updateCardUI(key);
  });
}

async function onTeamFilterChange() {
  unsubscribeTeamResults();
  updateTeamBanner();

  const teamId = getSelectedTeamId();
  if (!isTeamSelected()) {
    state.clear();
    document.querySelectorAll(".inspection-item").forEach((card) => {
      updateCardUI(card.dataset.key);
    });
    setSyncStatus(false);
    applyFilters();
    return;
  }

  try {
    await loadResultsIntoState(teamId);
    subscribeToTeamResults(teamId, async () => {
      await loadResultsIntoState(teamId);
      applyFilters();
    });
    setSyncStatus(true);
  } catch (err) {
    showInspectorToast(`Could not load team results: ${err.message}`, true);
  }

  applyFilters();
}

function bindFilterListeners() {
  document.getElementById("filter-competition").addEventListener("change", () => {
    initTeamFilter();
    initStationFilter();
    applyFilters();
  });

  document.getElementById("filter-school").addEventListener("change", () => onTeamFilterChange());

  document.getElementById("filter-station").addEventListener("change", applyFilters);
  document.getElementById("filter-status").addEventListener("change", applyFilters);
}

function setLoadStatus(message, isError = false) {
  const el = document.getElementById("load-status");
  el.textContent = message;
  el.classList.toggle("is-error", isError);
  el.hidden = false;
}

function hideLoadStatus() {
  document.getElementById("load-status").hidden = true;
}

function getSelectedTeam() {
  const teamId = getSelectedTeamId();
  if (teamId === "all") return null;
  return getTeams().find((t) => t.id === teamId) ?? null;
}

function matchesFilters(item) {
  const competition = document.getElementById("filter-competition").value;
  const station = document.getElementById("filter-station").value;
  const status = document.getElementById("filter-status").value;

  if (!isInspectionInCompetition(item, competition)) return false;
  if (station !== "all" && !item.stationIds.includes(station)) return false;
  if (status !== "all" && getResult(item.key) !== status) return false;

  return true;
}

function updateCardUI(key) {
  const card = document.querySelector(`[data-key="${key}"]`);
  if (!card) return;

  const result = getResult(key);
  const hasVerdict = result === "pass" || result === "fail";
  const canEdit = isTeamSelected();

  card.dataset.status = result;
  card.classList.toggle("is-readonly", !canEdit);

  card.querySelector(".btn-pass")?.classList.toggle("is-selected", result === "pass");
  card.querySelector(".btn-fail")?.classList.toggle("is-selected", result === "fail");

  const commentBlock = card.querySelector(".comment-block");
  commentBlock.hidden = !hasVerdict || !canEdit;

  const comment = card.querySelector(".comment-input");
  if (!comment) return;

  comment.classList.toggle("is-required", result === "fail");
  comment.placeholder =
    result === "fail" ? "Required — describe failure…" : "Optional note…";

  const attributionEl = card.querySelector(".item-attribution");
  if (attributionEl) {
    const entry = state.get(key);
    const text = formatAttribution(entry?.updatedByName, entry?.updatedAt);
    attributionEl.textContent = text;
    attributionEl.hidden = !text;
  }
}

function renderList() {
  const list = document.getElementById("inspection-list");
  list.innerHTML = "";

  inspections.forEach((item) => {
    const savedComment = getComment(item.key);
    const commentSaved = savedComment.length > 0;

    const li = document.createElement("li");
    li.className = "inspection-item";
    li.dataset.key = item.key;
    li.dataset.status = "pending";
    li.dataset.stationId = item.stationIds.join(",");
    li.dataset.competition = "";
    li.hidden = true;

    li.innerHTML = `
      <div class="item-head">
        <span class="item-id">${escapeHtml(item.itemId)}</span>
        <h3 class="item-title">${escapeHtml(item.title)}</h3>
        <div class="item-verdict" role="group" aria-label="Inspection result for item ${escapeHtml(item.itemId)}">
          <button type="button" class="btn-pass" title="Pass — tap again to clear">Pass</button>
          <button type="button" class="btn-fail" title="Fail — tap again to clear">Fail</button>
        </div>
      </div>
      <details class="item-description" open>
        <summary class="description-toggle">Hide description</summary>
        <p>${escapeHtml(item.description)}</p>
      </details>
      <p class="item-attribution" hidden></p>
      <div class="comment-block" hidden>
        <div class="comment-row">
          <input type="text" class="comment-input" autocomplete="off" placeholder="Optional note…" value="${escapeHtml(savedComment)}" />
          <button type="button" class="btn-save-comment${commentSaved ? " is-saved" : ""}"${commentSaved ? " disabled" : ""}>${commentSaved ? "Saved" : "Save"}</button>
        </div>
        <span class="save-status" role="status"${commentSaved ? "" : " hidden"}>${commentSaved ? "Comment saved" : ""}</span>
      </div>
    `;

    const descriptionDetails = li.querySelector(".item-description");
    const descriptionToggle = li.querySelector(".description-toggle");
    descriptionDetails.addEventListener("toggle", () => {
      descriptionToggle.textContent = descriptionDetails.open
        ? "Hide description"
        : "Show description";
    });

    li.querySelector(".btn-pass").addEventListener("click", () => setResult(item.key, "pass"));
    li.querySelector(".btn-fail").addEventListener("click", () => setResult(item.key, "fail"));

    const commentInput = li.querySelector(".comment-input");
    commentInput.addEventListener("input", () => markCommentDirty(li));
    commentInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        submitComment(item.key, li);
      }
    });
    li.querySelector(".btn-save-comment").addEventListener("click", () =>
      submitComment(item.key, li)
    );

    list.appendChild(li);
    updateCardUI(item.key);
  });

  applyFilters();
}

function applyFilters() {
  let visible = 0;

  document.querySelectorAll(".inspection-item").forEach((card) => {
    const item = inspections.find((i) => i.key === card.dataset.key);
    const show = item && matchesFilters(item);
    card.hidden = !show;
    if (show) visible += 1;
  });

  const team = getSelectedTeam();
  const teamLabel = team ? `${team.teamName} #${team.carNumber}` : "All teams";
  const competition = document.getElementById("filter-competition").value;
  const assignedCount = getInspectionsForCompetition(competition).length;
  const count =
    visible === assignedCount || competition === "all"
      ? `${visible} items`
      : `${visible} of ${assignedCount}`;
  document.getElementById("list-count").textContent = `${count} · ${teamLabel}`;

  const noAssignments =
    dbSchema.hasCompetitionInspections &&
    competition !== "all" &&
    getAssignmentCount(competition) === 0 &&
    getInspections().length > 0;
  document.getElementById("empty-state").hidden = visible > 0;
  document.getElementById("empty-state").textContent = noAssignments
    ? "No inspections assigned to this competition yet. Assign them in Admin → Competitions."
    : "No inspections match these filters.";

  updateExportLink();
}

function updateExportLink() {
  const btn = document.getElementById("export-pdf-btn");
  if (!btn) return;

  const teamId = getSelectedTeamId();
  const competition = document.getElementById("filter-competition").value;
  if (!isTeamSelected()) {
    btn.hidden = true;
    return;
  }

  btn.hidden = false;
  btn.href = exportUrl(teamId, competition, "inspector");
}

async function applyUrlParams() {
  const params = new URLSearchParams(window.location.search);
  const competition = params.get("competition");
  const teamId = params.get("team");

  if (competition) {
    const select = document.getElementById("filter-competition");
    if ([...select.options].some((o) => o.value === competition)) {
      select.value = competition;
      initTeamFilter();
      initStationFilter();
    }
  }

  if (teamId) {
    const teamSelect = document.getElementById("filter-school");
    if ([...teamSelect.options].some((o) => o.value === teamId)) {
      teamSelect.value = teamId;
      await onTeamFilterChange();
    }
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  const profile = await requireAuth({ roles: ["admin", "inspector"] });
  if (!profile) return;

  renderAuthHeader(profile, "inspector");
  bindFilterListeners();

  try {
    await detectDbSchema();
    await initCompetitionFilter();
    inspections = await loadInspections();
    await loadCompetitionAssignments();
    await loadTeams();
    initTeamFilter();
    initStationFilter();
    await applyUrlParams();
    updateTeamBanner();
    hideLoadStatus();
    document.getElementById("inspection-list").hidden = false;
    renderList();
  } catch (err) {
    console.error(err);
    setLoadStatus(err.message, true);
  }
});
