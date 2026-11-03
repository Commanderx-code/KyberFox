/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// The first-run page: default search, recommended add-ons, Install selected
// and Skip. The engine is KyberAddons.sys.mjs. Add-on names, summaries and
// notes come from settings/recommended-addons.json and are set as text only.

const { KyberAddons } = ChromeUtils.importESModule(
  "resource:///modules/KyberAddons.sys.mjs"
);

const UBLOCK_ID = "uBlock0@raymondhill.net";
const DEFAULT_ENGINE = "DuckDuckGo";
const ENGINES = ["DuckDuckGo", "Google", "Brave Search", "Startpage", "Ecosia"];

function el(tag, className, text) {
  let node = document.createElement(tag);
  if (className) {
    node.className = className;
  }
  if (text !== undefined) {
    node.textContent = text;
  }
  return node;
}

function setL10n(node, id) {
  document.l10n.setAttributes(node, id);
  return node;
}

/**
 * One list row: control, name/summary/note, state text.
 *
 * @param {object} info
 * @param {?Element} info.control checkbox or radio, or null
 * @param {string} info.title
 * @param {string} [info.summary]
 * @param {string} [info.note]
 * @param {boolean} [info.included]
 */
function row({ control, title, summary, note, included }) {
  let label = el("label", "choice" + (included ? " included" : ""));
  if (control) {
    label.append(control);
  } else {
    label.append(el("span"));
  }
  let text = el("span", "text");
  text.append(el("span", "name", title));
  if (summary) {
    text.append(el("span", "summary", summary));
  }
  if (note) {
    text.append(el("span", "note", note));
  }
  let state = el("span", "state");
  label.append(text, state);
  return { label, state };
}

function buildSearch() {
  let box = document.getElementById("search-choices");
  for (let engine of ENGINES) {
    let radio = el("input");
    radio.type = "radio";
    radio.name = "search";
    radio.value = engine;
    radio.checked = engine == DEFAULT_ENGINE;
    box.append(row({ control: radio, title: engine }).label);
  }
}

function buildAddons() {
  let root = document.getElementById("addon-groups");
  let addons = KyberAddons.recommended();
  for (let group of KyberAddons.groups()) {
    let section = el("section");
    section.dataset.group = group;
    section.append(el("h3", "group-title", group));
    if (group == "Privacy") {
      let included = row({ title: "uBlock Origin", included: true });
      included.label.dataset.addonId = UBLOCK_ID;
      setL10n(included.state, "kyberfox-welcome-included");
      section.append(included.label);
    }
    for (let addon of addons.filter(a => a.group == group)) {
      let box = el("input");
      box.type = "checkbox";
      box.dataset.addonId = addon.id;
      let { label, state } = row({
        control: box,
        title: addon.name,
        summary: addon.summary,
        note: addon.note,
      });
      label.dataset.addonId = addon.id;
      state.className = "state";
      section.append(label);
    }
    root.append(section);
  }
}

function rowFor(id) {
  return document.querySelector(`.choice[data-addon-id="${CSS.escape(id)}"]`);
}

function showState(id, text, isError = false) {
  let state = rowFor(id)?.querySelector(".state");
  if (state) {
    state.textContent = text;
    state.classList.toggle("error", isError);
  }
}

function setBusy(busy) {
  for (let node of document.querySelectorAll("button, input")) {
    node.disabled = busy;
  }
}

function setStatus(id) {
  let node = document.getElementById("status");
  if (id) {
    setL10n(node, id);
  } else {
    node.removeAttribute("data-l10n-id");
    node.textContent = "";
  }
}

async function installSelected() {
  let ids = [
    ...document.querySelectorAll('input[type="checkbox"]:checked'),
  ].map(box => box.dataset.addonId);
  let engine = document.querySelector('input[name="search"]:checked').value;
  setBusy(true);
  setStatus("kyberfox-welcome-working");
  try {
    if (engine != DEFAULT_ENGINE) {
      await KyberAddons.setSearchDefault(engine);
    }
    let [installing, installed] = await document.l10n.formatValues([
      "kyberfox-welcome-installing",
      "kyberfox-welcome-installed",
    ]);
    let failed = 0;
    await KyberAddons.install(ids, r => {
      if (r.installing) {
        showState(r.id, installing);
      } else if (r.ok) {
        showState(r.id, installed);
        rowFor(r.id).querySelector("input").checked = false;
      } else {
        failed++;
        showState(r.id, r.error, true);
      }
    });
    KyberAddons.markShown();
    setStatus(
      failed ? "kyberfox-welcome-done-errors" : "kyberfox-welcome-done"
    );
  } catch (e) {
    console.error("Kyber Fox welcome page", e);
    setStatus("kyberfox-welcome-failed");
  } finally {
    setBusy(false);
  }
}

function skip() {
  KyberAddons.markShown();
  window.close();
}

buildSearch();
buildAddons();
document.getElementById("install").addEventListener("click", installSelected);
document.getElementById("skip").addEventListener("click", skip);
