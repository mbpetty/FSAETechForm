let publicItems = [];

function escapeHtml(text) {
  const el = document.createElement("span");
  el.textContent = text;
  return el.innerHTML;
}

function getPublicCompetitionId() {
  return document.getElementById("public-competition")?.value ?? "";
}

function getPublicStationId() {
  return document.getElementById("public-station")?.value ?? "all";
}

function updatePrintLink() {
  const btn = document.getElementById("public-print-btn");
  const competitionId = getPublicCompetitionId();
  if (!btn) return;

  if (!competitionId || !publicItems.length) {
    btn.href = "#";
    btn.setAttribute("aria-disabled", "true");
    return;
  }

  btn.href = checklistExportUrl(competitionId, "", "public");
  btn.removeAttribute("aria-disabled");
}

function initPublicStationFilter(competitionId) {
  const select = document.getElementById("public-station");
  if (!select) return;

  const previous = select.value || "all";
  select.innerHTML =
    '<option value="all">All stations</option>' +
    getStations(competitionId)
      .map((s) => `<option value="${escapeHtml(s.id)}">${escapeHtml(s.name)}</option>`)
      .join("");

  const stillValid = [...select.options].some((o) => o.value === previous);
  select.value = stillValid ? previous : "all";
}

function groupItemsByStation(items) {
  const stations = getStations(getPublicCompetitionId());
  const groups = [];
  const used = new Set();

  for (const station of stations) {
    const stationItems = items.filter((item) => item.stationIds.includes(station.id));
    if (!stationItems.length) continue;
    stationItems.forEach((item) => used.add(item.key));
    groups.push({ id: station.id, name: station.name, items: stationItems });
  }

  const leftover = items.filter((item) => !used.has(item.key));
  if (leftover.length) {
    groups.push({ id: "other", name: "Other", items: leftover });
  }

  return groups;
}

function renderPublicList() {
  const competitionId = getPublicCompetitionId();
  const stationFilter = getPublicStationId();
  const list = document.getElementById("public-inspection-list");
  const empty = document.getElementById("public-empty-state");
  const countEl = document.getElementById("public-list-count");
  const loadStatus = document.getElementById("public-load-status");

  publicItems = competitionId ? getInspectionsForCompetition(competitionId) : [];
  const filtered =
    stationFilter === "all"
      ? publicItems
      : publicItems.filter((item) => item.stationIds.includes(stationFilter));

  loadStatus.hidden = true;
  updatePrintLink();

  if (!publicItems.length) {
    list.hidden = true;
    empty.hidden = false;
    empty.textContent = competitionId
      ? "No inspections assigned to this competition."
      : "Select a competition to view the checklist.";
    countEl.textContent = "";
    return;
  }

  if (!filtered.length) {
    list.hidden = true;
    empty.hidden = false;
    empty.textContent = "No inspections match this station filter.";
    countEl.textContent = `0 of ${publicItems.length}`;
    return;
  }

  empty.hidden = true;
  list.hidden = false;
  countEl.textContent = `${filtered.length} of ${publicItems.length} items`;

  const groups =
    stationFilter === "all"
      ? groupItemsByStation(filtered)
      : [
          {
            id: stationFilter,
            name: getStations(competitionId).find((s) => s.id === stationFilter)?.name ?? "Station",
            items: filtered,
          },
        ];

  list.innerHTML = groups
    .map((group) => {
      const cards = group.items
        .map(
          (item) => `
        <li class="inspection-item" data-key="${escapeHtml(item.key)}" data-status="pending">
          <div class="item-head">
            <span class="item-id">${escapeHtml(item.itemId)}</span>
            <h3 class="item-title">${escapeHtml(item.title)}</h3>
            <span class="public-checklist-mark">Pass / Fail</span>
          </div>
          <details class="item-description">
            <summary class="description-toggle">Show description</summary>
            <div class="rich-content item-description-body"></div>
          </details>
        </li>
      `
        )
        .join("");

      return `
      <h3 class="public-station-heading">${escapeHtml(group.name)}</h3>
      <ul class="inspection-list">${cards}</ul>
    `;
    })
    .join("");

  list.querySelectorAll(".inspection-item").forEach((card) => {
    const item = publicItems.find((i) => i.key === card.dataset.key);
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
}

async function onCompetitionChange() {
  initPublicStationFilter(getPublicCompetitionId());
  renderPublicList();
}

async function bootPublicPage() {
  const loadStatus = document.getElementById("public-load-status");

  try {
    await detectDbSchema();
    await loadCompetitions();
    await loadInspections();
    await loadCompetitionAssignments();

    const competitions = getCompetitions();
    const select = document.getElementById("public-competition");
    select.innerHTML = competitions
      .map((c) => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.label)}</option>`)
      .join("");

    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get("competition");
    if (fromUrl && competitions.some((c) => c.id === fromUrl)) {
      select.value = fromUrl;
    } else if (competitions.some((c) => c.id === "june-2026")) {
      select.value = "june-2026";
    } else if (competitions.some((c) => c.id === "june-ev")) {
      select.value = "june-ev";
    } else if (competitions.length) {
      select.value = competitions[0].id;
    }

    await onCompetitionChange();
  } catch (err) {
    loadStatus.hidden = false;
    loadStatus.textContent = err.message;
    loadStatus.classList.add("is-error");
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  document.getElementById("public-competition")?.addEventListener("change", onCompetitionChange);
  document.getElementById("public-station")?.addEventListener("change", renderPublicList);

  try {
    const session = await getSession();
    if (session) {
      const profile = await loadProfile(true);
      if (profile && profile.status === "approved") {
        renderAuthHeader(profile, "public");
      }
    }
  } catch (_) {
    // keep public nav
  }

  await bootPublicPage();
});
