/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* global addMessageListener, sendAsyncMessage, content */

// Runs in uBlock Origin's background page (loaded by KyberUBlockBridge).
// uBlock has no external messaging, so this calls the same listeners its own
// popup panel and dashboard use. Neither uBlock nor its signature is changed.
// See docs/shield-ublock-control.md.

"use strict";

/**
 * Calls one of uBlock's message listeners as a privileged port would. A null
 * channel is its default handler.
 *
 * @param {string|null} channel
 * @param {object} request
 * @returns {object|undefined} The listener's synchronous response.
 */
function callListener(channel, request) {
  let { vAPI } = content.wrappedJSObject;
  let fn = channel
    ? vAPI.messaging.listeners.get(channel)?.fn
    : vAPI.messaging.defaultHandler;
  if (!fn) {
    throw new Error(`no ${channel} listener`);
  }
  let response;
  let result = fn(
    Cu.cloneInto(request, content),
    Cu.cloneInto({ privileged: true }, content),
    Cu.exportFunction(r => {
      response = r;
    }, content)
  );
  if (result === vAPI.messaging.UNHANDLED) {
    throw new Error(`${channel} did not handle ${request.what}`);
  }
  return response;
}

/** The sites uBlock does not filter, as its trusted-sites directives. */
function readSites() {
  let response = callListener(null, { what: "getWhitelist" });
  return Array.from(response.whitelist, String);
}

addMessageListener("KyberShield:Ublock", ({ data }) => {
  let reply = { id: data.id, ok: false, sites: [] };
  try {
    if (data.op == "toggle") {
      // tabId -1 is vAPI.noTabId: uBlock keeps a "behind the scene" page store
      // for it that always exists, so no tab is involved.
      callListener("popupPanel", {
        what: "toggleNetFiltering",
        url: data.url,
        scope: "",
        state: data.state,
        tabId: -1,
      });
    }
    reply.sites = readSites();
    // A call that found no page store changes nothing; the read-back shows it.
    reply.ok =
      data.op != "toggle" || reply.sites.includes(data.domain) == !data.state;
  } catch (e) {
    console.error("KyberShield: uBlock call failed", e);
  }
  sendAsyncMessage("KyberShield:UblockDone", reply);
});
