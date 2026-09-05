// ---------------------------------------------------------------------------
// EDITABLE CONTENT FILES
//
// GitHub Pages serves the JSON/photo files in /content as ordinary static
// assets. Updating those files in the repository updates the corresponding
// site panels without changing index.html or the interaction code.
// ---------------------------------------------------------------------------

async function fetchSiteContent(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) throw new Error(`Could not load ${path}: ${response.status}`);
  return response.json();
}

async function loadHighlightContent() {
  const name = document.getElementById("highlightName");
  const description = document.getElementById("highlightDescription");
  const photo = document.getElementById("highlightPhoto");
  if (!name || !description || !photo) return;

  try {
    const content = await fetchSiteContent("./content/highlight/content.json");
    if (typeof content.name === "string") name.textContent = content.name;
    if (typeof content.description === "string") description.textContent = content.description;
    if (typeof content.photo_alt === "string") photo.alt = content.photo_alt;
  } catch (error) {
    console.warn("Highlight content file was not loaded; using inline fallback copy.", error);
  }
}

function appendParagraphs(section, paragraphs) {
  if (!Array.isArray(paragraphs)) return;
  paragraphs.forEach(text => {
    if (typeof text !== "string") return;
    const paragraph = document.createElement("p");
    paragraph.textContent = text;
    section.appendChild(paragraph);
  });
}

async function loadFeelingLostContent() {
  const inner = document.querySelector("#feelingLostPanel .feeling-lost-panel__inner");
  if (!inner) return;

  try {
    const content = await fetchSiteContent("./content/feeling-lost/content.json");
    const fragment = document.createDocumentFragment();

    if (content.about && Array.isArray(content.about.paragraphs)) {
      const section = document.createElement("section");
      section.className = "feeling-lost-panel__section";
      const heading = document.createElement("h2");
      heading.textContent = content.about.heading || "about";
      section.appendChild(heading);
      appendParagraphs(section, content.about.paragraphs);
      fragment.appendChild(section);
    }

    if (content.contact && Array.isArray(content.contact.paragraphs)) {
      const section = document.createElement("section");
      section.className = "feeling-lost-panel__section";
      const heading = document.createElement("h2");
      heading.textContent = content.contact.heading || "contact";
      section.appendChild(heading);
      appendParagraphs(section, content.contact.paragraphs);
      fragment.appendChild(section);
    }

    if (content.faq && Array.isArray(content.faq.items)) {
      const section = document.createElement("section");
      section.className = "feeling-lost-panel__section feeling-lost-panel__faq";
      const heading = document.createElement("h2");
      heading.textContent = content.faq.heading || "faq";
      const list = document.createElement("dl");
      content.faq.items.forEach(item => {
        if (!item || typeof item.question !== "string" || typeof item.answer !== "string") return;
        const row = document.createElement("div");
        const term = document.createElement("dt");
        const detail = document.createElement("dd");
        term.textContent = item.question;
        detail.textContent = item.answer;
        row.append(term, detail);
        list.appendChild(row);
      });
      section.append(heading, list);
      fragment.appendChild(section);
    }

    if (fragment.childNodes.length) inner.replaceChildren(fragment);
  } catch (error) {
    console.warn("Feeling Lost content file was not loaded; using inline fallback copy.", error);
  }
}

loadHighlightContent();
loadFeelingLostContent();
