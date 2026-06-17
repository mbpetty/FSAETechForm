let currentProfile = null;

/** Supabase projects may send 6- or 8-digit email OTP depending on dashboard settings. */
const OTP_LENGTH = 8;

const ROLE_LABELS = {
  admin: "Admin",
  inspector: "Inspector",
  team_member: "Team member",
};

function escapeHtml(text) {
  const el = document.createElement("span");
  el.textContent = text;
  return el.innerHTML;
}

function getHomeUrl(profile) {
  if (!profile || profile.status !== "approved") return "pending.html";
  switch (profile.role) {
    case "admin":
      return "dashboard.html";
    case "inspector":
      return "index.html";
    case "team_member":
      return "team.html";
    default:
      return "pending.html";
  }
}

function getRoleLabel(role) {
  return ROLE_LABELS[role] ?? role;
}

async function getSession() {
  const { data, error } = await getSupabase().auth.getSession();
  throwIfError(error, "get session");
  return data.session;
}

async function loadProfile(force = false) {
  if (currentProfile && !force) return currentProfile;

  const session = await getSession();
  if (!session) {
    currentProfile = null;
    return null;
  }

  const { data, error } = await getSupabase()
    .from("profiles")
    .select("*")
    .eq("id", session.user.id)
    .maybeSingle();

  throwIfError(error, "load profile");

  if (!data) {
    currentProfile = null;
    return null;
  }

  currentProfile = normalizeProfile(data);
  return currentProfile;
}

