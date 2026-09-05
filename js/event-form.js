function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function hardenMobileTextInput(input) {
  if (!input || !window.matchMedia("(max-width: 700px)").matches) return;
  input.setAttribute("autocomplete", "off");
  input.setAttribute("autocorrect", "off");
  input.setAttribute("autocapitalize", "off");
  input.setAttribute("spellcheck", "false");
}

async function typePlaceholder(input, text, token) {
  input.placeholder = "";
  await sleep(150);
  for (let i = 0; i < text.length; i++) {
    if (token !== typingToken || !submissionActive) return;
    input.placeholder += text[i];
    await sleep(54);
  }
}

function fieldControl(row) {
  return row?.querySelector("input, textarea, select");
}

function removeCurrentEventField(index, row) {
  if (eventSubmitting || index <= 0) return;
  typingToken += 1;
  const previousRow = eventSubmission.querySelector(`.event-field[data-index="${index - 1}"]`);
  const previousInput = fieldControl(previousRow);
  row.classList.add("is-removing");
  fieldControl(row)?.blur();
  if (eventSubmitWrap) { eventSubmitWrap.remove(); eventSubmitWrap = null; eventSubmitButton = null; }
  visibleFieldCount = index;
  if (previousRow) previousRow.classList.remove("is-complete");
  window.setTimeout(() => {
    row.remove();
    if (previousInput) { previousInput.focus(); try { previousInput.setSelectionRange(previousInput.value.length, previousInput.value.length); } catch (_) {} }
  }, 220);
}

function createEventSubmitButton() {
  if (eventSubmitWrap || !submissionActive) return;
  eventSubmitWrap = document.createElement("div");
  eventSubmitWrap.className = "event-submit-wrap";
  eventSubmitWrap.innerHTML = `<button class="event-submit-button" type="button" aria-label="Submit event"><svg class="event-submit-button__svg" viewBox="0 0 100 100" aria-hidden="true"><defs><path id="eventFormSubmitLabelPath" d="M 12.7 71 A 42 42 0 0 0 87.3 71" /></defs><text class="event-submit-button__text"><textPath href="#eventFormSubmitLabelPath" startOffset="50%" text-anchor="middle">submit</textPath></text></svg></button>`;
  eventSubmission.appendChild(eventSubmitWrap);
  eventSubmitButton = eventSubmitWrap.querySelector(".event-submit-button");
  eventSubmitButton.addEventListener("click", submitEventForm);
  requestAnimationFrame(() => requestAnimationFrame(() => eventSubmitWrap?.classList.add("is-visible")));
}

const submissionLockedControls = [
  aboutButton,
  contactButton,
  highlightButton,
  orbitToggleButton,
  spiralButton,
  subscribeButton
];

function setSubmissionMode(active) {
  document.body.classList.toggle("is-submission-mode", active);
  solarSystem.classList.toggle("is-submission-mode", active);
}

function setSubmissionControlsDisabled(disabled) {
  submissionLockedControls.forEach(button => {
    button.disabled = disabled;
  });
}

function validSingleDateText(value) {
  const match = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (!match) return false;
  const month = Number(match[1]), day = Number(match[2]);
  const rawYear = Number(match[3]);
  const year = match[3].length === 2 ? 2000 + rawYear : rawYear;
  if (month < 1 || month > 12 || day < 1) return false;
  const test = new Date(year, month - 1, day);
  return test.getFullYear() === year && test.getMonth() === month - 1 && test.getDate() === day;
}
function validDateText(value) {
  const parts = value.trim().split(/\s*-\s*/);
  return (parts.length === 1 || parts.length === 2) && parts.every(validSingleDateText);
}
function validTimeText(value) {
  const time = '(?:0?[1-9]|1[0-2])(?::[0-5]\\d)?\\s*(?:am|pm)';
  return new RegExp('^' + time + '(?:\\s*-\\s*' + time + ')?$', 'i').test(value.trim());
}
function eventFieldComplete(config,row) {
  const c=fieldControl(row);
  if (config.type === "date-text") return validDateText(c?.value || "");
  if (config.type === "time-text") return validTimeText(c?.value || "");
  if (config.type === "checkbox") return true;
  return !!c?.value.trim() || !!config.optional;
}
function showInlineFieldWarning(control, message) {
  if (!control || control.dataset.warningActive === "true") return;
  const previousValue = control.value;
  const previousPlaceholder = control.placeholder;
  control.dataset.warningActive = "true";
  control.value = "";
  control.placeholder = message;
  control.classList.add("is-inline-warning");
  control.readOnly = true;
  control.blur();
  window.setTimeout(() => {
    if (!control.isConnected) return;
    control.value = previousValue;
    control.placeholder = previousPlaceholder;
    control.classList.remove("is-inline-warning");
    control.readOnly = false;
    delete control.dataset.warningActive;
    control.focus();
    try { control.setSelectionRange(control.value.length, control.value.length); } catch (_) {}
  }, 3000);
}
function advanceEventField(index, config, row) {
  if (!eventFieldComplete(config,row) && !config.optional) {
    const control = fieldControl(row);
    if (control) {
      let message = "please complete this line";
      if (config.key === "event-name") message = "title required";
      else if (config.type === "date-text") message = "ex. 01/01/26";
      else if (config.type === "time-text") message = "ex. 7pm-9pm";
      showInlineFieldWarning(control, message);
    }
    return;
  }
  row.classList.add("is-complete"); fieldControl(row)?.blur();
  if (index < EVENT_FIELDS.length - 1) revealEventField(index + 1); else createEventSubmitButton();
}
function addBackspaceBehavior(control,index,row) {
  control.addEventListener("keydown", e=>{
    if ((e.key==="Backspace"||e.key==="Delete") && index>0 && (!control.value || control.tagName==="SELECT")) {
      if (control.tagName==="SELECT" && control.value) return;
      e.preventDefault(); removeCurrentEventField(index,row); return;
    }
  });
}

