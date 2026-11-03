/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

// uBlock Origin ships in distribution/extensions. The install itself is
// checked on a real profile in the first-run audit, because the test harness
// forbids the network access its filter-list fetch needs.
const UBLOCK_ID = "uBlock0@raymondhill.net";

add_task(function test_xpi_is_packaged() {
  let file = Services.dirsvc.get("GreD", Ci.nsIFile);
  file.append("distribution");
  file.append("extensions");
  file.append(`${UBLOCK_ID}.xpi`);
  Assert.ok(file.exists(), `${file.path} is packaged`);
});
