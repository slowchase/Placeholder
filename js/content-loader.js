// ---------------------------------------------------------------------------
// EDITABLE CONTENT FILES
//
// Highlight + Feeling Lost are loaded from /content so those panels can be
// updated without editing index.html. Each read uses a genuinely unique URL
// and browser no-cache directives. We also refresh when the page is restored
// from browser history and whenever either panel is opened, which avoids stale
// text from the browser back/forward cache as well as ordinary HTTP caching.
// ---------------------------------------------------------------------------

function hashContent(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function freshRequestToken() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function fetchSiteContent(path) {
  const url = new URL(path, window.location.href);
  url.searchParams.set("refresh", freshRequestToken());

  const response = await fetch(url.href, {
    method: "GET",
    cache: "no-store",
    credentials: "same-origin",
    headers: {
      "Cache-Control": "no-cache, no-store, max-age=0, must-revalidate",
      "Pragma": "no-cache"
    }
  });

  if (!response.ok) throw new Error(`Could not load ${path}: ${response.status}`);
  const text = await response.text();
  return { data: JSON.parse(text), version: hashContent(text) };
}

async function loadHighlightContent() {
  const name = document.getElementById("highlightName");
  const description = document.getElementById("highlightDescription");
  const photo = document.getElementById("highlightPhoto");
  if (!name || !description || !photo) return;

  try {
    const { data: content, version } = await fetchSiteContent("./content/highlight/content.json");

    // Replace the DOM text nodes every time fresh JSON is loaded. This avoids
    // retaining stale inline/fallback text when a page is restored from bfcache.
    if (typeof content.name === "string") {
      name.replaceChildren(document.createTextNode(content.name));
    }
    if (typeof content.description === "string") {
      description.replaceChildren(document.createTextNode(content.description));
    }
    if (typeof content.photo_alt === "string") photo.alt = content.photo_alt;

    const photoFile = typeof content.photo === "string" && content.photo.trim()
      ? content.photo.trim()
      : "photo.jpg";
    const photoUrl = new URL(`./content/highlight/${photoFile}`, window.location.href);
    photoUrl.searchParams.set("content", version);
    photoUrl.searchParams.set("refresh", freshRequestToken());
    photo.src = photoUrl.href;
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
    const { data: content } = await fetchSiteContent("./content/feeling-lost/content.json");
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

function refreshEditableContent() {
  loadHighlightContent();
  loadFeelingLostContent();
}

// Initial load.
refreshEditableContent();

// A normal reload and a browser back/forward restore both receive a fresh copy.
window.addEventListener("pageshow", refreshEditableContent);

// If the tab has been sitting open while GitHub Pages deploys new content,
// returning to it refreshes the editable panels too.
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) refreshEditableContent();
});

// Refresh immediately before opening either editable panel.
document.getElementById("highlightButton")?.addEventListener("click", loadHighlightContent, { capture: true });
document.getElementById("mobileHighlightLink")?.addEventListener("click", loadHighlightContent, { capture: true });
document.getElementById("feelingLostLink")?.addEventListener("click", loadFeelingLostContent, { capture: true });
