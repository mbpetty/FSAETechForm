document.addEventListener("DOMContentLoaded", async () => {
  if (await redirectIfAuthenticated()) return;

  bindOtpForm({
    emailInputId: "login-email",
    codeStepId: "login-code-step",
    sendBtnId: "login-send-btn",
    verifyBtnId: "login-verify-btn",
    onSend: sendLoginOtp,
    onVerified: async (profile) => {
      if (!profile) {
        showAuthMessage("Account not found. Please sign up first.", true);
        return;
      }
      if (profile.status === "pending") {
        window.location.href = "pending.html";
        return;
      }
      if (profile.status === "rejected") {
        window.location.href = "pending.html?rejected=1";
        return;
      }
      const redirect = buildRedirectUrl();
      window.location.href = redirect || getHomeUrl(profile);
    },
  });
});
