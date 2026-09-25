// ---------------------------------------------------------------------------
// CONTENT LOADER
//
// Loads editable content for:
//   /content/highlight/content.json
//   /content/feeling-lost/content.json
//
// JSON is the source of truth. Existing panel content is replaced completely.
// ---------------------------------------------------------------------------

async function loadJSON(path) {
  const url = new URL(path, window.location.href);

  // Prevent the browser/GitHub Pages from serving an old cached JSON file.
  url.searchParams.set("_", Date.now().toString());

  const response = await fetch(url.href, {
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Could not load ${path}: ${response.status}`);
  }

  const text = await response.text();

  // Treat an empty JSON file as an empty object instead of throwing an error.
  if (!text.trim()) {
    return {};
  }

  return JSON.parse(text);
}


// ---------------------------------------------------------------------------
// HIGHLIGHT
// ---------------------------------------------------------------------------

async function loadHighlightContent() {
  const nameElement = document.getElementById("highlightName");
  const descriptionElement = document.getElementById("highlightDescription");
  const photoElement = document.getElementById("highlightPhoto");

  if (!nameElement || !descriptionElement || !photoElement) {
    return;
  }

  try {
    const content = await loadJSON("./content/highlight/content.json");

    // Always replace old text, even when the new value is empty.
    nameElement.textContent =
      typeof content.name === "string"
        ? content.name
        : "";

    descriptionElement.textContent =
      typeof content.description === "string"
        ? content.description
        : "";

    photoElement.alt =
      typeof content.photo_alt === "string"
        ? content.photo_alt
        : "";

    if (
      typeof content.photo === "string" &&
      content.photo.trim() !== ""
    ) {
      const photoURL = new URL(
        `./content/highlight/${content.photo.trim()}`,
        window.location.href
      );

      photoURL.searchParams.set("_", Date.now().toString());
      photoElement.src = photoURL.href;
    } else {
      photoElement.removeAttribute("src");
    }

  } catch (error) {
    console.error("Could not load Highlight content:", error);
  }
}


// ---------------------------------------------------------------------------
// FEELING LOST
// ---------------------------------------------------------------------------

function createTextSection(data) {
  if (!data || !Array.isArray(data.paragraphs)) {
    return null;
  }

  // Remove blank/non-string paragraphs.
  const paragraphs = data.paragraphs.filter(
    paragraph =>
      typeof paragraph === "string" &&
      paragraph.trim() !== ""
  );

  // If there is no actual content, don't create the section.
  if (paragraphs.length === 0) {
    return null;
  }

  const section = document.createElement("section");
  section.className = "feeling-lost-panel__section";

  if (
    typeof data.heading === "string" &&
    data.heading.trim() !== ""
  ) {
    const heading = document.createElement("h2");
    heading.textContent = data.heading;
    section.appendChild(heading);
  }

  paragraphs.forEach(text => {
    const paragraph = document.createElement("p");
    paragraph.textContent = text;
    section.appendChild(paragraph);
  });

  return section;
}


function createFAQSection(data) {
  if (!data || !Array.isArray(data.items)) {
    return null;
  }

  const validItems = data.items.filter(
    item =>
      item &&
      typeof item.question === "string" &&
      item.question.trim() !== "" &&
      typeof item.answer === "string" &&
      item.answer.trim() !== ""
  );

  // An empty FAQ array means NO FAQ section.
  if (validItems.length === 0) {
    return null;
  }

  const section = document.createElement("section");
  section.className =
    "feeling-lost-panel__section feeling-lost-panel__faq";

  if (
    typeof data.heading === "string" &&
    data.heading.trim() !== ""
  ) {
    const heading = document.createElement("h2");
    heading.textContent = data.heading;
    section.appendChild(heading);
  }

  const list = document.createElement("dl");

  validItems.forEach(item => {
    const row = document.createElement("div");

    const question = document.createElement("dt");
    question.textContent = item.question;

    const answer = document.createElement("dd");
    answer.textContent = item.answer;

    row.append(question, answer);
    list.appendChild(row);
  });

  section.appendChild(list);

  return section;
}


async function loadFeelingLostContent() {
  const inner = document.querySelector(
    "#feelingLostPanel .feeling-lost-panel__inner"
  );

  if (!inner) {
    console.error(
      'Could not load Feeling Lost content: "#feelingLostPanel .feeling-lost-panel__inner" was not found.'
    );
    return;
  }

  try {
    const content = await loadJSON(
      "./content/feeling-lost/content.json"
    );

    const fragment = document.createDocumentFragment();

    // These are intentionally explicit so their order is predictable.
    // Add/remove/reorder them here if desired.
    const sections = [
      createTextSection(content.about),
      createTextSection(content.curation),
      createTextSection(content.subscribing),
      createTextSection(content.contact),
      createFAQSection(content.faq)
    ];

    sections.forEach(section => {
      if (section) {
        fragment.appendChild(section);
      }
    });

    // IMPORTANT:
    // Completely destroys any old/fallback FAQ/content currently inside
    // the panel before inserting the JSON-generated content.
    inner.replaceChildren(fragment);

  } catch (error) {
    console.error("Could not load Feeling Lost content:", error);

    // Do not leave an old hard-coded FAQ visible if the JSON fails.
    inner.replaceChildren();
  }
}


// ---------------------------------------------------------------------------
// REFRESH
// ---------------------------------------------------------------------------

function refreshEditableContent() {
  loadHighlightContent();
  loadFeelingLostContent();
}


// Load content when the scripts first run.
refreshEditableContent();


// Refresh after normal navigation or browser back/forward restoration.
window.addEventListener("pageshow", () => {
  refreshEditableContent();
});


// Refresh when returning to a tab that may have been open during a deployment.
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    refreshEditableContent();
  }
});


// Refresh immediately before opening either panel.
document
  .getElementById("highlightButton")
  ?.addEventListener("click", loadHighlightContent, {
    capture: true
  });

document
  .getElementById("mobileHighlightLink")
  ?.addEventListener("click", loadHighlightContent, {
    capture: true
  });

document
  .getElementById("feelingLostLink")
  ?.addEventListener("click", loadFeelingLostContent, {
    capture: true
  });