function createEventField(index) {
  const config=EVENT_FIELDS[index], row=document.createElement("div");
  row.className="event-field"; if(index===0) row.classList.add("is-first");
  row.dataset.key=config.key; row.dataset.index=index; row.dataset.optional=config.optional?"true":"false"; row.style.setProperty("--field-index",index);
  let primary;
  if (config.type === "checkbox") {
    row.classList.add("event-field--checkbox");
    const label = document.createElement("label");
    label.className = "event-private-toggle";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.name = config.key;
    input.setAttribute("aria-label", config.label);
    const box = document.createElement("span");
    box.className = "event-private-toggle__box";
    box.setAttribute("aria-hidden", "true");
    const text = document.createElement("span");
    text.className = "event-private-toggle__label";
    text.textContent = config.label;
    label.append(input, box, text);
    row.append(label);
    primary = input;
  } else if (config.type === "date-text" || config.type === "time-text") {
    const input=document.createElement("input"); input.type="text"; input.name=config.key; input.setAttribute("aria-label",config.label); input.autocomplete="off"; input.spellcheck=false; row.append(input); primary=input;
    addBackspaceBehavior(input,index,row); input.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();advanceEventField(index,config,row)}});
  } else if (config.type === "textarea") {
    const wrap=document.createElement("div"); wrap.className="description-wrap"; const counter=document.createElement("span"); counter.className="char-counter"; counter.textContent="0/200";
    const input=document.createElement("textarea"); input.name=config.key; input.maxLength=200; input.rows=1; input.placeholder="description"; input.setAttribute("aria-label","description"); input.spellcheck=true;
    const resizeDescription = () => {
      counter.textContent=`${input.value.length}/200`;
      input.style.height="46px";
      input.style.height=`${Math.max(46, input.scrollHeight)}px`;
    };
    input.addEventListener("input", resizeDescription);
    addBackspaceBehavior(input,index,row);
    input.addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();advanceEventField(index,config,row)}});
    wrap.append(counter,input); row.append(wrap); primary=input;
  } else {
    const input=document.createElement("input"); input.type=config.type; input.name=config.key; input.setAttribute("aria-label",config.label+(config.optional?" encouraged":"")); input.autocomplete="off"; input.spellcheck=config.key==="event-name"||config.key==="location"; row.append(input); primary=input;
    addBackspaceBehavior(input,index,row); input.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();advanceEventField(index,config,row)}});
  }
  if (primary && config.type !== "checkbox") hardenMobileTextInput(primary);
  if(eventSubmitWrap)eventSubmission.insertBefore(row,eventSubmitWrap);else eventSubmission.appendChild(row);
  if(index!==0)requestAnimationFrame(()=>requestAnimationFrame(()=>row.classList.add("is-emerged")));
  if(config.type!=="textarea" && config.type!=="checkbox"){ const token=++typingToken; if(index===0)setTimeout(()=>{if(token===typingToken&&submissionActive)typePlaceholder(primary,config.label,token)},520); else typePlaceholder(primary,config.label,token); }
  if (config.type !== "checkbox") setTimeout(()=>primary.focus(),index===0?620:500);
  return row;
}
function revealEventField(index) {
  if (!submissionActive || index < visibleFieldCount) return;
  visibleFieldCount = index + 1;
  createEventField(index);
  if (index === EVENT_FIELDS.length - 1) {
    window.setTimeout(createEventSubmitButton, 620);
  }
}