function normalizeProfile(row) {
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

function getCurrentProfile() {
  return currentProfile;
}

async function sendLoginOtp(email) {
  const { error } = await getSupabase().auth.signInWithOtp({
    email: email.trim().toLowerCase(),
    options: { shouldCreateUser: false },
  });

  if (error) {
    if (isUnknownUserLoginError(error)) {
      throw Object.assign(new Error(formatLoginError(error)), { signupRequired: true });
    }
    throw new Error(error.message || "Could not send login code.");
  }
}

function isUnknownUserLoginError(error) {
  const msg = String(error?.message ?? "").toLowerCase();
  const code = String(error?.code ?? "").toLowerCase();

  return (
    msg.includes("user not found") ||
    msg.includes("not registered") ||
    msg.includes("no user") ||
    msg.includes("signups not allowed") ||
    msg.includes("otp not available") ||
    msg.includes("signup is disabled") ||
    code === "otp_disabled"
  );
}

function formatLoginError(error) {
  if (isUnknownUserLoginError(error)) {
    return "No account found for that email. Sign up first, then log in after an admin approves you.";
  }

  return error.message || "Could not send login code.";
}

async function sendSignupOtp(email, metadata) {
  const { error } = await getSupabase().auth.signInWithOtp({
    email: email.trim().toLowerCase(),
    options: {
      shouldCreateUser: true,
      data: {
        full_name: metadata.fullName,
        requested_role: metadata.requestedRole,
        requested_team_id: metadata.requestedTeamId || "",
      },
    },
  });
  throwIfError(error, "send signup code");
}

function normalizeOtpToken(raw) {
  return String(raw ?? "").replace(/\D/g, "");
}

function isValidOtpToken(token) {
  return /^[0-9]{6,8}$/.test(token);
}

async function verifyEmailOtp(email, token) {
  const normalized = normalizeOtpToken(token);
  if (!isValidOtpToken(normalized)) {
    throw new Error(`Enter the full code from your email (${OTP_LENGTH} digits).`);
  }

  const { data, error } = await getSupabase().auth.verifyOtp({
    email: email.trim().toLowerCase(),
    token: normalized,
    type: "email",
  });
  throwIfError(error, "verify code");
  currentProfile = null;
  await loadProfile(true);
  return data;
}

async function signOut() {
  const { error } = await getSupabase().auth.signOut();
  throwIfError(error, "sign out");
  currentProfile = null;
  window.location.href = "login.html";
}

function buildRedirectUrl() {
  const params = new URLSearchParams(window.location.search);
  const redirect = params.get("redirect");
  if (redirect && !redirect.includes("login") && !redirect.includes("signup")) {
    return redirect.startsWith("/") ? redirect.slice(1) : redirect;
  }
  return null;
}

async function requireAuth({ roles = null, allowPending = false } = {}) {
  const session = await getSession();
  if (!session) {
    const redirect = encodeURIComponent(window.location.pathname.split("/").pop() || "index.html");
    window.location.href = `login.html?redirect=${redirect}`;
    return null;
  }

  const profile = await loadProfile(true);
  if (!profile) {
    window.location.href = "login.html";
    return null;
  }

  if (profile.status === "pending" || profile.status === "rejected") {
    if (!allowPending) {
      window.location.href =
        profile.status === "rejected" ? "pending.html?rejected=1" : "pending.html";
      return null;
    }
  }

  if (profile.status === "approved" && roles?.length && !roles.includes(profile.role)) {
    window.location.href = getHomeUrl(profile);
    return null;
  }

  return profile;
}

async function redirectIfAuthenticated() {
  const session = await getSession();
  if (!session) return false;

  const profile = await loadProfile(true);
  if (!profile) return false;

  if (profile.status === "pending") {
    window.location.href = "pending.html";
    return true;
  }

  if (profile.status === "rejected") {
    window.location.href = "pending.html?rejected=1";
    return true;
  }

  const customRedirect = buildRedirectUrl();
  window.location.href = customRedirect || getHomeUrl(profile);
  return true;
}

function renderAuthHeader(profile, currentPage) {
  const nav = document.querySelector(".header-nav");
  if (!nav) return;

  const links = [];
  if (profile.status === "approved") {
    if (profile.role === "admin" || profile.role === "inspector") {
      if (currentPage !== "inspector") {
        links.push({ href: "index.html", label: "Inspector" });
      }
      if (currentPage !== "dashboard") {
        links.push({ href: "dashboard.html", label: "Dashboard" });
      }
    }
    if (profile.role === "admin" && currentPage !== "admin") {
      links.push({ href: "admin.html", label: "Admin" });
    }
    if (currentPage !== "faq") {
      links.push({ href: "faq.html", label: "FAQ" });
    }
    if (profile.role === "team_member" && currentPage !== "team") {
      links.push({ href: "team.html", label: "My team" });
    }
  }

  nav.innerHTML = `
    ${links.map((l) => `<a class="header-link" href="${l.href}">${l.label}</a>`).join("")}
    <span class="auth-user-chip">
      <span class="auth-user-name">${escapeHtml(profile.fullName || profile.email)}</span>
      <span class="auth-user-role">${escapeHtml(getRoleLabel(profile.role || profile.requestedRole))}</span>
    </span>
    <button type="button" class="header-link btn-logout" id="logout-btn">Log out</button>
  `;

  document.getElementById("logout-btn")?.addEventListener("click", () => signOut());

  // Add floating feedback button at the bottom (mobile friendly)
  addFloatingFeedbackButton();
}

function addFloatingFeedbackButton() {
  // Remove any existing one first
  const existing = document.getElementById("floating-feedback-btn");
  if (existing) existing.remove();

  const btn = document.createElement("button");
  btn.id = "floating-feedback-btn";
  btn.textContent = "Feedback";
  btn.className = "floating-feedback-btn";
  btn.addEventListener("click", () => openFeedbackModal());

  document.body.appendChild(btn);
}

function bindOtpForm({ emailInputId, codeStepId, sendBtnId, verifyBtnId, onSend, onVerified }) {
  const emailInput = document.getElementById(emailInputId);
  const codeStep = document.getElementById(codeStepId);
  const sendBtn = document.getElementById(sendBtnId);
  const verifyBtn = document.getElementById(verifyBtnId);
  const codeInput = document.getElementById("otp-code");
  let pendingEmail = "";

  emailInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      sendBtn.click();
    }
  });

  sendBtn.addEventListener("click", async () => {
    const email = emailInput.value.trim();
    if (!email) return;
    sendBtn.disabled = true;
    sendBtn.textContent = "Sending…";
    try {
      await onSend(email);
      pendingEmail = email;
      codeStep.hidden = false;
      codeInput?.focus();
      showAuthMessage(
        `Check your email for an ${OTP_LENGTH}-digit code. Type it here on this device — do not use the link.`,
        false
      );
    } catch (err) {
      if (err.signupRequired) {
        showAuthMessage(
          'No account found for that email. <a href="signup.html">Sign up here</a>, then log in after an admin approves you.',
          true,
          { html: true }
        );
      } else {
        showAuthMessage(err.message, true);
      }
    } finally {
      sendBtn.disabled = false;
      sendBtn.textContent = "Send code";
    }
  });

  codeInput?.addEventListener("input", () => {
    codeInput.value = normalizeOtpToken(codeInput.value).slice(0, OTP_LENGTH);
  });

  codeInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      verifyBtn.click();
    }
  });

  verifyBtn.addEventListener("click", async () => {
    const code = normalizeOtpToken(codeInput?.value);
    if (!pendingEmail || !code) return;
    if (!isValidOtpToken(code)) {
      showAuthMessage(`Enter the full ${OTP_LENGTH}-digit code from your email.`, true);
      return;
    }
    verifyBtn.disabled = true;
    verifyBtn.textContent = "Verifying…";
    try {
      await verifyEmailOtp(pendingEmail, code);
      await onVerified(await loadProfile(true));
    } catch (err) {
      showAuthMessage(err.message, true);
    } finally {
      verifyBtn.disabled = false;
      verifyBtn.textContent = "Verify & continue";
    }
  });
}

