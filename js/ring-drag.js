// ---------------------------------------------------------------------------
// STAGE 2: ONE NATIVE SVG MOTION CLOCK + TEXT DIAL DRAGGING
// ---------------------------------------------------------------------------
// CSS animation has been removed from the orbital SVG groups. A single
// requestAnimationFrame loop advances every line/text angle and writes native
// SVG transform attributes. This avoids nested CSS-composited SVG animations.

function normalizeAngle(angle) {
  return ((angle % 360) + 360) % 360;
}

function pointerAngleAroundCenter(event) {
  const point = new DOMPoint(event.clientX, event.clientY);
  const screenCTM = cameraLayer.getScreenCTM();
  if (!screenCTM) return 0;
  const svgPoint = point.matrixTransform(screenCTM.inverse());
  return Math.atan2(svgPoint.y - 400, svgPoint.x - 400) * 180 / Math.PI;
}

function shortestAngleDelta(current, previous) {
  let delta = current - previous;
  while (delta > 180) delta -= 360;
  while (delta < -180) delta += 360;
  return delta;
}

function ringMotionPaused(ring) {
  if (orbitPausedByUser) return true;
  if (spiralActive || submissionActive) return true;
  if (solarSystem.classList.contains("is-submission-flattening") ||
      solarSystem.classList.contains("is-submission-mode")) return true;
  const wrapper = ring.dom.wrapper;
  if (wrapper.classList.contains("is-hovered") || wrapper.matches(":hover")) return true;
  if (ring.kind === "email" && wrapper.classList.contains("is-email-focused")) return true;
  return false;
}

let orbitClockLast = performance.now();
function runOrbitClock(now) {
  const dt = Math.min(0.05, Math.max(0, (now - orbitClockLast) / 1000));
  orbitClockLast = now;

  for (const ring of rings) {
    if (!ring.dom || !ring.dom.wrapper.isConnected) continue;
    const paused = ringMotionPaused(ring);

    if (!paused) {
      ring.lineAngle = normalizeAngle((ring.lineAngle || 0) + (360 / (ring.lineDuration || 24)) * dt);
      if (!ring.textDragging) {
        ring.textAngle = normalizeAngle((ring.textAngle || 0) + (360 / (ring.textDuration || 33)) * dt);
      }
    }

    ring.dom.lineMotion.setAttribute("transform", `rotate(${(ring.lineAngle || 0).toFixed(4)} 400 400)`);
    ring.dom.textMotion.setAttribute("transform", `rotate(${(ring.textAngle || 0).toFixed(4)} 400 400)`);
  }

  // The contextual hover ring joins the same clock instead of owning a CSS
  // animation. It completes one revolution every 120 seconds.
  const hoverMotion = document.querySelector(".hover-info-ring__line-motion");
  if (hoverMotion) {
    if (!orbitPausedByUser && !spiralActive && !submissionActive) {
      window.__hoverInfoAngle = normalizeAngle((window.__hoverInfoAngle || 0) + (360 / 120) * dt);
    }
    hoverMotion.setAttribute("transform", `rotate(${(window.__hoverInfoAngle || 0).toFixed(4)} 400 400)`);
  }

  requestAnimationFrame(runOrbitClock);
}
requestAnimationFrame(runOrbitClock);