function clearEventSubmission() {
  typingToken += 1;
  eventSubmission.innerHTML = "";
  visibleFieldCount = 0;
  eventSubmitWrap = null;
  eventSubmitButton = null;
  eventSubmitting = false;
}

function showEventSubmissionAtEdge() {
  if (submissionActive || spiralActive) return;
  // If the camera reaches the submission plane while Highlight is open, close
  // the card first. This also clears its stacking state before the form takes over.
  if (typeof setHighlightOpen === "function") setHighlightOpen(false);
  submissionActive = true;
  setSubmissionMode(true);
  setSubmissionControlsDisabled(true);
  setStatus("");
  clearEventSubmission();
  eventSubmission.classList.add("is-visible");
  visibleFieldCount = 1;
  createEventField(0);
  window.setTimeout(() => {
    if (submissionActive && !eventSubmitting) eventSubmission.classList.add("is-reviewable");
  }, 820);
}

function hideEventSubmissionForTilt() {
  if (!submissionActive || eventSubmitting) return;
  typingToken += 1;
  eventSubmission.classList.remove("is-visible", "is-collapsing", "is-reviewable");
  clearEventSubmission();
  submissionActive = false;
  setSubmissionMode(false);
  setSubmissionControlsDisabled(false);
}

function validateEventForm() {
  let firstMissing=null;
  EVENT_FIELDS.forEach((config,index)=>{ if(config.optional)return; const row=eventSubmission.querySelector(`.event-field[data-index="${index}"]`); if(!row||!eventFieldComplete(config,row)) firstMissing ||= fieldControl(row); });
  if(firstMissing){firstMissing.focus();return false;} return true;
}

function addMobileEventSubmittedRing() {
  if (!window.matchMedia("(max-width: 700px)").matches) return;
  if (rings.some(ring => ring.kind === "event-confirm")) return;
  const ring = makeRing({
    id: `event-confirm-${Date.now()}`,
    kind: "event-confirm",
    text: "event submitted!",
    lineDuration: 28,
    textDuration: 36,
    textStart: 8,
    lineOffsetX: 8,
    lineOffsetY: -6
  });
  createRingDom(ring);
  ring.currentRadius = 74;
  rings.unshift(ring);
  layoutRings();
}

function getEventFieldValue(key) {
  const row = eventSubmission.querySelector(`.event-field[data-key="${key}"]`);
  const control = fieldControl(row);
  if (!control) return "";
  if (control.type === "checkbox") return control.checked;
  return control.value.trim();
}

function buildEventSubmissionPayload() {
  return {
    event_name: getEventFieldValue("event-name"),
    date_text: getEventFieldValue("date"),
    time_text: getEventFieldValue("time"),
    location: getEventFieldValue("location"),
    description: getEventFieldValue("description"),
    link_contact: getEventFieldValue("link"),
    keep_contact_private: !!getEventFieldValue("keep-contact-private")
  };
}

function setEventSubmitFeedback(message = "") {
  if (!eventSubmitWrap) return;
  let feedback = eventSubmitWrap.querySelector(".event-submit-feedback");
  if (!feedback && message) {
    feedback = document.createElement("p");
    feedback.className = "event-submit-feedback";
    feedback.setAttribute("role", "status");
    feedback.setAttribute("aria-live", "polite");
    eventSubmitWrap.appendChild(feedback);
  }
  if (feedback) feedback.textContent = message;
}

function setEventFormPending(pending) {
  eventSubmission.querySelectorAll("input, textarea, select").forEach(control => {
    control.disabled = pending;
  });
  if (eventSubmitButton) {
    eventSubmitButton.disabled = pending;
    eventSubmitButton.classList.toggle("is-pending", pending);
  }
}