function showAuthMessage(message, isError = false, { html = false } = {}) {
  const el = document.getElementById("auth-message");
  if (!el) return;
  if (html) el.innerHTML = message;
  else el.textContent = message;
  el.classList.toggle("is-error", isError);
  el.hidden = !message;
}

function openFeedbackModal() {
  const existing = document.getElementById("feedback-modal");
  if (existing) existing.remove();

  const modal = document.createElement("div");
  modal.id = "feedback-modal";
  modal.innerHTML = `
    <div class="modal-backdrop"></div>
    <div class="modal-content feedback-modal">
      <h3>Send feedback</h3>
      <label>
        <span>Category</span>
        <select id="feedback-category">
          <option value="bug">Bug / something broken</option>
          <option value="feature">Feature request</option>
          <option value="other">Other</option>
        </select>
      </label>
      <label>
        <span>Message</span>
        <textarea id="feedback-message" rows="5" placeholder="What would you like us to know?"></textarea>
      </label>
      <div class="modal-actions">
        <button type="button" class="btn-secondary" id="feedback-cancel">Cancel</button>
        <button type="button" class="btn-primary" id="feedback-submit">Send</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  modal.querySelector("#feedback-cancel").addEventListener("click", () => modal.remove());
  modal.querySelector(".modal-backdrop").addEventListener("click", () => modal.remove());

  modal.querySelector("#feedback-submit").addEventListener("click", async () => {
    const category = modal.querySelector("#feedback-category").value;
    const message = modal.querySelector("#feedback-message").value.trim();
    if (!message) {
      alert("Please enter a message.");
      return;
    }

    const profile = getCurrentProfile();
    try {
      const { error } = await getSupabase().from("feedback").insert({
        user_id: profile?.id || null,
        user_name: profile?.fullName || null,
        user_email: profile?.email || null,
        category,
        message,
      });
      if (error) throw error;
      modal.remove();
      alert("Thank you! Your feedback has been sent.");
    } catch (err) {
      alert("Could not send feedback: " + err.message);
    }
  });
}
