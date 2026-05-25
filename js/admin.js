function escapeHtml(text) {
  const el = document.createElement("span");
  el.textContent = text;
  return el.innerHTML;
}

function showToast(message, isError = false) {
  const el = document.getElementById("admin-toast");
  el.textContent = message;
  el.classList.toggle("is-error", isError);
  el.hidden = false;
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => {
    el.hidden = true;
  }, 3200);
}

let selectedStations = new Set();
let customStations = [];
let activeAssignCompetitionId = null;
let assignSelectedIds = new Set();
let currentAdminProfileId = null;

async function handleDeleteUser(profileId, email) {
  if (profileId === currentAdminProfileId) {
    showToast("You cannot delete your own account.", true);
    return;
  }
  if (!confirm(`Permanently delete ${email}?\n\nThis removes their login and access. They can sign up again with the same email.`)) {
    return;
  }
  try {
    await deleteUserAccount(profileId);
    await renderUsersPanel();
    showToast("User deleted.");
  } catch (err) {
    showToast(err.message, true);
  }
}

function bindDeleteUserButtons(container) {
  container.querySelectorAll(".btn-delete-user").forEach((btn) => {
    btn.addEventListener("click", () => {
      const card = btn.closest(".user-request-card");
      handleDeleteUser(card.dataset.profileId, card.dataset.userEmail);
    });
  });
}

async function fillTeamCompetitionSelect() {
  const competitions = await loadCompetitions();
  const html = competitions
    .map((c) => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.label)}</option>`)
    .join("");
  document.getElementById("team-competition").innerHTML = html;
}

function switchTab(tab) {
  document.querySelectorAll(".admin-tab").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.tab === tab);
  });
  document.getElementById("panel-inspections").hidden = tab !== "inspections";
  document.getElementById("panel-teams").hidden = tab !== "teams";
  document.getElementById("panel-competitions").hidden = tab !== "competitions";
  document.getElementById("panel-users").hidden = tab !== "users";
  if (tab === "users") renderUsersPanel();
}

function getStationOptions() {
  const known = getAllStationNames();
  const merged = [...new Set([...known, ...customStations])];
  return merged.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

function renderStationCheckboxes() {
  const container = document.getElementById("inspection-stations-list");
  const options = getStationOptions();

  if (!options.length) {
    container.innerHTML =
      '<p class="field-hint">No stations yet — type a name below and click Add.</p>';
    return;
  }

  container.innerHTML = options
    .map(
      (name) => `
    <label class="station-check">
      <input type="checkbox" value="${escapeHtml(name)}" ${selectedStations.has(name) ? "checked" : ""} />
      ${escapeHtml(name)}
    </label>
  `
    )
    .join("");

  container.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
    cb.addEventListener("change", () => {
      if (cb.checked) selectedStations.add(cb.value);
      else selectedStations.delete(cb.value);
    });
  });
}

function readSelectedStationsFromForm() {
  return [...selectedStations];
}

function renderInspectionList() {
  const list = document.getElementById("inspection-admin-list");
  const items = getInspections();

  if (!items.length) {
    list.innerHTML =
      '<li class="admin-empty">No inspections yet. Upload a CSV or add one manually.</li>';
    return;
  }

  list.innerHTML = items
    .map(
      (item) => `
    <li class="admin-list-item" data-key="${escapeHtml(item.key)}">
      <div class="admin-list-head">
        <div>
          <p class="admin-list-title">${escapeHtml(item.itemId)} — ${escapeHtml(item.title)}</p>
          <p class="admin-list-meta">${escapeHtml(item.stations.join(" · ") || "No stations")}</p>
        </div>
        <div class="admin-list-actions">
          <button type="button" class="btn-icon btn-edit-inspection">Edit</button>
          <button type="button" class="btn-icon btn-icon--danger btn-delete-inspection">Delete</button>
        </div>
      </div>
      <p class="admin-list-preview">${escapeHtml(item.description)}</p>
    </li>
  `
    )
    .join("");

  list.querySelectorAll(".btn-edit-inspection").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.closest(".admin-list-item").dataset.key;
      openInspectionForm(getInspections().find((i) => i.key === key));
    });
  });

  list.querySelectorAll(".btn-delete-inspection").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const key = btn.closest(".admin-list-item").dataset.key;
      const item = getInspections().find((i) => i.key === key);
      if (!item) return;
      if (!confirm(`Delete inspection "${item.title}"?`)) return;
      try {
        await deleteInspection(key);
        renderInspectionList();
        showToast("Inspection deleted.");
      } catch (err) {
        showToast(err.message, true);
      }
    });
  });
}

function openInspectionForm(item = null) {
  const form = document.getElementById("inspection-form");
  form.hidden = false;
  document.getElementById("inspection-form-title").textContent = item
    ? "Edit inspection"
    : "Add inspection";
  document.getElementById("inspection-edit-key").value = item?.key ?? "";

  const idWrap = document.getElementById("inspection-id-display-wrap");
  if (item) {
    idWrap.hidden = false;
    document.getElementById("inspection-id-display").value = item.itemId;
  } else {
    idWrap.hidden = true;
  }

  document.getElementById("inspection-title").value = item?.title ?? "";
  document.getElementById("inspection-description").value = item?.description ?? "";

  selectedStations = new Set(item?.stations ?? []);
  customStations = item?.stations ? [...item.stations] : [];
  renderStationCheckboxes();

  form.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function closeInspectionForm() {
  document.getElementById("inspection-form").hidden = true;
  selectedStations.clear();
}

function renderTeamList() {
  const list = document.getElementById("team-admin-list");
  const teams = getTeams();

  if (!teams.length) {
    list.innerHTML = '<li class="admin-empty">No teams yet. Upload a CSV or add one manually.</li>';
    return;
  }

  list.innerHTML = teams
    .map(
      (team) => `
    <li class="admin-list-item" data-id="${escapeHtml(team.id)}">
      <div class="admin-list-head">
        <div>
          <p class="admin-list-title">#${escapeHtml(team.carNumber)} — ${escapeHtml(team.teamName)}</p>
          <p class="admin-list-meta">${escapeHtml(getCompetitionLabel(team.competition))}</p>
        </div>
        <div class="admin-list-actions">
          <button type="button" class="btn-icon btn-edit-team">Edit</button>
          <button type="button" class="btn-icon btn-icon--danger btn-delete-team">Delete</button>
        </div>
      </div>
    </li>
  `
    )
    .join("");

  list.querySelectorAll(".btn-edit-team").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.closest(".admin-list-item").dataset.id;
      openTeamForm(getTeams().find((t) => t.id === id));
    });
  });

  list.querySelectorAll(".btn-delete-team").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.closest(".admin-list-item").dataset.id;
      const team = getTeams().find((t) => t.id === id);
      if (!team) return;
      if (!confirm(`Delete team "${team.teamName}" #${team.carNumber}?`)) return;
      try {
        await deleteTeam(id);
        renderTeamList();
        showToast("Team deleted.");
      } catch (err) {
        showToast(err.message, true);
      }
    });
  });
}

