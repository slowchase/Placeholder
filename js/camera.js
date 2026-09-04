// Camera-like zoom. Scroll down = pull back, scroll up = move closer.
//
// Stage 1 flicker fix: the SVG viewBox stays permanently fixed at 0 0 800 800.
// Zoom is applied to one SVG <g> camera layer, keeping the coordinate system
// stable while the individual rings continue their existing rotations.
const MIN_ZOOM = 0.42;
const MAX_ZOOM = 1.08;
const CAMERA_CENTER = 400;
const ZOOM_EPSILON = 0.00035;
let currentZoom = 1;
let targetZoom = 1;
let currentPlaneTilt = 0;
let targetPlaneTilt = 0;
let planeTilt = 0;
let zoomFrame = null;
let lastRenderedZoom = null;
let lastRenderedTilt = null;

function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

// Compatibility hook retained intentionally. Earlier builds repositioned satellites
// here; the current fixed horizontal composition is handled entirely by CSS while
// camera scaling applies to the whole center control system. Keeping the hook avoids
// changing the established camera call sequence during this conservative cleanup.
function updateSatellitePositions(zoom) {
  void zoom;
}

function renderCameraZoom(value, tilt = currentPlaneTilt) {
  const safeZoom = clamp(value, MIN_ZOOM, MAX_ZOOM);
  const safeTilt = clamp(tilt, 0, 1);
  const zoomChanged = lastRenderedZoom === null || Math.abs(safeZoom - lastRenderedZoom) >= 0.00008;
  const tiltChanged = lastRenderedTilt === null || Math.abs(safeTilt - lastRenderedTilt) >= 0.00008;
  if (!zoomChanged && !tiltChanged) return;

  // Keep the SVG viewBox fixed. One SVG transform now owns camera zoom.
  // Rounding prevents imperceptible sub-pixel changes from forcing extra paints.
  const roundedZoom = Number(safeZoom.toFixed(4));
  cameraLayer.setAttribute(
    "transform",
    `translate(${CAMERA_CENTER} ${CAMERA_CENTER}) scale(${roundedZoom}) translate(${-CAMERA_CENTER} ${-CAMERA_CENTER})`
  );

  // HTML center controls live outside the SVG, so mirror the same zoom there.
  solarSystem.style.setProperty("--camera-zoom", roundedZoom.toFixed(4));
  const planeScaleY = 1 - safeTilt * 0.988;
  solarSystem.style.setProperty("--plane-scale-y", planeScaleY.toFixed(5));
  updateSatellitePositions(safeZoom);
  planeTilt = safeTilt;

  // At the exact edge-on state, exchange the geometric line for the static
  // event-name input. If the user scrolls back up, restore the geometry first.
  if (safeTilt >= 0.997 && !submissionActive) {
    showEventSubmissionAtEdge();
  } else if (safeTilt < 0.965 && submissionActive) {
    hideEventSubmissionForTilt();
  }

  lastRenderedZoom = safeZoom;
  lastRenderedTilt = safeTilt;
}

function requestZoomFrame() {
  if (zoomFrame) return;
  const tick = () => {
    const zoomDiff = targetZoom - currentZoom;
    const tiltDiff = targetPlaneTilt - currentPlaneTilt;

    const zoomDone = Math.abs(zoomDiff) <= ZOOM_EPSILON;
    const tiltDone = Math.abs(tiltDiff) <= 0.00045;

    if (zoomDone) currentZoom = targetZoom;
    else currentZoom = clamp(currentZoom + zoomDiff * 0.085, MIN_ZOOM, MAX_ZOOM);

    if (tiltDone) currentPlaneTilt = targetPlaneTilt;
    else currentPlaneTilt = clamp(currentPlaneTilt + tiltDiff * 0.11, 0, 1);

    renderCameraZoom(currentZoom, currentPlaneTilt);

    if (zoomDone && tiltDone) {
      zoomFrame = null;
      return;
    }
    zoomFrame = requestAnimationFrame(tick);
  };
  zoomFrame = requestAnimationFrame(tick);
}

function applyScrollDelta(deltaY) {
  const direction = Math.sign(deltaY);
  const magnitude = Math.min(70, Math.abs(deltaY));
  const zoomStep = 0.018 + magnitude * 0.0007;
  const tiltStep = 0.018 + magnitude * 0.00125;

  if (direction > 0) {
    if (targetZoom > MIN_ZOOM + ZOOM_EPSILON && targetPlaneTilt <= 0.001) {
      targetZoom = clamp(targetZoom - zoomStep, MIN_ZOOM, MAX_ZOOM);
    } else {
      targetZoom = MIN_ZOOM;
      targetPlaneTilt = clamp(targetPlaneTilt + tiltStep, 0, 1);
    }
  } else if (direction < 0) {
    if (targetPlaneTilt > 0.001) {
      targetPlaneTilt = clamp(targetPlaneTilt - tiltStep, 0, 1);
    } else {
      targetPlaneTilt = 0;
      targetZoom = clamp(targetZoom + zoomStep, MIN_ZOOM, MAX_ZOOM);
    }
  }
  requestZoomFrame();
}

viewport.addEventListener("wheel", event => {
  event.preventDefault();
  if (document.body.classList.contains("is-feeling-lost-open")) {
    const guide = event.target.closest?.(".feeling-lost-panel");
    if (guide) guide.scrollTop += event.deltaY;
    return;
  }
  if (submissionActive && eventSubmission.classList.contains("is-reviewable")) {
    eventSubmission.scrollTop += event.deltaY;
    return;
  }
  applyScrollDelta(event.deltaY);
}, { passive: false });

let lastTouchY = null;
viewport.addEventListener("touchstart", event => {
  if (document.body.classList.contains("is-feeling-lost-open") && !event.target.closest?.(".feeling-lost-panel")) {
    lastTouchY = null;
    return;
  }
  if (event.touches.length === 1) lastTouchY = event.touches[0].clientY;
}, { passive: false });

viewport.addEventListener("touchmove", event => {
  if (event.touches.length !== 1 || lastTouchY == null) return;
  event.preventDefault();
  const y = event.touches[0].clientY;
  const dy = y - lastTouchY;
  lastTouchY = y;
  if (document.body.classList.contains("is-feeling-lost-open")) {
    const guide = event.target.closest?.(".feeling-lost-panel");
    if (guide) guide.scrollTop -= dy;
    return;
  }
  if (submissionActive && eventSubmission.classList.contains("is-reviewable")) {
    eventSubmission.scrollTop -= dy;
    return;
  }
  applyScrollDelta(-dy * 1.35);
}, { passive: false });

viewport.addEventListener("touchend", () => { lastTouchY = null; });

renderCameraZoom(currentZoom, currentPlaneTilt);