function installTextDrag(ring) {
  const { wrapper, textMotion, text, textHit } = ring.dom;
  const targets = [text, textHit];
  let dragging = false;
  let pointerId = null;
  let lastPointerAngle = 0;
  let draggedAngle = ring.textAngle || 0;
  let totalTravel = 0;

  function begin(event) {
    if (spiralActive || submissionActive || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();

    dragging = true;
    ring.textDragging = true;
    pointerId = event.pointerId;
    lastPointerAngle = pointerAngleAroundCenter(event);
    draggedAngle = ring.textAngle || 0;
    totalTravel = 0;

    wrapper.classList.add("is-text-dragging");
    event.currentTarget.setPointerCapture(pointerId);
  }

  function move(event) {
    if (!dragging || event.pointerId !== pointerId) return;
    event.preventDefault();
    const next = pointerAngleAroundCenter(event);
    const delta = shortestAngleDelta(next, lastPointerAngle);
    draggedAngle += delta;
    totalTravel += Math.abs(delta);
    lastPointerAngle = next;
    ring.textAngle = normalizeAngle(draggedAngle);
    textMotion.setAttribute("transform", `rotate(${ring.textAngle.toFixed(4)} 400 400)`);
  }

  function end(event) {
    if (!dragging || event.pointerId !== pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    dragging = false;
    ring.textDragging = false;
    wrapper.classList.remove("is-text-dragging");
    try { event.currentTarget.releasePointerCapture(pointerId); } catch (_) {}
    pointerId = null;

    ring._suppressClick = totalTravel > 2;
    ring.textAngle = normalizeAngle(draggedAngle);
  }

  targets.forEach(target => {
    target.addEventListener("pointerdown", begin);
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", end);
    target.addEventListener("pointercancel", end);
  });
}

let temporaryHoverRingActive = false;
const TEMPORARY_RING_PUSH = 80;

rings.forEach(createRingDom);
layoutRings(true);
function layoutRings(immediate = false) {
  rings.forEach((ring, index) => {
    // When the contextual hover ring appears, it temporarily occupies the
    // innermost visual slot and eases every live orbit outward by one slot.
    ring.targetRadius = slotRadius(index) + (temporaryHoverRingActive ? TEMPORARY_RING_PUSH : 0);
    if (immediate) ring.currentRadius = ring.targetRadius;
  });
  if (immediate) renderGeometry();
  else animateRingGeometry();
}

let geometryAnimationFrame = null;
function animateRingGeometry() {
  if (geometryAnimationFrame) return;

  const step = () => {
    let moving = false;
    for (const ring of rings) {
      const delta = ring.targetRadius - ring.currentRadius;
      if (Math.abs(delta) > 0.12) {
        ring.currentRadius += delta * 0.105;
        moving = true;
      } else {
        ring.currentRadius = ring.targetRadius;
      }
    }
    renderGeometry();
    if (moving) geometryAnimationFrame = requestAnimationFrame(step);
    else geometryAnimationFrame = null;
  };

  geometryAnimationFrame = requestAnimationFrame(step);
}

function renderGeometry() {
  for (const ring of rings) {
    const r = Math.max(1, ring.currentRadius);
    const lineR = Math.max(1, r - 17);
    const phase = ring.serial * 1.91;
    const offsetStrength = ring.kind === "weekly" ? 1 : 0.72;
    const ox = (ring.lineOffsetX ?? Math.cos(phase) * 18) * offsetStrength;
    const oy = (ring.lineOffsetY ?? Math.sin(phase) * 14) * offsetStrength;

    ring.dom.line.setAttribute("cx", 400 + ox);
    ring.dom.line.setAttribute("cy", 400 + oy);
    ring.dom.line.setAttribute("r", lineR);
    ring.dom.hit.setAttribute("cx", 400 + ox);
    ring.dom.hit.setAttribute("cy", 400 + oy);
    ring.dom.hit.setAttribute("r", lineR);
    if (ring.allowTextSeamWrap) {
      // Longer ring copy can cross the endpoint of a closed SVG textPath and
      // lose its final characters. Give only those text carrier paths a second
      // lap, while keeping the visible ring itself as a single circle.
      ring.dom.path.setAttribute("d", doubleCirclePath(r));
      const startDistance = 2 * Math.PI * r * ((ring.textStart ?? 8) / 100);
      ring.dom.textPath.setAttribute("startOffset", startDistance.toFixed(3));
      ring.dom.textHitPath.setAttribute("startOffset", startDistance.toFixed(3));
    } else {
      ring.dom.path.setAttribute("d", circlePath(r));
      const startOffset = `${ring.textStart ?? 8}%`;
      ring.dom.textPath.setAttribute("startOffset", startOffset);
      ring.dom.textHitPath.setAttribute("startOffset", startOffset);
    }
  }
}

function addInformationRing(kind, text, index) {
  const ring = makeRing({
    id: `${kind}-${index}`,
    kind,
    text,
    lineDuration: 21 + (ringSerial % 5) * 3.5,
    textDuration: 29 + (ringSerial % 6) * 4,
    textStart: 4 + (ringSerial * 11) % 36,
    lineOffsetX: ((ringSerial % 2) ? 1 : -1) * (10 + (ringSerial % 4) * 4),
    lineOffsetY: ((ringSerial % 3) - 1) * 9,
    // Contact and the final About sentence are the only current information
    // rings long enough to need a carrier path that can cross the SVG seam.
    allowTextSeamWrap: kind === "contact" || (kind === "about" && index === ABOUT_SENTENCES.length - 1)
  });

  createRingDom(ring);
  ring.currentRadius = 74;
  rings.unshift(ring);
  layoutRings();

  // Slight automatic zoom-out keeps the newest addition comfortably visible,
  // but preserves user control through scroll.
  const outerRadius = slotRadius(rings.length - 1);
  const suggested = Math.min(1, 350 / outerRadius);
  if (suggested < targetZoom) targetZoom = Math.max(MIN_ZOOM, suggested);
}

aboutButton.addEventListener("click", () => {
  if (aboutIndex >= ABOUT_SENTENCES.length) return;
  addInformationRing("about", ABOUT_SENTENCES[aboutIndex], aboutIndex);
  aboutIndex += 1;
  if (aboutIndex >= ABOUT_SENTENCES.length) {
    aboutButton.classList.add("is-gone");
  }
  // Release click focus so :focus-within does not keep the satellite menu
  // expanded after the pointer leaves the center controls.
  releaseCenterControlFocus(aboutButton);
});

contactButton.addEventListener("click", () => {
  if (contactIndex >= CONTACT_SENTENCES.length) return;
  addInformationRing("contact", CONTACT_SENTENCES[contactIndex], contactIndex);
  contactIndex += 1;
  if (contactIndex >= CONTACT_SENTENCES.length) contactButton.classList.add("is-gone");
  // Clicking Contact used to leave keyboard focus inside the center menu.
  // Because the reveal CSS also responds to :focus-within, that focus kept the
  // remaining satellites expanded even after the pointer left. Release click
  // focus so the normal hover-leave collapse can tuck them behind Subscribe.
  releaseCenterControlFocus(contactButton);
});

function getEmailRing() {
  return rings.find(ring => ring.kind === "email");
}

function getSubscribeConfirmationRing() {
  return rings.find(ring => ring.kind === "subscribe-confirm");
}

function removeSubscribeConfirmationRing() {
  const ring = getSubscribeConfirmationRing();
  if (!ring) return;
  const index = rings.indexOf(ring);
  if (index >= 0) rings.splice(index, 1);
  ring.dom?.wrapper?.remove();
  layoutRings();
}

function showSubscribeConfirmationRing() {
  if (getSubscribeConfirmationRing()) return;

  const ring = makeRing({
    id: "subscribe-confirm",
    kind: "subscribe-confirm",
    text: "check your email",
    lineDuration: 24,
    textDuration: 34,
    textStart: 8,
    lineOffsetX: 0,
    lineOffsetY: 0
  });

  createRingDom(ring);
  ring.currentRadius = 74;
  rings.unshift(ring);
  layoutRings();
}

let emailPromptText = "";

function renderEmailText(displayed, showCaret = false) {
  const ring = getEmailRing();
  if (!ring) return;

  ring.dom.textPath.replaceChildren();

  if (showCaret) {
    const caret = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
    caret.setAttribute("class", "email-box-caret");
    caret.textContent = "| ";
    ring.dom.textPath.appendChild(caret);
  }

  ring.dom.textPath.appendChild(document.createTextNode(displayed));

  ring.dom.textHitPath.textContent = displayed;
}

function syncEmailDisplay() {
  const ring = getEmailRing();
  if (!ring) return;

  const value = emailInput.value.trim();
  const focused = document.activeElement === emailInput;
  const displayed = value || emailPromptText || "email";
  renderEmailText(displayed, focused && !value);

  if (!subscribed) ring.dom.wrapper.classList.remove("is-subscribed");
}

function setStatus(message = "") {
  statusMessage.textContent = message;
  statusMessage.classList.toggle("is-visible", Boolean(message));
}

emailInput.addEventListener("focus", () => {
  const ring = getEmailRing();
  ring.dom.wrapper.classList.add("is-email-focused");
  syncEmailDisplay();
  subscribeButton.classList.remove("is-error");
  setStatus("");
});

emailInput.addEventListener("blur", () => {
  const ring = getEmailRing();
  ring.dom.wrapper.classList.remove("is-email-focused");
  if (!emailInput.value.trim()) emailPromptText = "";
  syncEmailDisplay();
});

emailInput.addEventListener("input", () => {
  subscribed = false;
  removeSubscribeConfirmationRing();
  emailPromptText = "";
  subscribeButton.classList.remove("is-subscribed", "is-error");
  subscribeButtonLabel.textContent = "subscribe";
  if (subscribeLabelPath) subscribeLabelPath.setAttribute("d", "M 12.7 71 A 42 42 0 0 0 87.3 71");
  getEmailRing().dom.wrapper.classList.remove("is-subscribed");
  syncEmailDisplay();
  setStatus("");
});

subscribeButton.addEventListener("click", async () => {
  const email = emailInput.value.trim();
  const emailRing = getEmailRing();

  if (!email || !emailInput.checkValidity()) {
    subscribed = false;
    subscribeButton.classList.remove("is-subscribed");
    subscribeButton.classList.add("is-error");
    subscribeButtonLabel.textContent = "enter email";
    if (subscribeLabelPath) subscribeLabelPath.setAttribute("d", "M 12.7 71 A 42 42 0 0 0 87.3 71");
    if (!email) emailPromptText = "type email here";
    setStatus("Enter a valid email address first.");
    emailInput.focus();
    syncEmailDisplay();
    return;
  }

  if (!SUBSCRIBE_ENDPOINT) {
    subscribeButton.classList.add("is-error");
    subscribeButtonLabel.textContent = "not connected";
    setStatus("Subscribe endpoint is not configured yet.");
    return;
  }

  subscribeButton.disabled = true;
  setStatus("");
  try {
    const response = await fetch(SUBSCRIBE_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email })
    });
    let payload = null;
    try { payload = await response.json(); } catch (_) {}
    if (!response.ok) throw new Error(payload?.error || payload?.message || "Subscription failed");

    subscribed = true;
    subscribeButton.classList.remove("is-error");
    subscribeButton.classList.add("is-subscribed");
    subscribeButtonLabel.textContent = "subscribed";
    if (subscribeLabelPath) subscribeLabelPath.setAttribute("d", "M 12.7 71 A 42 42 0 0 0 87.3 71");
    emailRing.dom.wrapper.classList.add("is-subscribed");
    showSubscribeConfirmationRing();
    emailInput.blur();
    setStatus("");
  } catch (error) {
    subscribed = false;
    removeSubscribeConfirmationRing();
    subscribeButton.classList.remove("is-subscribed");
    subscribeButton.classList.add("is-error");
    subscribeButtonLabel.textContent = "try again";
    setStatus(error?.message || "Could not subscribe. Please try again.");
  } finally {
    subscribeButton.disabled = false;
  }
});

syncEmailDisplay();



emailInput.addEventListener("keydown", event => {
  if (event.key === "Enter" && window.matchMedia("(max-width: 700px)").matches) {
    event.preventDefault();
    subscribeButton.click();
  }
});
