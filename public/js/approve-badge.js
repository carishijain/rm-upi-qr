// A small dismissible reminder on the home page, after 11pm IST each day,
// nudging the owner to go mark that day's transactions Done/Ignore. Purely
// a reminder (no security/anti-tamper concerns here, unlike the History
// password), so it's fine for this to run on the device's own clock.

const DISMISSED_KEY = "rm-upi-qr-approve-badge-dismissed-date";
const CHECK_INTERVAL_MS = 60000; // re-check every minute, in case the tab is left open across 11pm/midnight
const EVENING_HOUR_IST = 23;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function nowIST() {
  const now = new Date();
  return new Date(now.getTime() + (5 * 60 + 30) * 60000); // UTC-getters below then read as IST wall-clock
}

function todayKeyIST() {
  const ist = nowIST();
  const pad = (n) => String(n).padStart(2, "0");
  return `${ist.getUTCFullYear()}-${pad(ist.getUTCMonth() + 1)}-${pad(ist.getUTCDate())}`;
}

function todayLabelIST() {
  const ist = nowIST();
  return `${ist.getUTCDate()} ${MONTHS[ist.getUTCMonth()]}`;
}

function isPastEveningCutoff() {
  return nowIST().getUTCHours() >= EVENING_HOUR_IST;
}

function isDismissedForToday() {
  return localStorage.getItem(DISMISSED_KEY) === todayKeyIST();
}

function dismissForToday() {
  localStorage.setItem(DISMISSED_KEY, todayKeyIST());
}

function initApproveBadge() {
  const badge = document.getElementById("approve-badge");
  const text = document.getElementById("approve-badge-text");
  const link = document.getElementById("approve-badge-link");
  const dismissBtn = document.getElementById("approve-badge-dismiss");
  if (!badge || !text || !link || !dismissBtn) return;

  function refresh() {
    if (isPastEveningCutoff() && !isDismissedForToday()) {
      text.textContent = `Approve ${todayLabelIST()} transactions`;
      badge.classList.remove("hidden");
    } else {
      badge.classList.add("hidden");
    }
  }

  link.addEventListener("click", () => {
    dismissForToday();
    // No preventDefault — the link navigates to History as normal; dismissal
    // just means it won't reappear on this device if they come back to the
    // home page later today.
  });

  dismissBtn.addEventListener("click", () => {
    dismissForToday();
    badge.classList.add("hidden");
  });

  refresh();
  setInterval(refresh, CHECK_INTERVAL_MS);
}

initApproveBadge();