function openTeamForm(team = null) {
  const form = document.getElementById("team-form");
  form.hidden = false;
  document.getElementById("team-form-title").textContent = team ? "Edit team" : "Add team";
  document.getElementById("team-edit-id").value = team?.id ?? "";
  document.getElementById("team-car").value = team?.carNumber ?? "";
  document.getElementById("team-name").value = team?.teamName ?? "";
  document.getElementById("team-competition").value = team?.competition ?? DEFAULT_COMPETITION;
  form.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function closeTeamForm() {
  document.getElementById("team-form").hidden = true;
}

function teamOptionsHtml(selectedId = "") {
  const teams = getTeams().sort((a, b) =>
    a.carNumber.localeCompare(b.carNumber, undefined, { numeric: true })
  );
  return (
    '<option value="">No team</option>' +
    teams
      .map(
        (t) =>
          `<option value="${escapeHtml(t.id)}"${t.id === selectedId ? " selected" : ""}>#${escapeHtml(t.carNumber)} — ${escapeHtml(t.teamName)}</option>`
      )
      .join("")
  );
}

function formatProfileTeamLabel(teamId) {
  if (!teamId) return "—";
  const team = getTeams().find((t) => t.id === teamId);
  return team ? `#${team.carNumber} ${team.teamName}` : "Unknown team";
}

async function renderUsersPanel() {
  const pendingEl = document.getElementById("pending-users-list");
  const approvedEl = document.getElementById("approved-users-list");

  try {
    const pending = await fetchProfilesByStatus("pending");
    const approved = await fetchApprovedProfiles();

    if (!pending.length) {
      pendingEl.innerHTML = '<p class="admin-empty">No pending requests.</p>';
    } else {
      pendingEl.innerHTML = pending
        .map((user) => {
          const defaultRole = user.requestedRole || "inspector";
          const defaultTeam = user.requestedTeamId || "";
          return `
        <div class="user-request-card" data-profile-id="${escapeHtml(user.id)}" data-user-email="${escapeHtml(user.email)}">
          <div class="user-request-head">
            <div>
              <p class="user-request-name">${escapeHtml(user.fullName || user.email)}</p>
              <p class="user-request-meta">${escapeHtml(user.email)} · Requested: ${escapeHtml(getRoleLabel(user.requestedRole))}${user.requestedTeamId ? ` · Team: ${escapeHtml(formatProfileTeamLabel(user.requestedTeamId))}` : ""}</p>
            </div>
          </div>
          <div class="user-request-actions">
            <select class="approve-role-select" aria-label="Role for ${escapeHtml(user.fullName)}">
              <option value="inspector"${defaultRole === "inspector" ? " selected" : ""}>Inspector</option>
              <option value="team_member"${defaultRole === "team_member" ? " selected" : ""}>Team member</option>
              <option value="admin">Admin</option>
            </select>
            <select class="approve-team-select"${defaultRole === "team_member" ? "" : " hidden"} aria-label="Team for ${escapeHtml(user.fullName)}">
              ${teamOptionsHtml(defaultTeam)}
            </select>
            <button type="button" class="btn-primary btn-sm btn-approve-user">Approve</button>
            <button type="button" class="btn-secondary btn-sm btn-reject-user">Reject</button>
            <button type="button" class="btn-icon btn-icon--danger btn-sm btn-delete-user">Delete</button>
          </div>
        </div>
      `;
        })
        .join("");
    }

    if (!approved.length) {
      approvedEl.innerHTML = '<p class="admin-empty">No approved users yet.</p>';
    } else {
      approvedEl.innerHTML = approved
        .map(
          (user) => `
        <div class="user-request-card" data-profile-id="${escapeHtml(user.id)}" data-user-email="${escapeHtml(user.email)}">
          <div class="user-request-head">
            <div>
              <p class="user-request-name">${escapeHtml(user.fullName || user.email)}</p>
              <p class="user-request-meta">${escapeHtml(user.email)} · ${escapeHtml(getRoleLabel(user.role))}${user.teamId ? ` · ${escapeHtml(formatProfileTeamLabel(user.teamId))}` : ""}</p>
            </div>
          </div>
          <div class="user-request-actions">
            <select class="edit-role-select">
              <option value="admin"${user.role === "admin" ? " selected" : ""}>Admin</option>
              <option value="inspector"${user.role === "inspector" ? " selected" : ""}>Inspector</option>
              <option value="team_member"${user.role === "team_member" ? " selected" : ""}>Team member</option>
            </select>
            <select class="edit-team-select"${user.role === "team_member" ? "" : " hidden"}>
              ${teamOptionsHtml(user.teamId || "")}
            </select>
            <button type="button" class="btn-secondary btn-sm btn-save-user">Save changes</button>
            <button type="button" class="btn-icon btn-icon--danger btn-sm btn-delete-user">Delete</button>
          </div>
        </div>
      `
        )
        .join("");
    }

    pendingEl.querySelectorAll(".approve-role-select").forEach((select) => {
      select.addEventListener("change", () => {
        const card = select.closest(".user-request-card");
        const teamSelect = card.querySelector(".approve-team-select");
        teamSelect.hidden = select.value !== "team_member";
      });
    });

    approvedEl.querySelectorAll(".edit-role-select").forEach((select) => {
      select.addEventListener("change", () => {
        const card = select.closest(".user-request-card");
        const teamSelect = card.querySelector(".edit-team-select");
        teamSelect.hidden = select.value !== "team_member";
      });
    });

    pendingEl.querySelectorAll(".btn-approve-user").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const card = btn.closest(".user-request-card");
        const profileId = card.dataset.profileId;
        const role = card.querySelector(".approve-role-select").value;
        const teamId = card.querySelector(".approve-team-select").value;
        if (role === "team_member" && !teamId) {
          showToast("Select a team for team member accounts.", true);
          return;
        }
        try {
          await approveProfile(profileId, role, teamId || null);
          await renderUsersPanel();
          showToast("User approved.");
        } catch (err) {
          showToast(err.message, true);
        }
      });
    });

    pendingEl.querySelectorAll(".btn-reject-user").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const card = btn.closest(".user-request-card");
        const profileId = card.dataset.profileId;
        if (!confirm("Reject this access request?")) return;
        try {
          await rejectProfile(profileId);
          await renderUsersPanel();
          showToast("Request rejected.");
        } catch (err) {
          showToast(err.message, true);
        }
      });
    });

    approvedEl.querySelectorAll(".btn-save-user").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const card = btn.closest(".user-request-card");
        const profileId = card.dataset.profileId;
        const role = card.querySelector(".edit-role-select").value;
        const teamId = card.querySelector(".edit-team-select").value;
        if (role === "team_member" && !teamId) {
          showToast("Select a team for team member accounts.", true);
          return;
        }
        try {
          await updateApprovedProfile(profileId, role, teamId || null);
          await renderUsersPanel();
          showToast("User updated.");
        } catch (err) {
          showToast(err.message, true);
        }
      });
    });

    bindDeleteUserButtons(pendingEl);
    bindDeleteUserButtons(approvedEl);
  } catch (err) {
    pendingEl.innerHTML = `<p class="admin-empty">${escapeHtml(err.message)}</p>`;
    approvedEl.innerHTML = "";
  }
}

