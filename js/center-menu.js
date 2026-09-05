// ---------------------------------------------------------------------------
// CENTER SATELLITES + EVENT-SUBMISSION PLANE
// ---------------------------------------------------------------------------
let submissionActive = false;
const satelliteOrbits = [...document.querySelectorAll(".center-orbit-control")];
const satelliteButtons = satelliteOrbits
  .map(control => control.querySelector(".satellite-button"))
  .filter(Boolean);

// Keep the revealed control chain attached to the actual rendered Subscribe circle.
// This intentionally follows any visual drift of the green circle rather than assuming
// its center is permanently at 50% / 50% of the viewport.
function syncMenuToSubscribe() {
  if (!centerPlane || !subscribeButton) return;
  const planeRect = centerPlane.getBoundingClientRect();
  const buttonRect = subscribeButton.getBoundingClientRect();
  const buttonCenterX = buttonRect.left + buttonRect.width / 2;
  const buttonCenterY = buttonRect.top + buttonRect.height / 2;
  const planeCenterX = planeRect.left + planeRect.width / 2;
  const planeCenterY = planeRect.top + planeRect.height / 2;
  const dx = buttonCenterX - planeCenterX;
  const dy = buttonCenterY - planeCenterY;
  centerPlane.style.setProperty("--menu-drift-x", `${dx.toFixed(2)}px`);
  centerPlane.style.setProperty("--menu-drift-y", `${dy.toFixed(2)}px`);
}
function runMenuAnchorSync() {
  syncMenuToSubscribe();
  requestAnimationFrame(runMenuAnchorSync);
}
runMenuAnchorSync();

// The controls stay physically tucked behind Subscribe until the center menu is hovered.
// Keep the menu open while the pointer travels from the green circle across any satellite.
const MENU_CLOSE_DELAY_MS = 110;
let menuCloseTimer = null;
function openCenterMenu() {
  clearTimeout(menuCloseTimer);
  centerPlane.classList.add("is-menu-open");
}
function scheduleCenterMenuClose() {
  clearTimeout(menuCloseTimer);
  menuCloseTimer = window.setTimeout(() => {
    if (!centerPlane.matches(":hover") && !centerPlane.matches(":focus-within")) {
      centerPlane.classList.remove("is-menu-open");
    }
  }, MENU_CLOSE_DELAY_MS);
}
subscribeButton.addEventListener("pointerenter", openCenterMenu);
centerPlane.addEventListener("pointerenter", openCenterMenu);
centerPlane.addEventListener("pointerleave", scheduleCenterMenuClose);


// Temporary inner ring: reveal immediately on hover. The contextual ring and
// its label share the same extremely slow orbit, with the label sitting one
// email-style text gap outside the temporary line. While it is present, all
// live orbital rings ease outward by one slot.
// Leaving fades the ring and restores the original layout.
const hoverInfoRing = document.getElementById("hoverInfoRing");
const hoverInfoRingText = document.getElementById("hoverInfoRingText");
const hoverRingLabels = {
  about: "about",
  contact: "contact",
  highlight: "highlight",
  orbit: "orbit",
  spiral: "spiral",
  submit: "submit event"
};
satelliteOrbits.forEach(control => {
  const button = control.querySelector(".satellite-button");
  if (!button) return;
  const hideHoverRing = () => {
    if (hoverInfoRing) hoverInfoRing.classList.remove("is-visible");
    if (temporaryHoverRingActive) {
      temporaryHoverRingActive = false;
      layoutRings();
    }
  };
  button.addEventListener("pointerenter", () => {
    if (!hoverInfoRing || !hoverInfoRingText) return;
    const controlName = control.dataset.control || "";
    hoverInfoRingText.textContent = hoverRingLabels[controlName] || controlName;
    if (!temporaryHoverRingActive) {
      temporaryHoverRingActive = true;
      layoutRings();
    }
    hoverInfoRing.classList.add("is-visible");
  });
  button.addEventListener("pointerleave", hideHoverRing);
  button.addEventListener("blur", hideHoverRing);
});

