const DEFAULT_COMPETITION = "michigan-june";

const dbSchema = {
  useStationsArray: true,
  hasCompetitionInspections: true,
  hasInspectionCompetitionId: false,
};

let competitionsCache = null;
let inspectionsCache = null;
let teamsCache = null;
let resultsChannel = null;
let dashboardChannel = null;
let competitionAssignmentsCache = null;

async function assertApprovedForDataAccess() {
  const {
    data: { session },
  } = await getSupabase().auth.getSession();
  if (!session) return;

  const { data: profile, error } = await getSupabase()
    .from("profiles")
    .select("status")
    .eq("id", session.user.id)
    .maybeSingle();

  throwIfError(error, "check access");

  if (!profile || profile.status !== "approved") {
    throw new Error("Your account is awaiting admin approval.");
  }
}

function formatAttribution(updatedByName, updatedAt) {
  if (!updatedByName && !updatedAt) return "";
  const when = updatedAt ? new Date(updatedAt).toLocaleString() : "";
  if (updatedByName && when) return `Updated by ${updatedByName} · ${when}`;
  if (updatedByName) return `Updated by ${updatedByName}`;
  return when;
}

function exportUrl(teamId, competitionId, from = "") {
  const params = new URLSearchParams({ team: teamId });
  if (competitionId && competitionId !== "all") params.set("competition", competitionId);
  if (from) params.set("from", from);
  return `export.html?${params.toString()}`;
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function slugifyCompetitionId(label) {
  const slug = slugify(label);
  return slug || `comp-${Date.now().toString(36)}`;
}

function parseStationsList(raw) {
  if (Array.isArray(raw)) {
    return raw.map((s) => String(s).trim()).filter(Boolean);
  }
  if (typeof raw === "string" && raw.trim()) {
    return parseStationsField(raw);
  }
  return [];
}

function normalizeInspection(raw) {
  const itemId = String(raw.itemId ?? raw.item_id ?? "").trim();
  const stations = parseStationsList(raw.stations ?? raw.station);

  return {
    key: raw.item_key || itemId,
    itemId,
    title: String(raw.title ?? "").trim(),
    description: String(raw.description ?? "").trim(),
    stations,
    stationIds: stations.map(slugify),
    competitionId: raw.competitionId ?? raw.competition_id ?? null,
  };
}

function rowToInspection(row) {
  return normalizeInspection({
    item_key: row.item_key,
    itemId: row.item_id,
    title: row.title,
    description: row.description,
    stations: row.stations,
    station: row.station,
    competition_id: row.competition_id,
  });
}

function inspectionToRow(item) {
  const n = normalizeInspection(item);
  const row = {
    item_id: n.itemId,
    title: n.title,
    description: n.description,
    item_key: n.itemId,
  };

  if (dbSchema.useStationsArray) {
    row.stations = n.stations;
  } else {
    row.station = n.stations.join(" | ") || "General";
    row.competition_id = n.competitionId || DEFAULT_COMPETITION;
  }

  return row;
}

function isMissingColumnError(error) {
  return error && (error.code === "42703" || error.code === "PGRST204");
}

function isMissingTableError(error) {
  return error && (error.code === "PGRST205" || error.code === "42P01");
}

async function detectDbSchema() {
  const supabase = getSupabase();

  const { error: stationsErr } = await supabase.from("inspection_items").select("stations").limit(0);
  dbSchema.useStationsArray = !isMissingColumnError(stationsErr);

  const { error: competitionColErr } = await supabase
    .from("inspection_items")
    .select("competition_id")
    .limit(0);
  dbSchema.hasInspectionCompetitionId = !isMissingColumnError(competitionColErr);

  const { error: assignmentsErr } = await supabase
    .from("competition_inspections")
    .select("competition_id")
    .limit(0);
  dbSchema.hasCompetitionInspections = !isMissingTableError(assignmentsErr);

  return dbSchema;
}

function getDbSetupIssues() {
  const issues = [];

  if (!dbSchema.useStationsArray || !dbSchema.hasCompetitionInspections) {
    issues.push(
      "Run sql/02_inspection_stations_migration.sql in the Supabase SQL Editor to finish the database upgrade."
    );
  }

  return issues;
}

async function upsertInspectionRow(row) {
  if (dbSchema.useStationsArray) {
    const { error } = await getSupabase()
      .from("inspection_items")
      .upsert(row, { onConflict: "item_id" });
    throwIfError(error, "save inspection");
    return;
  }

  const { data: existing, error: findError } = await getSupabase()
    .from("inspection_items")
    .select("id")
    .eq("item_id", row.item_id)
    .maybeSingle();

  throwIfError(findError, "find inspection");

  if (existing) {
    const { error } = await getSupabase()
      .from("inspection_items")
      .update(row)
      .eq("item_id", row.item_id);
    throwIfError(error, "update inspection");
    return;
  }

  const { error } = await getSupabase().from("inspection_items").insert(row);
  throwIfError(error, "insert inspection");
}

function normalizeTeam(raw) {
  return {
    id: raw.id,
    carNumber: String(raw.carNumber ?? raw.car_number ?? "").trim(),
    teamName: String(raw.teamName ?? raw.team_name ?? "").trim(),
    competition: raw.competition || raw.competition_id || DEFAULT_COMPETITION,
  };
}

function rowToTeam(row) {
  return normalizeTeam({
    id: row.id,
    carNumber: row.car_number,
    teamName: row.team_name,
    competition: row.competition_id,
  });
}

function teamToRow(team) {
  const n = normalizeTeam(team);
  const row = {
    car_number: n.carNumber,
    team_name: n.teamName,
    competition_id: n.competition,
  };
  if (n.id && isUuid(n.id)) row.id = n.id;
  return row;
}

function invalidateCache() {
  inspectionsCache = null;
  teamsCache = null;
  competitionsCache = null;
}

function invalidateAssignmentCache() {
  competitionAssignmentsCache = null;
}

function generateNextItemId(items) {
  let maxNum = 0;
  for (const item of items) {
    const n = parseInt(item.itemId, 10);
    if (!Number.isNaN(n) && n > maxNum) maxNum = n;
  }
  return String(maxNum + 1);
}

function assignItemIds(rows, existingItems) {
  let nextId = generateNextItemId(existingItems);
  return rows.map((row) => {
    if (row.itemId) return row;
    const assigned = { ...row, itemId: nextId };
    nextId = String(parseInt(nextId, 10) + 1);
    return assigned;
  });
}

function buildStations(inspections) {
  const stationMap = new Map();
  for (const item of inspections) {
    for (const station of item.stations) {
      const id = slugify(station);
      if (!stationMap.has(id)) {
        stationMap.set(id, { id, name: station });
      }
    }
  }
  return Array.from(stationMap.values()).sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { numeric: true })
  );
}