function showSetupBanner() {
  const issues = getDbSetupIssues();
  const el = document.getElementById("admin-setup-banner");
  if (!issues.length) {
    el.hidden = true;
    return;
  }

  el.hidden = false;
  el.innerHTML = `
    <p><strong>Database setup needed</strong></p>
    <ul>${issues.map((issue) => `<li>${escapeHtml(issue)}</li>`).join("")}</ul>
    <p class="admin-setup-detail">Open Supabase → SQL Editor, paste the contents of <code>sql/02_inspection_stations_migration.sql</code>, and run it. See <code>docs/SUPABASE-SETUP.md</code> for details.</p>
  `;
}

function renderCompetitionList() {
  const list = document.getElementById("competition-admin-list");
  const competitions = getCompetitions();
  const totalInspections = getInspections().length;

  if (!competitions.length) {
    list.innerHTML = '<li class="admin-empty">No competitions yet.</li>';
    return;
  }

  list.innerHTML = competitions
    .map((c) => {
      const assigned = getAssignmentCount(c.id);
      const assignLabel =
        totalInspections > 0
          ? `${assigned} / ${totalInspections} inspections assigned`
          : "No master inspection list yet";
      const assignButtons = dbSchema.hasCompetitionInspections
        ? `
          <button type="button" class="btn-icon btn-manage-assign">Manage</button>
          <button type="button" class="btn-icon btn-bulk-assign">Assign all</button>`
        : `<span class="admin-list-meta">Run migration to assign inspections</span>`;

      return `
    <li class="admin-list-item" data-competition-id="${escapeHtml(c.id)}">
      <div class="admin-list-head">
        <div>
          <p class="admin-list-title">${escapeHtml(c.label)}</p>
          <p class="admin-list-meta">ID: ${escapeHtml(c.id)} · ${escapeHtml(assignLabel)}</p>
        </div>
        <div class="admin-list-actions">
          ${assignButtons}
          <button type="button" class="btn-icon btn-icon--danger btn-delete-competition">Delete</button>
        </div>
      </div>
    </li>
  `;
    })
    .join("");

  if (dbSchema.hasCompetitionInspections) {
    list.querySelectorAll(".btn-manage-assign").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.closest(".admin-list-item").dataset.competitionId;
        openAssignmentPanel(id);
      });
    });

    list.querySelectorAll(".btn-bulk-assign").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.closest(".admin-list-item").dataset.competitionId;
        const label = getCompetitionLabel(id);
        if (
          !confirm(
            `Assign ALL inspections from the master list to "${label}"?\n\nThis replaces the current assignment for this competition.`
          )
        ) {
          return;
        }
        try {
          const count = await assignAllInspectionsToCompetition(id);
          renderCompetitionList();
          if (activeAssignCompetitionId === id) {
            assignSelectedIds = getAssignedItemIds(id);
            renderAssignmentChecklist();
          }
          showToast(`Assigned ${count} inspections to ${label}.`);
        } catch (err) {
          showToast(err.message, true);
        }
      });
    });
  }

  list.querySelectorAll(".btn-delete-competition").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.closest(".admin-list-item").dataset.competitionId;
      const label = getCompetitionLabel(id);
      const teamsInComp = getTeams().filter((t) => t.competition === id);
      if (teamsInComp.length) {
        showToast(
          `Cannot delete "${label}" — ${teamsInComp.length} team(s) still assigned. Move or delete them first.`,
          true
        );
        return;
      }
      if (
        !confirm(
          `Delete competition "${label}"?\n\nThis removes the competition and its inspection assignments. This cannot be undone.`
        )
      ) {
        return;
      }
      try {
        await deleteCompetition(id);
        if (activeAssignCompetitionId === id) {
          closeAssignmentPanel();
        }
        renderCompetitionList();
        showToast(`Deleted ${label}.`);
      } catch (err) {
        showToast(err.message, true);
      }
    });
  });
}