// Gentle magnetic hover: each revealed circle drifts a few pixels in the cursor's
// direction. Influence fades toward the rim and grows gradually toward the center.
satelliteButtons.forEach(button => {
  let lastAngle = 0;
  button.addEventListener("pointermove", event => {
    const rect = button.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = event.clientX - cx;
    const dy = event.clientY - cy;
    const radius = Math.max(1, Math.min(rect.width, rect.height) / 2);
    const distance = Math.hypot(dx, dy);
    if (distance > 0.6) lastAngle = Math.atan2(dy, dx);
    const normalized = Math.min(1, distance / radius);
    const influence = Math.pow(1 - normalized, 1.45);
    // Soft center dead-zone: movement ramps down near the middle so tiny pointer
    // changes do not cause rapid direction flips/jitter.
    const centerEase = Math.min(1, normalized / 0.28);
    const maxShift = Math.min(8.25, radius * 0.18);
    const shift = maxShift * influence * centerEase;
    button.style.setProperty("--hover-x", `${Math.cos(lastAngle) * shift}px`);
    button.style.setProperty("--hover-y", `${Math.sin(lastAngle) * shift}px`);
  });
  button.addEventListener("pointerleave", () => {
    button.style.setProperty("--hover-x", "0px");
    button.style.setProperty("--hover-y", "0px");
  });
});
// Subscribe uses the same magnetic idea, but more restrained: 25% more travel
// than the original magnetic amount and 15% enlargement on hover.
let subscribeLastAngle = 0;
subscribeButton.addEventListener("pointermove", event => {
  const rect = subscribeButton.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const dx = event.clientX - cx;
  const dy = event.clientY - cy;
  const radius = Math.max(1, Math.min(rect.width, rect.height) / 2);
  const distance = Math.hypot(dx, dy);
  if (distance > 0.6) subscribeLastAngle = Math.atan2(dy, dx);
  const normalized = Math.min(1, distance / radius);
  const influence = Math.pow(1 - normalized, 1.45);
  const centerEase = Math.min(1, normalized / 0.30);
  const maxShift = Math.min(6.875, radius * 0.15);
  const shift = maxShift * influence * centerEase;
  subscribeButton.style.setProperty("--subscribe-hover-x", `${Math.cos(subscribeLastAngle) * shift}px`);
  subscribeButton.style.setProperty("--subscribe-hover-y", `${Math.sin(subscribeLastAngle) * shift}px`);
});
subscribeButton.addEventListener("pointerleave", () => {
  subscribeButton.style.setProperty("--subscribe-hover-x", "0px");
  subscribeButton.style.setProperty("--subscribe-hover-y", "0px");
});


// Orbit toggle: pause/resume every native-SVG orbital rotation without
// changing ring geometry or the camera. The current angles are preserved.
// The site intentionally begins static, so the first click starts the orbit.
function syncOrbitToggleUi() {
  if (!orbitToggleButton) return;
  orbitToggleButton.setAttribute("aria-pressed", orbitPausedByUser ? "true" : "false");
  orbitToggleButton.setAttribute("aria-label", orbitPausedByUser ? "Resume ring orbit" : "Pause ring orbit");
  orbitToggleButton.classList.toggle("is-paused", orbitPausedByUser);
}

if (orbitToggleButton) {
  syncOrbitToggleUi();
  orbitToggleButton.addEventListener("click", event => {
    event.stopPropagation();
    orbitPausedByUser = !orbitPausedByUser;
    syncOrbitToggleUi();
    // Clicking a satellite gives it keyboard focus, and :focus-within used to
    // keep the whole chain expanded after the pointer left. Release that click
    // focus so normal hover-leave collapse happens again.
    releaseCenterControlFocus(orbitToggleButton);
  });
}