function getAllStationNames() {
  return buildStations(getInspections()).map((s) => s.name);
}

async function loadCompetitions() {
  if (competitionsCache) return competitionsCache;

  await assertApprovedForDataAccess();

  const { data, error } = await getSupabase()
    .from("competitions")
    .select("id, label")
    .order("label");

  throwIfError(error, "load competitions");
  competitionsCache = data ?? [];
  return competitionsCache;
}

function getCompetitions() {
  return competitionsCache ?? [];
}

function getCompetitionLabel(id) {
  return getCompetitions().find((c) => c.id === id)?.label ?? id;
}

async function createCompetition(label, idOverride) {
  const labelTrim = label.trim();
  const id = (idOverride || slugifyCompetitionId(labelTrim)).trim();

  const { error } = await getSupabase().from("competitions").insert({ id, label: labelTrim });

  if (error?.code === "42501") {
    throw new Error(
      "Cannot create competitions — run sql/02_inspection_stations_migration.sql in Supabase to fix permissions."
    );
  }

  throwIfError(error, "create competition");
  competitionsCache = null;
  return loadCompetitions();
}

async function updateCompetition(id, label) {
  const labelTrim = label.trim();
  if (!labelTrim) throw new Error("Competition name is required.");

  const { error } = await getSupabase()
    .from("competitions")
    .update({ label: labelTrim })
    .eq("id", id);

  throwIfError(error, "update competition");
  competitionsCache = null;
  return loadCompetitions();
}

