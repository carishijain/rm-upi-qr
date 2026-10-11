// The opening loading screen. The gearbox animation itself is pure CSS
// (see the "#app-loader" rules in the stylesheet) — this file's only job is
// timing: show it for 4 seconds, then fade it out and remove it. Nothing
// here depends on canvas, custom drawing math, or per-frame JavaScript, so
// there's very little that can go wrong across browsers/devices.

const SHOW_DURATION_MS = 4000;
const FADE_MS = 400; // must match the .app-loader transition duration in CSS

function initLoader() {
  const root = document.getElementById("app-loader");
  if (!root) return;

  setTimeout(() => {
    root.classList.add("fade-out");
    setTimeout(() => root.remove(), FADE_MS);
  }, SHOW_DURATION_MS);
}

initLoader();