// Highlight card: the circle itself remains in front and becomes the close
// control while the translucent portrait panel is open.
function setHighlightOpen(open) {
  if (!highlightPanel || !highlightButton) return;
  highlightPanel.classList.toggle("is-open", open);
  highlightPanel.setAttribute("aria-hidden", open ? "false" : "true");
  highlightButton.setAttribute("aria-expanded", open ? "true" : "false");
  highlightButton.setAttribute("aria-label", open ? "Close highlight" : "Open highlight");
  if (mobileHighlightLink) {
    mobileHighlightLink.setAttribute("aria-expanded", open ? "true" : "false");
    mobileHighlightLink.setAttribute("aria-label", open ? "Close highlight" : "Open highlight");
  }
  centerPlane.classList.toggle("is-highlight-open", open);
  document.body.classList.toggle("is-highlight-open", open);
}
if (highlightButton) {
  highlightButton.addEventListener("click", event => {
    event.stopPropagation();
    if (typeof setFeelingLostOpen === "function") setFeelingLostOpen(false);
    setHighlightOpen(!highlightPanel.classList.contains("is-open"));
    openCenterMenu();
  });
}
if (mobileHighlightLink) {
  mobileHighlightLink.addEventListener("click", event => {
    event.stopPropagation();
    if (typeof setFeelingLostOpen === "function") setFeelingLostOpen(false);
    setHighlightOpen(!highlightPanel.classList.contains("is-open"));
  });
}

// The Highlight card can also be dismissed by clicking/tapping anywhere outside
// the card. The desktop Highlight circle and mobile Highlight link are excluded
// so they keep their existing toggle behavior.
document.addEventListener("pointerdown", event => {
  if (!highlightPanel?.classList.contains("is-open")) return;
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (highlightPanel.contains(target)) return;
  if (highlightButton?.contains(target)) return;
  if (mobileHighlightLink?.contains(target)) return;
  setHighlightOpen(false);
}, true);

// Quiet fallback navigation: reveal the help link after eight seconds on the page.
// Once revealed, it remains available for the rest of the visit, including after Spiral.
if (feelingLostLink) {
  window.setTimeout(() => feelingLostLink.classList.add("is-visible"), 8000);
}

function setFeelingLostOpen(open) {
  if (!feelingLostPanel || !feelingLostLink) return;
  if (open && highlightPanel?.classList.contains("is-open")) setHighlightOpen(false);
  feelingLostPanel.classList.toggle("is-open", open);
  feelingLostPanel.setAttribute("aria-hidden", open ? "false" : "true");
  feelingLostLink.setAttribute("aria-expanded", open ? "true" : "false");
  if (feelingLostBackdrop) {
    feelingLostBackdrop.classList.toggle("is-open", open);
    feelingLostBackdrop.setAttribute("aria-hidden", open ? "false" : "true");
  }
  document.body.classList.toggle("is-feeling-lost-open", open);
}

if (feelingLostLink) {
  feelingLostLink.addEventListener("click", event => {
    event.stopPropagation();
    setFeelingLostOpen(!feelingLostPanel.classList.contains("is-open"));
  });
}

// Clicking anywhere outside the guide lands on this backdrop, so the panel
// closes without triggering controls in the scene underneath it.
if (feelingLostBackdrop) {
  feelingLostBackdrop.addEventListener("click", () => setFeelingLostOpen(false));
}

const EVENT_FIELDS = [
  { key: "event-name", label: "event", type: "text" },
  { key: "date", label: "date (month/day/year)", type: "date-text" },
  { key: "time", label: "time (0:00-0:00 am/pm)", type: "time-text" },
  { key: "location", label: "location", type: "text" },
  { key: "description", label: "description", type: "textarea" },
  { key: "link", label: "link/contact", type: "url", optional: true },
  { key: "keep-contact-private", label: "keep contact private", type: "checkbox" }
];
let visibleFieldCount = 0;
let typingToken = 0;
let eventSubmitting = false;

