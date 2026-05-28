function compareCarNumbers(a, b) {
  const na = parseInt(a, 10);
  const nb = parseInt(b, 10);
  if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
  return String(a).localeCompare(String(b), undefined, { numeric: true });
}

function sortTeamsByCarNumber(teams) {
  return [...teams].sort((a, b) => compareCarNumbers(a.carNumber, b.carNumber));
}

function formatTeamFilterLabel(team) {
  return `${team.carNumber} - ${team.teamName}`;
}

function fillTeamSelect(select, teams, { selectedValue = "all", includeAll = true } = {}) {
  if (!select) return;

  const current = selectedValue || select.value;
  const sorted = sortTeamsByCarNumber(teams);

  select.innerHTML = includeAll ? '<option value="all">All teams</option>' : "";

  for (const team of sorted) {
    const opt = document.createElement("option");
    opt.value = team.id;
    opt.textContent = formatTeamFilterLabel(team);
    select.appendChild(opt);
  }

  const stillValid = [...select.options].some((o) => o.value === current);
  select.value = stillValid ? current : includeAll ? "all" : select.options[0]?.value ?? "all";
}
