"""Content Classifier experiment: load sites under four configurations and
record load time, requests, bytes, blocked counts and a screenshot.

Development use only; see docs/research/2026-11-04-content-classifier-experiment.md.

usage: content_classifier_run.py CONFIG OUTDIR SITES_FILE
CONFIG: none | ubo | engine | both

Needs an installed kyberfox on PATH, filter lists served over local HTTP and
named in CC_LISTS (| separated), and marionette_driver on PYTHONPATH (the
testing/marionette/client and testing/mozbase packages of a Firefox tree).
Each run uses a fresh profile next to this script and deletes it at exit.
"""
import base64
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time

from marionette_driver.marionette import Marionette

CONFIG, OUT, SITES = sys.argv[1], sys.argv[2], sys.argv[3]
LISTS = os.environ.get("CC_LISTS", "")
PORT = int(os.environ.get("CC_PORT", "2830"))
os.makedirs(OUT, exist_ok=True)

engine = CONFIG in ("engine", "both")
ubo = CONFIG in ("ubo", "both")

profile = tempfile.mkdtemp(prefix=f"ccprof-{CONFIG}-", dir=os.path.dirname(os.path.abspath(__file__)))
prefs = {
    "marionette.port": PORT,
    "kyberfox.welcome.shown": True,
    "dom.security.https_only_mode": False,
    "browser.cache.disk.enable": False,
    "browser.cache.memory.enable": False,
    "browser.shell.checkDefaultBrowser": False,
    "browser.sessionstore.resume_from_crash": False,
    "privacy.trackingprotection.content.testing": True,
    "privacy.trackingprotection.content.protection.enabled": engine,
    "privacy.trackingprotection.content.protection.engines": "test_block",
    "privacy.trackingprotection.content.protection.test_list_urls": LISTS if engine else "",
}
with open(os.path.join(profile, "user.js"), "w") as f:
    for k, v in prefs.items():
        f.write(f"user_pref({json.dumps(k)}, {json.dumps(v)});\n")

env = dict(os.environ, MOZ_REMOTE_ALLOW_SYSTEM_ACCESS="1", MOZ_HEADLESS="1", MOZ_HEADLESS_WIDTH="1366", MOZ_HEADLESS_HEIGHT="900")
proc = subprocess.Popen(
    ["kyberfox", "--marionette", "--no-remote", "--profile", profile],
    env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
)
import atexit
atexit.register(lambda: (proc.kill(), shutil.rmtree(profile, ignore_errors=True)))
m = Marionette(host="127.0.0.1", port=PORT)
m.start_session()
m.timeout.page_load = 45
m.timeout.script = 60

m.set_context("chrome")
list_ms = None
if engine:
    t0 = time.time()
    # Re-set the pref so the lists load now and the loaded topic can be timed.
    list_ms = m.execute_async_script(
        """
        let [urls, resolve] = arguments;
        let start = Date.now();
        let topic = "test-content-classifier-filter-lists-loaded";
        let done = false;
        let obs = () => { if (!done) { done = true; Services.obs.removeObserver(obs, topic); resolve(Date.now() - start); } };
        Services.obs.addObserver(obs, topic);
        Services.prefs.setStringPref("privacy.trackingprotection.content.protection.test_list_urls", "");
        Services.prefs.setStringPref("privacy.trackingprotection.content.protection.test_list_urls", urls);
        setTimeout(() => { if (!done) { done = true; resolve(-1); } }, 55000);
        """,
        script_args=[LISTS],
    )
m.execute_async_script(
    """
    let [enable, resolve] = arguments;
    const { AddonManager } = ChromeUtils.importESModule("resource://gre/modules/AddonManager.sys.mjs");
    AddonManager.getAddonByID("uBlock0@raymondhill.net").then(async a => {
      if (a) { enable ? await a.enable() : await a.disable(); }
      resolve(a ? a.isActive : null);
    });
    """,
    script_args=[ubo],
)
time.sleep(8 if ubo else 2)  # let uBlock Origin load its lists

mem = None
results = {"config": CONFIG, "list_load_ms": list_ms, "sites": []}
sites = [s.strip() for s in open(SITES) if s.strip() and not s.startswith("#")]
for site in sites:
    m.set_context("content")
    rec = {"site": site}
    try:
        t = time.time()
        m.navigate(site)
        time.sleep(4)
        rec["wall_s"] = round(time.time() - t, 2)
        rec.update(m.execute_script(
            """
            let nav = performance.getEntriesByType("navigation")[0] || {};
            let res = performance.getEntriesByType("resource");
            let host = location.hostname.split(".").slice(-2).join(".");
            let third = res.filter(r => { try { return !new URL(r.name).hostname.endsWith(host); } catch (e) { return false; } });
            return {
              load_ms: Math.round(nav.loadEventEnd || 0),
              dcl_ms: Math.round(nav.domContentLoadedEventEnd || 0),
              requests: res.length,
              third_party_requests: third.length,
              kbytes: Math.round(res.reduce((a, r) => a + (r.transferSize || 0), 0) / 1024),
              title: document.title.slice(0, 80),
            };
            """
        ))
        m.set_context("chrome")
        rec["blocked"] = m.execute_async_script(
            """
            let resolve = arguments[0];
            Promise.resolve(gBrowser.selectedBrowser.getContentBlockingLog()).then(json => {
              let log = JSON.parse(json), n = 0, origins = 0;
              for (let [origin, entries] of Object.entries(log)) {
                let hit = false;
                for (let [state, blocked, count] of entries) {
                  if (blocked) { n += count || 1; hit = true; }
                }
                if (hit) origins++;
              }
              resolve({ requests: n, origins });
            });
            """
        )
        m.set_context("content")
        png = m.screenshot(format="binary", full=False)
        name = site.split("//")[1].split("/")[0].replace("www.", "")
        with open(os.path.join(OUT, f"{name}.png"), "wb") as f:
            f.write(png)
    except Exception as e:
        rec["error"] = str(e)[:200]
    results["sites"].append(rec)
    print(json.dumps(rec), flush=True)

if engine:
    m.set_context("chrome")
    mem = m.execute_async_script(
        """
        let resolve = arguments[0];
        let total = 0;
        Cc["@mozilla.org/memory-reporter-manager;1"].getService(Ci.nsIMemoryReporterManager)
          .getReports((proc, path, kind, units, amount) => {
             if (path.includes("content-classifier") && units == Ci.nsIMemoryReporter.UNITS_BYTES && path.startsWith("explicit/")) total += amount;
          }, null, () => resolve(Math.round(total / 1024 / 1024 * 10) / 10), null, false);
        """
    )
results["engine_memory_mb"] = mem
with open(os.path.join(OUT, "results.json"), "w") as f:
    json.dump(results, f, indent=1)
try:
    m.quit(in_app=False)
except Exception:
    pass
proc.kill()
shutil.rmtree(profile, ignore_errors=True)
print("done", CONFIG, "list_load_ms", list_ms, "engine_memory_mb", mem)