async function loadInspections() {
  if (inspectionsCache) return inspectionsCache;

  await assertApprovedForDataAccess();

  const { data, error } = await getSupabase()
    .from("inspection_items")
    .select("*")
    .order("item_id", { ascending: true });

  throwIfError(error, "load inspections");

  inspectionsCache = (data ?? []).map(rowToInspection);
  return inspectionsCache;
}

async function bulkUpsertInspectionItems(items) {
  const rows = items.map((item) => inspectionToRow(normalizeInspection(item)));

  if (dbSchema.useStationsArray) {
    const { error } = await getSupabase()
      .from("inspection_items")
      .upsert(rows, { onConflict: "item_id" });
    throwIfError(error, "save inspections");
  } else {
    for (const row of rows) {
      await upsertInspectionRow(row);
    }
  }

  invalidateCache();
}

function getInspections() {
  return inspectionsCache ?? [];
}

function getStations(competitionId = "all") {
  const items =
    competitionId === "all" ? getInspections() : getInspectionsForCompetition(competitionId);
  return buildStations(items);
}

async function loadCompetitionAssignments() {
  if (competitionAssignmentsCache) return competitionAssignmentsCache;

  await assertApprovedForDataAccess();

  if (!dbSchema.hasCompetitionInspections) {
    competitionAssignmentsCache = new Map();
    return competitionAssignmentsCache;
  }

  const { data, error } = await getSupabase()
    .from("competition_inspections")
    .select("competition_id, item_id");

  throwIfError(error, "load competition assignments");

  competitionAssignmentsCache = new Map();
  for (const row of data ?? []) {
    if (!competitionAssignmentsCache.has(row.competition_id)) {
      competitionAssignmentsCache.set(row.competition_id, new Set());
    }
    competitionAssignmentsCache.get(row.competition_id).add(row.item_id);
  }

  return competitionAssignmentsCache;
}

function getAssignedItemIds(competitionId) {
  if (!competitionAssignmentsCache) return new Set();
  return new Set(competitionAssignmentsCache.get(competitionId) ?? []);
}

function getAssignmentCount(competitionId) {
  if (dbSchema.hasCompetitionInspections) {
    return getAssignedItemIds(competitionId).size;
  }

  return getInspectionsForCompetition(competitionId).length;
}

function getInspectionsForCompetition(competitionId) {
  const all = getInspections();
  if (competitionId === "all") return all;

  if (dbSchema.hasCompetitionInspections) {
    const assigned = getAssignedItemIds(competitionId);
    if (!assigned.size) return [];
    return all.filter((item) => assigned.has(item.itemId));
  }

  if (dbSchema.hasInspectionCompetitionId) {
    return all.filter((item) => item.competitionId === competitionId);
  }

  return all;
}

function isInspectionInCompetition(item, competitionId) {
  if (competitionId === "all") return true;

  if (dbSchema.hasCompetitionInspections) {
    const assigned = getAssignedItemIds(competitionId);
    if (!assigned.size) return false;
    return assigned.has(item.itemId);
  }

  if (dbSchema.hasInspectionCompetitionId) {
    return item.competitionId === competitionId;
  }

  return true;
}

async function saveCompetitionAssignments(competitionId, itemIds) {
  if (!dbSchema.hasCompetitionInspections) {
    throw new Error(
      "Competition assignments require the database migration. Run sql/02_inspection_stations_migration.sql in Supabase."
    );
  }

  const { error: delError } = await getSupabase()
    .from("competition_inspections")
    .delete()
    .eq("competition_id", competitionId);

  throwIfError(delError, "clear competition assignments");

  const uniqueIds = [...new Set(itemIds.map(String))].filter(Boolean);
  if (uniqueIds.length) {
    const rows = uniqueIds.map((item_id) => ({ competition_id: competitionId, item_id }));
    const { error } = await getSupabase().from("competition_inspections").insert(rows);
    throwIfError(error, "save competition assignments");
  }

  invalidateAssignmentCache();
  await loadCompetitionAssignments();
  return uniqueIds.length;
}

