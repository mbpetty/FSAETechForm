function escapeHtml(text) {
  const el = document.createElement("span");
  el.textContent = text;
  return el.innerHTML;
}

function statusLabel(status) {
  if (status === "pass") return "Pass";
  if (status === "fail") return "Fail";
  return "Open";
}

function formatExportDateTime(updatedAt) {
  if (!updatedAt) return "";
  return new Date(updatedAt).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function groupItemsByStation(competitionId, items) {
  const stations = getStations(competitionId);
  const groups = [];
  const used = new Set();

  for (const station of stations) {
    const stationItems = items.filter((item) => item.stationIds.includes(station.id));
    if (!stationItems.length) continue;
    stationItems.forEach((item) => used.add(item.key));
    groups.push({ name: station.name, items: stationItems });
  }

  const leftover = items.filter((item) => !used.has(item.key));
  if (leftover.length) groups.push({ name: "Other", items: leftover });
  return groups;
}

function renderChecklistCard(item) {
  return `
    <li class="export-card" data-status="pending">
      <div class="export-card-head">
        <span class="export-card-id">${escapeHtml(item.itemId)}</span>
        <h3 class="export-card-title">${escapeHtml(item.title)}</h3>
        <div class="export-checkboxes" aria-hidden="true">
          <span class="export-check"><i></i> Pass</span>
          <span class="export-check"><i></i> Fail</span>
        </div>
      </div>
      <div class="export-card-desc rich-content">${renderDescriptionHtml(item.description)}</div>
      <div class="export-card-notes">
        <span class="export-notes-label">Notes</span>
        <span class="export-notes-line"></span>
      </div>
    </li>
  `;
}

function renderStatusCard(item, result) {
  const status = result?.status ?? "pending";
  const hasVerdict = status === "pass" || status === "fail";
  const comment = (result?.comment ?? "").trim();
  const inspectorName = (result?.updated_by_name ?? "").trim();
  const updatedAt = result?.updated_at ?? null;
  const metaParts = [];
  if (hasVerdict && inspectorName) metaParts.push(inspectorName);
  if (hasVerdict && updatedAt) metaParts.push(formatExportDateTime(updatedAt));

  return `
    <li class="export-card" data-status="${status}">
      <div class="export-card-head">
        <span class="export-card-id">${escapeHtml(item.itemId)}</span>
        <h3 class="export-card-title">${escapeHtml(item.title)}</h3>
        <span class="export-status-pill export-status-pill--${status}">${statusLabel(status)}</span>
      </div>
      <div class="export-card-desc rich-content">${renderDescriptionHtml(item.description)}</div>
      ${
        hasVerdict && comment
          ? `<p class="export-card-comment">${escapeHtml(comment)}</p>`
          : ""
      }
      ${
        metaParts.length
          ? `<p class="export-card-meta">${escapeHtml(metaParts.join(" · "))}</p>`
          : ""
      }
    </li>
  `;
}

function renderGroupedBody(competitionId, items, renderCard) {
  const groups = groupItemsByStation(competitionId, items);
  return groups
    .map(
      (group) => `
      <section class="export-station">
        <h2 class="export-station-title">${escapeHtml(group.name)}</h2>
        <ul class="export-card-list">
          ${group.items.map(renderCard).join("")}
        </ul>
      </section>
    `
    )
    .join("");
}

function setBackLink(params, isChecklist) {
  const from = params.get("from");
  const back = document.getElementById("export-back-link");
  if (from === "public" || isChecklist) {
    const competition = params.get("competition");
    const team = params.get("team");
    const q = new URLSearchParams();
    if (competition) q.set("competition", competition);
    if (team) q.set("team", team);
    back.href = q.toString() ? `public.html?${q}` : "public.html";
    back.textContent = "Back to public form";
  } else if (from === "inspector") {
    back.href = "index.html";
    back.textContent = "Back";
  } else {
    back.href = "dashboard.html";
    back.textContent = "Back";
  }
}

async function renderChecklistExport(params) {
  const competitionId = params.get("competition");
  const teamId = params.get("team");
  const errorEl = document.getElementById("export-error");
  const doc = document.getElementById("export-document");

  if (!competitionId) {
    errorEl.hidden = false;
    errorEl.textContent = "Missing competition. Open export from the public tech form.";
    doc.hidden = true;
    return;
  }

  await detectDbSchema();
  await loadCompetitions();
  await loadTeams();
  await loadInspections();
  await loadCompetitionAssignments();

  const items = getInspectionsForCompetition(competitionId);
  if (!items.length) {
    errorEl.hidden = false;
    errorEl.textContent = "No inspections assigned to this competition.";
    doc.hidden = true;
    return;
  }

  const team = teamId ? getTeams().find((t) => t.id === teamId) : null;

  document.getElementById("export-title").textContent = "Printable checklist";
  document.getElementById("export-team-line").textContent = team
    ? `#${team.carNumber} — ${team.teamName}`
    : "Team: ____________________________   Car #: ______";
  document.getElementById("export-meta-line").textContent =
    `${getCompetitionLabel(competitionId)} · Blank form · Generated ${new Date().toLocaleString()}`;

  document.getElementById("export-body").innerHTML = renderGroupedBody(
    competitionId,
    items,
    renderChecklistCard
  );

  document.getElementById("export-summary").textContent =
    `${items.length} items · Mark Pass or Fail by hand · Bring completed notes to tech`;

  setBackLink(params, true);
}

async function renderStatusExport(params) {
  const teamId = params.get("team");
  const competitionId = params.get("competition") || "all";
  const errorEl = document.getElementById("export-error");
  const doc = document.getElementById("export-document");

  if (!teamId) {
    errorEl.hidden = false;
    errorEl.textContent = "Missing team. Open export from the inspector or dashboard with a team selected.";
    doc.hidden = true;
    return;
  }

  await detectDbSchema();
  await loadCompetitions();
  await loadTeams();
  await loadInspections();
  await loadCompetitionAssignments();

  const team = getTeams().find((t) => t.id === teamId);
  if (!team) {
    errorEl.hidden = false;
    errorEl.textContent = "Team not found.";
    doc.hidden = true;
    return;
  }

  const compId = competitionId === "all" ? team.competition : competitionId;
  const items = getInspectionsForCompetition(compId);
  const results = await fetchTeamResults(teamId);
  const resultMap = new Map(results.map((r) => [r.item_key, r]));

  document.getElementById("export-title").textContent = "Inspection report";
  document.getElementById("export-team-line").textContent =
    `#${team.carNumber} — ${team.teamName}`;
  document.getElementById("export-meta-line").textContent =
    `${getCompetitionLabel(compId)} · Generated ${new Date().toLocaleString()}`;

  let pass = 0;
  let fail = 0;
  for (const item of items) {
    const status = resultMap.get(item.key)?.status;
    if (status === "pass") pass += 1;
    if (status === "fail") fail += 1;
  }

  document.getElementById("export-body").innerHTML = renderGroupedBody(compId, items, (item) =>
    renderStatusCard(item, resultMap.get(item.key))
  );

  const open = items.length - pass - fail;
  document.getElementById("export-summary").textContent =
    `${items.length} items · ${pass} pass · ${fail} fail · ${open} open`;

  setBackLink(params, false);
}

document.addEventListener("DOMContentLoaded", async () => {
  const params = new URLSearchParams(window.location.search);
  const isChecklist = params.get("mode") === "checklist";

  document.getElementById("export-print-btn").addEventListener("click", () => window.print());

  try {
    if (isChecklist) {
      await renderChecklistExport(params);
      return;
    }

    const profile = await requireAuth({ roles: ["admin", "inspector"] });
    if (!profile) return;

    await renderStatusExport(params);
  } catch (err) {
    document.getElementById("export-error").hidden = false;
    document.getElementById("export-error").textContent = err.message;
    document.getElementById("export-document").hidden = true;
  }
});
