function getSelectedRequestedRole() {
  return document.querySelector('input[name="requested-role"]:checked')?.value ?? "inspector";
}

function readSignupMetadata() {
  const fullName = document.getElementById("signup-name").value.trim();
  const requestedRole = getSelectedRequestedRole();
  const requestedTeamId = document.getElementById("signup-team").value;

  if (!fullName) throw new Error("Enter your full name.");
  if (requestedRole === "team_member" && !requestedTeamId) {
    throw new Error("Select your team.");
  }

  return { fullName, requestedRole, requestedTeamId: requestedTeamId || null };
}

async function loadTeamsForSignup() {
  await detectDbSchema();
  await loadTeams();
  const select = document.getElementById("signup-team");
  const teams = getTeams().sort((a, b) =>
    a.carNumber.localeCompare(b.carNumber, undefined, { numeric: true })
  );

  select.innerHTML =
    '<option value="">Select team…</option>' +
    teams
      .map(
        (t) =>
          `<option value="${t.id}">#${t.carNumber} — ${t.teamName} (${getCompetitionLabel(t.competition)})</option>`
      )
      .join("");
}

document.addEventListener("DOMContentLoaded", async () => {
  if (await redirectIfAuthenticated()) return;

  try {
    await loadCompetitions();
    await loadTeamsForSignup();
  } catch (err) {
    showAuthMessage(`Could not load teams: ${err.message}`, true);
  }

  document.querySelectorAll('input[name="requested-role"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      const isTeamMember = getSelectedRequestedRole() === "team_member";
      document.getElementById("signup-team-wrap").hidden = !isTeamMember;
    });
  });

  bindOtpForm({
    emailInputId: "signup-email",
    codeStepId: "signup-code-step",
    sendBtnId: "signup-send-btn",
    verifyBtnId: "signup-verify-btn",
    onSend: async (email) => {
      const metadata = readSignupMetadata();
      await sendSignupOtp(email, metadata);
    },
    onVerified: async () => {
      window.location.href = "pending.html";
    },
  });
});
