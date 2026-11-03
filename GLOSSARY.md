# Kyber Fox

Kyber Fox is a Firefox fork with the classic Firefox layout, stronger privacy defaults, workspaces, built-in themes and private sync. This glossary fixes the words the project uses for its own concepts.

## Language

### Browsing

**Workspace**:
A named set of tabs in a window, switched from the dropdown at the left of the tab bar. It shares cookies and logins with other workspaces.
_Avoid_: Space, profile, container

**Tab group**:
Firefox's own colored group of tabs. A tab group lives inside one workspace.
_Avoid_: Tab folder, tab stack

**Split view**:
Firefox's own feature showing two tabs side by side in one window.
_Avoid_: Split screen, dual pane

### Privacy

**Shield**:
The per-site control over the three protections. "Shield on" means all three are active for that site.
_Avoid_: Tracking protection toggle, site exception

**Protection**:
One of the three things the shield controls for a site: ads and trackers, fingerprinting, or cookies.
_Avoid_: Blocker, filter

**Preset**:
One of two bundles of privacy settings, Standard or Strict. Any hand-changed state is Custom.
_Avoid_: Profile, mode, level

### Appearance

**Theme**:
Any entry in the theme picker.
_Avoid_: Style, look, chrome

**Color theme**:
A theme defined only by palette values on a shared stylesheet. Ember, Paper, Frost, Terminal, Catppuccin, Tokyo Night and Starry are color themes.

**Skin**:
A theme that restyles Firefox's interface beyond colors, such as GX-style or One-style. A skin can break on a Firefox update.
_Avoid_: Full theme, mod

**Custom CSS**:
A user-supplied stylesheet imported through the theme picker.
_Avoid_: userChrome

### Releases

**Release**:
A Kyber Fox build the owner approved and published.
_Avoid_: Version, build, drop

**Firefox release**:
Mozilla's upstream release that a Kyber Fox release is built from.
_Avoid_: Upstream version, base

**Security release**:
A Kyber Fox release whose only purpose is carrying a Firefox security fix. It targets 72 hours from the Firefox release.
_Avoid_: Hotfix, patch release

**Channel**:
An update stream a browser install follows. Friends follow `release`; `test` exists for dry runs.
_Avoid_: Track, ring

**Friends release**:
The first release, distributed only to the owner's friends.
_Avoid_: Beta, alpha, preview

### Sync

**Sync code**:
The word code generated on the first device that other devices join with. It is the only identity sync has, and the encryption key derives from it.
_Avoid_: Sync chain, chain code, account, passphrase
