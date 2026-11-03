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

function buildSearch(current) {
  let box = document.getElementById("search-choices");
  for (let engine of ENGINES) {
    let radio = el("input");
    radio.type = "radio";
    radio.name = "search";
    radio.value = engine;
    radio.checked = engine == current;
    box.append(row({ control: radio, title: engine }).label);
  }
}

async function buildAddons() {
  let root = document.getElementById("addon-groups");
  let addons = KyberAddons.recommended();
  for (let group of KyberAddons.groups()) {
    let section = el("section");
    section.dataset.group = group;
    root.append(section);
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
      if (await KyberAddons.installed(addon.id)) {
        markInstalled(addon.id);
      }
    }
  }
}

function rowFor(id) {
  return document.querySelector(`.choice[data-addon-id="${CSS.escape(id)}"]`);
}

// Filled in before the first row is built.
let gText = {};

function showState(id, text, { isError = false, title = "" } = {}) {
  let state = rowFor(id)?.querySelector(".state");
  if (state) {
    state.textContent = text;
    state.title = title;
    state.classList.toggle("error", isError);
  }
}

/**
 * An installed add-on shows "Installed" and cannot be ticked again.
 *
 * @param {string} id
 */
function markInstalled(id) {
  let box = rowFor(id)?.querySelector("input");
  if (box) {
    box.checked = false;
    box.dataset.installed = "true";
    box.disabled = true;
  }
  showState(id, gText.installed);
}

function setBusy(busy) {
  for (let node of document.querySelectorAll("button, input")) {
    node.disabled = busy || node.dataset.installed == "true";
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
    if (engine != (await KyberAddons.defaultSearch())) {
      await KyberAddons.setSearchDefault(engine);
    }
    let failed = 0;
    await KyberAddons.install(
      ids,
      r => {
        if (r.installing) {
          showState(r.id, gText.installing);
        } else if (r.ok) {
          markInstalled(r.id);
        } else if (r.canceled) {
          showState(r.id, gText.canceled);
        } else {
          failed++;
          showState(r.id, r.kind == "network" ? gText.network : gText.failed, {
            isError: true,
            title: r.code,
          });
        }
      },
      window.browsingContext.embedderElement
    );
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

async function init() {
  let [installing, installed, canceled, network, failed] =
    await document.l10n.formatValues([
      "kyberfox-welcome-installing",
      "kyberfox-welcome-installed",
      "kyberfox-welcome-canceled",
      "kyberfox-welcome-error-network",
      "kyberfox-welcome-error-failed",
    ]);
  gText = { installing, installed, canceled, network, failed };
  let current = await KyberAddons.defaultSearch();
  buildSearch(ENGINES.includes(current) ? current : DEFAULT_ENGINE);
  await buildAddons();
}

// Closing the tab, or quitting with it open, counts as Skip.
window.addEventListener("pagehide", () => KyberAddons.markShown(), {
  once: true,
});
document.getElementById("install").addEventListener("click", installSelected);
document.getElementById("skip").addEventListener("click", skip);
init().catch(console.error);
