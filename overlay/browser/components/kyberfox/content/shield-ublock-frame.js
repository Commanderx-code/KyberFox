/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* global addMessageListener, sendAsyncMessage, content */

// Runs in uBlock Origin's background page (loaded by KyberShield). uBlock has
// no external messaging, so this calls the same listener its own popup panel
// uses for the per-site power button. Neither uBlock nor its signature is
// changed. See docs/shield-ublock-control.md.

"use strict";

addMessageListener("KyberShield:Ublock", ({ data }) => {
  let ok = false;
  try {
    let vAPI = content.wrappedJSObject.vAPI;
    let listener = vAPI.messaging.listeners.get("popupPanel");
    ok = !!listener;
    if (ok) {
      listener.fn(
        Cu.cloneInto(
          {
            what: "toggleNetFiltering",
            url: data.url,
            scope: "",
            state: data.state,
            tabId: data.tabId,
          },
          content
        ),
        { privileged: true },
        () => {}
      );
    }
  } catch (e) {
    console.error("KyberShield: uBlock call failed", e);
  }
  sendAsyncMessage("KyberShield:UblockDone", { id: data.id, ok });
});