async function assignAllInspectionsToCompetition(competitionId) {
  const itemIds = getInspections().map((i) => i.itemId);
  if (!itemIds.length) {
    throw new Error("No inspections in the master list. Upload inspections first.");
  }
  return saveCompetitionAssignments(competitionId, itemIds);
}

async function importInspectionsFromCsvText(text, { replaceAll = false } = {}) {
  const parsed = parseInspectionCsvText(text);
  if (!parsed.length) {
    throw new Error("No inspection rows found in CSV. Check the template format.");
  }

  const existing = replaceAll ? [] : await loadInspections();
  const withIds = assignItemIds(parsed, existing);

  if (replaceAll) {
    const { error: delError } = await getSupabase()
      .from("inspection_items")
      .delete()
      .gte("created_at", "1970-01-01");
    throwIfError(delError, "clear inspections");
    invalidateCache();
  }

  await bulkUpsertInspectionItems(withIds);
  return loadInspections();
}

async function upsertInspection(inspection) {
  const existing = getInspections();
  let payload = { ...inspection };

  if (!payload.itemId) {
    payload.itemId = generateNextItemId(existing);
  }

  payload = normalizeInspection(payload);
  if (!payload.stations.length) {
    throw new Error("Select at least one station or section.");
  }

  const row = inspectionToRow(payload);
  await upsertInspectionRow(row);
  invalidateCache();
  return loadInspections();
}

async function deleteInspection(key) {
  // First delete any competition assignments for this item
  if (dbSchema.hasCompetitionInspections) {
    await getSupabase()
      .from("competition_inspections")
      .delete()
      .eq("item_id", key);
  }

  const { error } = await getSupabase().from("inspection_items").delete().eq("item_id", key);

  throwIfError(error, "delete inspection");
  invalidateCache();
  invalidateAssignmentCache();
  if (dbSchema.hasCompetitionInspections) {
    await loadCompetitionAssignments();
  }
  return loadInspections();
}

async function loadTeams() {
  if (teamsCache) return teamsCache;

  await assertApprovedForDataAccess();

  const { data, error } = await getSupabase()
    .from("teams")
    .select("*")
    .order("team_name", { ascending: true });

  throwIfError(error, "load teams");
  teamsCache = (data ?? []).map(rowToTeam);
  return teamsCache;
}

function getTeams() {
  return teamsCache ?? [];
}

function getTeamsForCompetition(competitionId) {
  const teams = getTeams();
  if (competitionId === "all") return teams;
  return teams.filter((t) => t.competition === competitionId);
}

async function upsertTeam(team) {
  const row = teamToRow(team);
  const { data, error } = await getSupabase().from("teams").upsert(row).select().single();

  throwIfError(error, "save team");
  teamsCache = null;
  await loadTeams();
  return data ? rowToTeam(data) : normalizeTeam(team);
}

async function bulkUpsertTeams(rows) {
  const payload = rows.map((r) => teamToRow(normalizeTeam(r)));
  const { error } = await getSupabase().from("teams").upsert(payload);

  throwIfError(error, "import teams");
  teamsCache = null;
  return loadTeams();
}

async function importTeamsFromCsvText(text) {
  const parsed = parseTeamCsvText(text);
  if (!parsed.length) {
    throw new Error("No team rows found in CSV. Check the template format.");
  }
  return bulkUpsertTeams(parsed);
}

async function deleteTeam(id) {
  const { error } = await getSupabase().from("teams").delete().eq("id", id);

  throwIfError(error, "delete team");
  teamsCache = null;
  await loadTeams();
  return getTeams();
}

