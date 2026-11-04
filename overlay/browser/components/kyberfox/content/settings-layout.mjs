/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { KyberThemes } = ChromeUtils.importESModule(
  "resource:///modules/KyberThemes.sys.mjs"
);
const search = document.getElementById("searchInput");
const sidebar = document.getElementById("categories");
const originalParent = search.parentNode;
const marker = document.createComment("Settings search position");
originalParent.insertBefore(marker, search);
const expanded = matchMedia(
  "(min-width: 951px) and (not (forced-colors: active)) and (not (prefers-contrast: more))"
);

function syncLayout() {
  let sidebarSearch =
    !Services.appinfo.inSafeMode &&
    KyberThemes.isKyber(KyberThemes.current()) &&
    expanded.matches;
  let focused = document.activeElement == search;
  let moved = false;
  if (sidebarSearch && search.parentNode != sidebar) {
    search.slot = "subheading";
    sidebar.append(search);
    moved = true;
  } else if (!sidebarSearch && search.parentNode != originalParent) {
    search.removeAttribute("slot");
    marker.after(search);
    moved = true;
  }
  document.documentElement.classList.toggle(
    "kyber-settings-sidebar-search",
    sidebarSearch
  );
  let presets = document.getElementById("kyberfoxPrivacyPreset");
  let orientation = sidebarSearch ? "horizontal" : "vertical";
  if (presets && presets.orientation != orientation) {
    presets.orientation = orientation;
  }
  if (focused && moved) {
    search.focus();
  }
}

const panes = new MutationObserver(syncLayout);
panes.observe(document.getElementById("mainPrefPane"), {
  childList: true,
  subtree: true,
});
Services.obs.addObserver(syncLayout, "kyberfox-theme-changed");
expanded.addEventListener("change", syncLayout);
window.addEventListener(
  "unload",
  () => {
    panes.disconnect();
    Services.obs.removeObserver(syncLayout, "kyberfox-theme-changed");
    expanded.removeEventListener("change", syncLayout);
  },
  { once: true }
);
syncLayout();
