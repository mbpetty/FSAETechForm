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

function statusClass(status) {
  if (status === "pass") return "status-pass";
  if (status === "fail") return "status-fail";
  return "status-pending";
}

function formatExportDateTime(updatedAt) {
  if (!updatedAt) return "";
  return new Date(updatedAt).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function exportCell(value) {
  return value ? escapeHtml(value) : "—";
}

async function renderExport() {
  const params = new URLSearchParams(window.location.search);
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

  document.getElementById("export-team-line").textContent =
    `#${team.carNumber} — ${team.teamName}`;
  document.getElementById("export-meta-line").textContent =
    `${getCompetitionLabel(compId)} · Generated ${new Date().toLocaleString()}`;

  let pass = 0;
  let fail = 0;

  const tbody = document.getElementById("export-table-body");
  tbody.innerHTML = items
    .map((item) => {
      const row = resultMap.get(item.key);
      const status = row?.status ?? "pending";
      if (status === "pass") pass += 1;
      if (status === "fail") fail += 1;
      const hasVerdict = status === "pass" || status === "fail";
      const comment = (row?.comment ?? "").trim();
      const inspectorName = (row?.updated_by_name ?? "").trim();
      const updatedAt = row?.updated_at ?? null;

      return `
      <tr>
        <td class="col-id">${escapeHtml(item.itemId)}</td>
        <td>
          <strong>${escapeHtml(item.title)}</strong>
          <div class="export-desc rich-content">${renderDescriptionHtml(item.description)}</div>
        </td>
        <td class="col-status ${statusClass(status)}">${statusLabel(status)}</td>
        <td class="col-comment">${hasVerdict ? exportCell(comment) : "—"}</td>
        <td class="col-inspector">${hasVerdict ? exportCell(inspectorName) : "—"}</td>
        <td class="col-datetime">${hasVerdict ? exportCell(formatExportDateTime(updatedAt)) : "—"}</td>
      </tr>
    `;
    })
    .join("");

  const open = items.length - pass - fail;
  document.getElementById("export-summary").textContent =
    `${items.length} items · ${pass} pass · ${fail} fail · ${open} open`;

  document.getElementById("export-back-link").href =
    params.get("from") === "inspector" ? "index.html" : "dashboard.html";
}

document.addEventListener("DOMContentLoaded", async () => {
  const profile = await requireAuth({ roles: ["admin", "inspector"] });
  if (!profile) return;

  document.getElementById("export-print-btn").addEventListener("click", () => window.print());

  try {
    await renderExport();
  } catch (err) {
    document.getElementById("export-error").hidden = false;
    document.getElementById("export-error").textContent = err.message;
    document.getElementById("export-document").hidden = true;
  }
});
