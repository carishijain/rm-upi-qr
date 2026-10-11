import { initTheme } from "./theme.js";

initTheme();

// Every actual lockout/session decision is made by the server (see
// functions/api/auth/*.js), using the server's own clock — this file only
// displays what the server reports. Changing this device's date/time has no
// effect on whether an unlock attempt is accepted.

const STATUS_RESYNC_MS = 30000; // keep the on-screen countdown honest even if this device's clock drifts

const els = {
  gate: document.getElementById("auth-gate"),
  form: document.getElementById("auth-form"),
  passwordInput: document.getElementById("auth-password"),
  submitBtn: document.getElementById("auth-submit"),
  error: document.getElementById("auth-error"),
  locked: document.getElementById("auth-locked"),
  countdown: document.getElementById("auth-countdown"),
};

let countdownTimer = null;
let resyncTimer = null;
let entered = false; // guards against entering twice (e.g. a stray resync after success)

function showForm(message) {
  clearInterval(countdownTimer);
  clearTimeout(resyncTimer);
  els.form.classList.remove("hidden");
  els.locked.classList.add("hidden");
  if (message) {
    els.error.textContent = message;
    els.error.classList.remove("hidden");
  } else {
    els.error.classList.add("hidden");
  }
  els.passwordInput.value = "";
  els.passwordInput.focus();
}

function formatCountdown(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds));
  const hh = String(Math.floor(s / 3600)).padStart(2, "0");
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function showLocked(secondsRemaining) {
  els.form.classList.add("hidden");
  els.locked.classList.remove("hidden");

  clearInterval(countdownTimer);
  let remaining = secondsRemaining;
  els.countdown.textContent = formatCountdown(remaining);
  countdownTimer = setInterval(() => {
    remaining -= 1;
    els.countdown.textContent = formatCountdown(Math.max(0, remaining));
    if (remaining <= 0) {
      clearInterval(countdownTimer);
      checkStatus(); // ask the server for the real state rather than assuming unlocked
    }
  }, 1000);

  clearTimeout(resyncTimer);
  resyncTimer = setTimeout(checkStatus, STATUS_RESYNC_MS);
}

async function enterHistory() {
  if (entered) return;
  entered = true;
  clearInterval(countdownTimer);
  clearTimeout(resyncTimer);
  els.gate.classList.add("hidden");
  const mod = await import("./history-20261003.js");
  mod.init();
}

async function checkStatus() {
  try {
    const res = await fetch("/api/auth/status");
    const data = await res.json();
    if (data.authenticated) {
      await enterHistory();
    } else if (data.locked) {
      showLocked(data.secondsRemaining);
    } else {
      showForm();
    }
  } catch {
    showForm("Couldn't reach the server — check your connection.");
  }
}

async function submitPassword() {
  const password = els.passwordInput.value;
  if (!password) return;
  els.submitBtn.disabled = true;

  try {
    const res = await fetch("/api/auth/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const data = await res.json();

    if (data.success) {
      await enterHistory();
      return;
    }
    if (data.locked) {
      // Ask the server for the authoritative remaining time rather than
      // computing it from lockedUntil against this device's own clock.
      await checkStatus();
    } else {
      const left = data.attemptsRemaining;
      showForm(`Wrong password. ${left} attempt${left === 1 ? "" : "s"} left.`);
    }
  } catch {
    showForm("Couldn't reach the server — check your connection.");
  } finally {
    els.submitBtn.disabled = false;
  }
}

els.submitBtn.addEventListener("click", submitPassword);
els.passwordInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") submitPassword();
});

checkStatus();