async function deleteCompetition(id) {
  const { error } = await getSupabase().from("competitions").delete().eq("id", id);

  if (error?.code === "23503") {
    throw new Error(
      "Cannot delete this competition — teams are still assigned to it. Move or delete those teams first."
    );
  }

  throwIfError(error, "delete competition");
  competitionsCache = null;
  invalidateAssignmentCache();
  return loadCompetitions();
}

async function fetchTeamResults(teamId) {
  await assertApprovedForDataAccess();

  const { data, error } = await getSupabase()
    .from("inspection_results")
    .select("item_key, status, comment, updated_by_name, updated_at")
    .eq("team_id", teamId);

  throwIfError(error, "load team results");
  return data ?? [];
}

async function fetchResultsForTeamIds(teamIds) {
  if (!teamIds.length) return [];

  await assertApprovedForDataAccess();

  const allRows = [];
  const teamChunkSize = 15;
  const pageSize = 1000;

  for (let i = 0; i < teamIds.length; i += teamChunkSize) {
    const teamChunk = teamIds.slice(i, i + teamChunkSize);
    let offset = 0;

    while (true) {
      const { data, error } = await getSupabase()
        .from("inspection_results")
        .select("team_id, item_key, status, comment, updated_by_name, updated_at")
        .in("team_id", teamChunk)
        .range(offset, offset + pageSize - 1);

      throwIfError(error, "load team results");

      const rows = data ?? [];
      allRows.push(...rows);

      if (rows.length < pageSize) break;
      offset += pageSize;
    }
  }

  return allRows;
}

function groupResultsByTeam(rows) {
  const byTeam = new Map();
  for (const row of rows) {
    if (!byTeam.has(row.team_id)) byTeam.set(row.team_id, new Map());
    byTeam.get(row.team_id).set(row.item_key, {
      status: row.status,
      comment: row.comment ?? "",
      updatedByName: row.updated_by_name ?? "",
      updatedAt: row.updated_at ?? null,
    });
  }
  return byTeam;
}

async function saveInspectionResult(teamId, itemKey, status, comment = "", inspector = null) {
  await assertApprovedForDataAccess();

  if (status === "pending") {
    const { error } = await getSupabase()
      .from("inspection_results")
      .delete()
      .eq("team_id", teamId)
      .eq("item_key", itemKey);

    throwIfError(error, "clear result");
    return;
  }

  const profile =
    inspector ||
    (typeof getCurrentProfile === "function" ? getCurrentProfile() : null);

  const payload = {
    team_id: teamId,
    item_key: itemKey,
    status,
    comment: comment ?? "",
    updated_by: profile?.id ?? null,
    updated_by_name: profile?.fullName || profile?.email || "",
  };

  const { error } = await getSupabase().from("inspection_results").upsert(payload, {
    onConflict: "team_id,item_key",
  });

  throwIfError(error, "save result");
}

function unsubscribeTeamResults() {
  if (resultsChannel) {
    getSupabase().removeChannel(resultsChannel);
    resultsChannel = null;
  }
}

