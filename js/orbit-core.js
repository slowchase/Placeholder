// ---------------------------------------------------------------------------
// CORE DOM REFERENCES + SHARED SITE STATE
//
// This file intentionally remains first in index.html. The other classic scripts
// share these bindings. Keep cross-system helpers small and behavior-neutral.
// ---------------------------------------------------------------------------
const NS = "http://www.w3.org/2000/svg";
const ORBIT_CENTER = 400;
const cameraLayer = document.getElementById("cameraLayer");
const ringsLayer = document.getElementById("ringsLayer");
const solarSystem = document.getElementById("solarSystem");
const orbitSvg = document.getElementById("orbitSvg");
const emailInput = document.getElementById("emailInput");
const subscribeButton = document.getElementById("subscribeButton");
const subscribeButtonLabel = document.getElementById("subscribeButtonLabel");
const subscribeLabelPath = document.getElementById("subscribeLabelPath");
const statusMessage = document.getElementById("statusMessage");
const aboutButton = document.getElementById("aboutButton");
const contactButton = document.getElementById("contactButton");
const highlightButton = document.getElementById("highlightButton");
const orbitToggleButton = document.getElementById("orbitToggleButton");
const highlightPanel = document.getElementById("highlightPanel");
const feelingLostLink = document.getElementById("feelingLostLink");
const feelingLostPanel = document.getElementById("feelingLostPanel");
const feelingLostBackdrop = document.getElementById("feelingLostBackdrop");
const spiralButton = document.getElementById("spiralButton");
const submitEventButton = document.getElementById("submitEventButton");
const brandButton = document.getElementById("brandButton");
const centerPlane = document.getElementById("centerPlane");
const eventSubmission = document.getElementById("eventSubmission");
const viewport = document.querySelector(".viewport");
let eventSubmitWrap = null;
let eventSubmitButton = null;

const ABOUT_SENTENCES = [
  "about",
  "a weekly newsletter",
  "for the curious and spontaneous"
];

const CONTACT_SENTENCES = [
  "contact: events@placeholdersf.com"
];

let aboutIndex = 0;
let contactIndex = 0;
let subscribed = false;
let orbitPausedByUser = true;
let ringSerial = 0;

// New rings are inserted at index 0. Existing rings shift outward one slot.
// The text size stays constant; only the path radius changes.
const rings = [
  makeRing({
    id: "email",
    kind: "email",
    text: "email",
    lineOffsetX: 16,
    lineOffsetY: 10,
    lineDuration: 20,
    textDuration: 31,
    textStart: 20
  }),
  makeRing({
    id: "weekly",
    kind: "weekly",
    text: "san francisco weekly events calendar",
    lineOffsetX: -26,
    lineOffsetY: -12,
    lineDuration: 27,
    textDuration: 39,
    textStart: 6
  })
];

// Satellite buttons receive focus when clicked. Because the menu also opens via
// :focus-within, releasing click focus is part of the established hover-collapse
// behavior for controls that do not need to retain keyboard focus after activation.
function releaseCenterControlFocus(button) {
  if (button) button.blur();
}

function makeRing(options) {
  return {
    serial: ringSerial++,
    currentRadius: 0,
    targetRadius: 0,
    ...options
  };
}

function svgEl(name, attrs = {}) {
  const node = document.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  return node;
}

function circlePath(radius) {
  return `M ${ORBIT_CENTER - radius} ${ORBIT_CENTER} A ${radius} ${radius} 0 1 1 ${ORBIT_CENTER + radius} ${ORBIT_CENTER} A ${radius} ${radius} 0 1 1 ${ORBIT_CENTER - radius} ${ORBIT_CENTER}`;
}

// A two-lap invisible text path lets longer copy pass cleanly across the SVG
// path seam without shrinking or clipping. The visible ring itself remains a
// single circle; only the path that carries the text gets the extra lap.
function doubleCirclePath(radius) {
  return `M ${ORBIT_CENTER - radius} ${ORBIT_CENTER} A ${radius} ${radius} 0 1 1 ${ORBIT_CENTER + radius} ${ORBIT_CENTER} A ${radius} ${radius} 0 1 1 ${ORBIT_CENTER - radius} ${ORBIT_CENTER} A ${radius} ${radius} 0 1 1 ${ORBIT_CENTER + radius} ${ORBIT_CENTER} A ${radius} ${radius} 0 1 1 ${ORBIT_CENTER - radius} ${ORBIT_CENTER}`;
}

function slotRadius(index) {
  return 128 + index * 80;
}

function createRingDom(ring) {
  const wrapper = svgEl("g", {
    class: "logical-ring",
    "data-ring-id": ring.id,
    "data-kind": ring.kind
  });

  const lineMotion = svgEl("g", { class: "motion ring-line-motion" });

  const line = svgEl("circle", { class: "ring-line", cx: ORBIT_CENTER, cy: ORBIT_CENTER, r: 0 });
  const hit = svgEl("circle", { class: "ring-hit", cx: ORBIT_CENTER, cy: ORBIT_CENTER, r: 0 });
  lineMotion.append(line, hit);

  const textMotion = svgEl("g", { class: "motion ring-text-motion" });

  const pathId = `text-path-${ring.serial}`;
  const path = svgEl("path", { id: pathId, class: "ring-text-path", fill: "none", stroke: "none", d: circlePath(1) });
  // A transparent stroked duplicate gives each sentence a forgiving hover
  // target, while the visible copy remains the actual rendered text.
  const textHit = svgEl("text", { class: "path-hit", "aria-hidden": "true" });
  const textHitPath = svgEl("textPath", { href: `#${pathId}`, startOffset: `${ring.textStart ?? 8}%` });
  textHitPath.textContent = ring.text;
  textHit.append(textHitPath);

  const text = svgEl("text", { class: "path-copy" });
  const textPath = svgEl("textPath", { href: `#${pathId}`, startOffset: `${ring.textStart ?? 8}%` });
  textPath.textContent = ring.text;
  text.append(textPath);
  textMotion.append(path, textHit, text);

  wrapper.append(lineMotion, textMotion);
  ringsLayer.appendChild(wrapper);

  ring.dom = { wrapper, lineMotion, line, hit, textMotion, path, textHit, textHitPath, text, textPath };

  // Stage 2: all orbital rotation is driven by one shared requestAnimationFrame
  // clock using native SVG transform attributes. Initial angles match the old
  // negative CSS animation delays so the composition starts in the same phase.
  ring.lineAngle = ((ring.serial * 2.7) / (ring.lineDuration || 24)) * 360;
  ring.textAngle = ((ring.serial * 4.1) / (ring.textDuration || 33)) * 360;
  ring.textDragging = false;
  lineMotion.setAttribute("transform", `rotate(${ring.lineAngle} ${ORBIT_CENTER} ${ORBIT_CENTER})`);
  textMotion.setAttribute("transform", `rotate(${ring.textAngle} ${ORBIT_CENTER} ${ORBIT_CENTER})`);

  wrapper.addEventListener("mouseenter", () => wrapper.classList.add("is-hovered"));
  wrapper.addEventListener("mouseleave", () => wrapper.classList.remove("is-hovered"));

  installTextDrag(ring);

  if (ring.kind === "email") {
    wrapper.addEventListener("click", () => {
      if (!ring._suppressClick) emailInput.focus();
      ring._suppressClick = false;
    });
  }
}