function runEventSubmissionSuccess() {
  if (!eventSubmitButton || !eventSubmitWrap) return;

  const button = eventSubmitButton;
  const rect = button.getBoundingClientRect();
  const targetSize = subscribeButton.getBoundingClientRect().width || rect.width;
  const targetLeft = window.innerWidth / 2 - targetSize / 2;
  const targetTop = window.innerHeight / 2 - targetSize / 2;

  setEventSubmitFeedback("");
  button.classList.add("is-handoff");
  button.style.left = `${rect.left}px`;
  button.style.top = `${rect.top}px`;
  button.style.width = `${rect.width}px`;
  button.style.height = `${rect.height}px`;
  button.style.background = "linear-gradient(145deg, #fff4bd 0%, #f4dda0 52%, #e8c977 100%)";
  eventSubmitWrap.style.height = `${rect.height}px`;

  // Freeze the form only after Supabase has accepted the submission.
  eventSubmission.querySelectorAll("input, textarea, select").forEach(input => input.disabled = true);
  requestAnimationFrame(() => {
    eventSubmission.style.transition = "opacity 420ms ease";
    eventSubmission.style.opacity = "0";
    eventSubmission.style.pointerEvents = "none";
    button.style.left = `${targetLeft}px`;
    button.style.top = `${targetTop}px`;
    button.style.width = `${targetSize}px`;
    button.style.height = `${targetSize}px`;
  });

  window.setTimeout(() => {
    submissionActive = false;
    setSubmissionMode(false);
    solarSystem.classList.add("is-event-success");
    solarSystem.style.setProperty("--plane-scale-y", "1");
    currentPlaneTilt = targetPlaneTilt = planeTilt = 0;
    currentZoom = targetZoom = 1;
    renderCameraZoom(1, 0);

    subscribeButton.classList.remove("is-subscribed", "is-error");
    subscribeButton.classList.add("is-event-submitted");
    subscribeButtonLabel.textContent = "event submitted!";
    if (subscribeLabelPath) subscribeLabelPath.setAttribute("d", "M 8 50 A 42 42 0 0 0 92 50");
    addMobileEventSubmittedRing();
    setSubmissionControlsDisabled(false);
    centerPlane.classList.remove("is-menu-open");

    button.style.opacity = "0";
    window.setTimeout(() => {
      button.remove();
      clearEventSubmission();
      eventSubmission.removeAttribute("style");
      eventSubmission.classList.remove("is-visible", "is-collapsing", "is-reviewable");
    }, 220);
  }, 930);

  window.setTimeout(() => solarSystem.classList.remove("is-event-success"), 1900);
}

async function submitEventForm() {
  if (eventSubmitting || !eventSubmitButton || !validateEventForm()) return;

  eventSubmitting = true;
  typingToken += 1;
  setEventSubmitFeedback("");
  setEventFormPending(true);

  try {
    if (!SUBMIT_EVENT_ENDPOINT) throw new Error("missing_endpoint");

    const response = await fetch(SUBMIT_EVENT_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildEventSubmissionPayload())
    });

    let result = null;
    try { result = await response.json(); } catch (_) {}

    if (response.ok) {
      runEventSubmissionSuccess();
      return;
    }

    setEventFormPending(false);
    eventSubmitting = false;

    if (response.status === 429) {
      setEventSubmitFeedback("temporarily unavailable — please try again later");
    } else if (response.status >= 400 && response.status < 500) {
      setEventSubmitFeedback("please check the event details and try again");
    } else {
      setEventSubmitFeedback("couldn't submit — please try again");
    }
  } catch (error) {
    console.error("event submission failed", error);
    setEventFormPending(false);
    eventSubmitting = false;
    setEventSubmitFeedback("couldn't submit — please try again");
  }
}

function returnToOrbit() {
  if (!submissionActive && planeTilt <= 0.001) return;
  typingToken += 1;
  if (submissionActive) {
    eventSubmission.classList.add("is-collapsing");
    const rows = [...eventSubmission.querySelectorAll(".event-field")];
    rows.forEach((row, index) => row.style.setProperty("--field-index", index));
  }

  window.setTimeout(() => {
    eventSubmission.classList.remove("is-visible", "is-collapsing", "is-reviewable");
    clearEventSubmission();
    submissionActive = false;
    setSubmissionMode(false);
    setSubmissionControlsDisabled(false);
    targetPlaneTilt = 0;
    targetZoom = 1;
    requestZoomFrame();
  }, submissionActive ? 560 : 0);
}

// Submit Event is the only trigger for the camera/plane transition.
submitEventButton.addEventListener("click", () => {
  centerPlane.classList.remove("is-menu-open");
  targetZoom = MIN_ZOOM;
  targetPlaneTilt = 1;
  requestZoomFrame();
});
brandButton.addEventListener("click", () => {
  // The masthead is the universal escape hatch from the submission plane.
  // Clear transient overlays first, then restore the orbital system.
  if (typeof setHighlightOpen === "function") setHighlightOpen(false);
  if (typeof setFeelingLostOpen === "function") setFeelingLostOpen(false);
  returnToOrbit();
});

spiralButton.addEventListener("click", beginSpiralReset);