function renderAssignmentChecklist() {
  const container = document.getElementById("assign-inspection-list");
  const items = getInspections();

  if (!items.length) {
    container.innerHTML =
      '<p class="admin-empty">Upload inspections on the Inspections tab first.</p>';
    return;
  }

  container.innerHTML = items
    .map(
      (item) => `
    <label class="assign-check-row">
      <input type="checkbox" value="${escapeHtml(item.itemId)}" ${
        assignSelectedIds.has(item.itemId) ? "checked" : ""
      } />
      <span class="assign-check-id">${escapeHtml(item.itemId)}</span>
      <span class="assign-check-title">${escapeHtml(item.title)}</span>
      <span class="assign-check-stations">${escapeHtml(item.stations.join(" · "))}</span>
    </label>
  `
    )
    .join("");

  container.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
    cb.addEventListener("change", () => {
      if (cb.checked) assignSelectedIds.add(cb.value);
      else assignSelectedIds.delete(cb.value);
      updateAssignPanelMeta();
    });
  });

  updateAssignPanelMeta();
}

function updateAssignPanelMeta() {
  const total = getInspections().length;
  document.getElementById("assign-panel-meta").textContent = `${assignSelectedIds.size} of ${total} selected`;
}

function openAssignmentPanel(competitionId) {
  activeAssignCompetitionId = competitionId;
  assignSelectedIds = new Set(getAssignedItemIds(competitionId));

  document.getElementById("assign-panel-title").textContent = `Required inspections — ${getCompetitionLabel(competitionId)}`;
  document.getElementById("competition-assign-panel").hidden = false;
  renderAssignmentChecklist();
  document.getElementById("competition-assign-panel").scrollIntoView({
    behavior: "smooth",
    block: "nearest",
  });
}