function subscribeToTeamResults(teamId, onUpdate) {
  unsubscribeTeamResults();

  if (!teamId || teamId === "all") return;

  resultsChannel = getSupabase()
    .channel(`team-results-${teamId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "inspection_results",
        filter: `team_id=eq.${teamId}`,
      },
      () => onUpdate()
    )
    .subscribe();
}

function unsubscribeDashboardResults() {
  if (dashboardChannel) {
    getSupabase().removeChannel(dashboardChannel);
    dashboardChannel = null;
  }
}

function subscribeToDashboardResults(onUpdate) {
  unsubscribeDashboardResults();

  dashboardChannel = getSupabase()
    .channel("dashboard-results")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "inspection_results" },
      () => onUpdate()
    )
    .subscribe();
}

function rowToProfile(row) {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    role: row.role,
    status: row.status,
    requestedRole: row.requested_role,
    teamId: row.team_id,
    requestedTeamId: row.requested_team_id,
    approvedAt: row.approved_at,
    createdAt: row.created_at,
  };
}

async function fetchProfilesByStatus(status) {
  const { data, error } = await getSupabase()
    .from("profiles")
    .select("*")
    .eq("status", status)
    .order("created_at", { ascending: true });

  throwIfError(error, "load profiles");
  return (data ?? []).map(rowToProfile);
}

async function fetchApprovedProfiles() {
  const { data, error } = await getSupabase()
    .from("profiles")
    .select("*")
    .eq("status", "approved")
    .order("full_name", { ascending: true });

  throwIfError(error, "load profiles");
  return (data ?? []).map(rowToProfile);
}

async function approveProfile(profileId, role, teamId = null) {
  const user = (await getSupabase().auth.getUser()).data.user;
  const payload = {
    role,
    status: "approved",
    team_id: role === "team_member" ? teamId : null,
    approved_at: new Date().toISOString(),
    approved_by: user?.id ?? null,
  };

  const { error } = await getSupabase().from("profiles").update(payload).eq("id", profileId);
  throwIfError(error, "approve profile");
}

async function rejectProfile(profileId) {
  const { error } = await getSupabase()
    .from("profiles")
    .update({ status: "rejected", role: null, team_id: null })
    .eq("id", profileId);

  throwIfError(error, "reject profile");
}

async function updateApprovedProfile(profileId, role, teamId = null) {
  const payload = {
    role,
    team_id: role === "team_member" ? teamId : null,
  };

  const { error } = await getSupabase().from("profiles").update(payload).eq("id", profileId);
  throwIfError(error, "update profile");
}

async function deleteUserAccount(profileId) {
  const { error } = await getSupabase().rpc("delete_user_account", {
    target_user_id: profileId,
  });

  throwIfError(error, "delete user");
}

async function fetchActivityLog({ category = null, search = null, limit = 50, offset = 0 } = {}) {
  let query = getSupabase()
    .from("activity_log")
    .select("id, created_at, actor_id, actor_name, category, action, summary, metadata")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (category) query = query.eq("category", category);
  if (search) query = query.ilike("summary", `%${search}%`);

  const { data, error } = await query;
  throwIfError(error, "load activity log");

  return (data ?? []).map((row) => ({
    id: row.id,
    createdAt: row.created_at,
    actorId: row.actor_id,
    actorName: row.actor_name,
    category: row.category,
    action: row.action,
    summary: row.summary,
    metadata: row.metadata ?? {},
  }));
}

async function adminInviteUser({ email, fullName, role, teamId = null, autoApprove = true }) {
  const profile = typeof getCurrentProfile === "function" ? getCurrentProfile() : null;
  const emailNorm = email.trim().toLowerCase();

  if (!emailNorm || !fullName.trim()) {
    throw new Error("Email and full name are required.");
  }
  if (role === "team_member" && !teamId) {
    throw new Error("Select a team for team member invites.");
  }

  const { error: inviteError } = await getSupabase().from("admin_invites").upsert({
    email: emailNorm,
    full_name: fullName.trim(),
    role,
    team_id: role === "team_member" ? teamId : null,
    auto_approve: autoApprove,
    created_by: profile?.id ?? null,
  });

  if (inviteError?.code === "42P01") {
    throw new Error("Run sql/07_feedback_features.sql in Supabase to enable user invites.");
  }
  throwIfError(inviteError, "save invite");

  try {
    await getSupabase().rpc("write_activity_log", {
      p_category: "user",
      p_action: "invite",
      p_summary: `${profile?.fullName || profile?.email || "Admin"} invited ${emailNorm} as ${role}`,
      p_metadata: { email: emailNorm, role, auto_approve: autoApprove },
    });
  } catch {
    /* activity log optional until migration runs */
  }

  const { error } = await getSupabase().auth.signInWithOtp({
    email: emailNorm,
    options: {
      shouldCreateUser: true,
      data: {
        full_name: fullName.trim(),
        requested_role: role === "team_member" ? "team_member" : "inspector",
        requested_team_id: teamId || "",
      },
    },
  });

  throwIfError(error, "send invite email");
}