function closeAssignmentPanel() {
  document.getElementById("competition-assign-panel").hidden = true;
  activeAssignCompetitionId = null;
  assignSelectedIds.clear();
}

function openCompetitionForm() {
  document.getElementById("competition-form").hidden = false;
  document.getElementById("competition-label").value = "";
  document.getElementById("competition-id").value = "";
  document.getElementById("competition-form").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function closeCompetitionForm() {
  document.getElementById("competition-form").hidden = true;
}

async function handleInspectionCsvFile(file) {
  if (!file) return;
  const replace = confirm(
    `Import "${file.name}"?\n\nOK = Replace entire inspection list\nCancel = Merge / update existing items`
  );
  try {
    const text = await readCsvFile(file);
    await importInspectionsFromCsvText(text, { replaceAll: replace });
    renderInspectionList();
    showToast(`Imported inspections from ${file.name}.`);
  } catch (err) {
    showToast(err.message, true);
  } finally {
    document.getElementById("inspection-csv-input").value = "";
  }
}

async function handleTeamCsvFile(file) {
  if (!file) return;
  try {
    const text = await readCsvFile(file);
    const count = (await importTeamsFromCsvText(text)).length;
    renderTeamList();
    showToast(`Imported ${count} teams from ${file.name}.`);
  } catch (err) {
    showToast(err.message, true);
  } finally {
    document.getElementById("team-csv-input").value = "";
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  const profile = await requireAuth({ roles: ["admin"] });
  if (!profile) return;

  currentAdminProfileId = profile.id;
  renderAuthHeader(profile, "manage");

  document.querySelectorAll(".admin-tab").forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  try {
    await detectDbSchema();
    await fillTeamCompetitionSelect();
    await loadCompetitions();
    await loadInspections();
    await loadTeams();
    await loadCompetitionAssignments();
    renderInspectionList();
    renderTeamList();
    renderCompetitionList();
    showSetupBanner();
  } catch (err) {
    showToast(err.message, true);
    renderInspectionList();
    renderTeamList();
    renderCompetitionList();
  }

  document.getElementById("add-inspection-btn").addEventListener("click", () => openInspectionForm());
  document.getElementById("cancel-inspection-btn").addEventListener("click", closeInspectionForm);

  document.getElementById("add-station-btn").addEventListener("click", () => {
    const input = document.getElementById("inspection-station-custom");
    const name = input.value.trim();
    if (!name) return;
    customStations.push(name);
    selectedStations.add(name);
    input.value = "";
    renderStationCheckboxes();
  });

  document.getElementById("inspection-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const editKey = document.getElementById("inspection-edit-key").value;
    const existing = editKey ? getInspections().find((i) => i.key === editKey) : null;
    const stations = readSelectedStationsFromForm();

    const payload = {
      title: document.getElementById("inspection-title").value.trim(),
      description: document.getElementById("inspection-description").value.trim(),
      stations,
    };

    if (existing) payload.itemId = existing.itemId;

    try {
      await upsertInspection(payload);
      renderInspectionList();
      closeInspectionForm();
      showToast("Inspection saved.");
    } catch (err) {
      showToast(err.message, true);
    }
  });

  document.getElementById("upload-inspection-csv-btn").addEventListener("click", () => {
    triggerCsvFilePicker("inspection-csv-input");
  });

  document.getElementById("inspection-csv-input").addEventListener("change", (e) => {
    handleInspectionCsvFile(e.target.files[0]);
  });

  document.getElementById("add-team-btn").addEventListener("click", () => openTeamForm());
  document.getElementById("cancel-team-btn").addEventListener("click", closeTeamForm);

  document.getElementById("team-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const editId = document.getElementById("team-edit-id").value;

    const payload = {
      carNumber: document.getElementById("team-car").value.trim(),
      teamName: document.getElementById("team-name").value.trim(),
      competition: document.getElementById("team-competition").value,
    };
    if (editId) payload.id = editId;

    try {
      await upsertTeam(payload);
      renderTeamList();
      closeTeamForm();
      showToast("Team saved.");
    } catch (err) {
      showToast(err.message, true);
    }
  });

  document.getElementById("upload-team-csv-btn").addEventListener("click", () => {
    triggerCsvFilePicker("team-csv-input");
  });

  document.getElementById("team-csv-input").addEventListener("change", (e) => {
    handleTeamCsvFile(e.target.files[0]);
  });

  document.getElementById("add-competition-btn").addEventListener("click", openCompetitionForm);
  document.getElementById("cancel-competition-btn").addEventListener("click", closeCompetitionForm);

  document.getElementById("competition-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const label = document.getElementById("competition-label").value.trim();
    const id = document.getElementById("competition-id").value.trim();

    try {
      await createCompetition(label, id || undefined);
      await fillTeamCompetitionSelect();
      await loadCompetitionAssignments();
      renderCompetitionList();
      closeCompetitionForm();
      showToast("Competition created.");
    } catch (err) {
      showToast(err.message, true);
    }
  });

  document.getElementById("close-assign-panel-btn").addEventListener("click", closeAssignmentPanel);

  document.getElementById("assign-select-all-btn").addEventListener("click", () => {
    assignSelectedIds = new Set(getInspections().map((i) => i.itemId));
    renderAssignmentChecklist();
  });

  document.getElementById("assign-clear-all-btn").addEventListener("click", () => {
    assignSelectedIds.clear();
    renderAssignmentChecklist();
  });

  document.getElementById("assign-save-btn").addEventListener("click", async () => {
    if (!activeAssignCompetitionId) return;
    try {
      const count = await saveCompetitionAssignments(
        activeAssignCompetitionId,
        [...assignSelectedIds]
      );
      renderCompetitionList();
      showToast(`Saved ${count} required inspections.`);
    } catch (err) {
      showToast(err.message, true);
    }
  });
});
