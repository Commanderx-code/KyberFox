# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

## Workspaces. The workspace button sits at the start of the tab bar.

kyberfox-workspace-button =
    .tooltiptext = Switch workspace
kyberfox-workspace-panel =
    .aria-label = Workspaces
# Variables:
#   $number (number) - One more than the number of existing workspaces.
kyberfox-workspace-default-name = Workspace { $number }
kyberfox-workspace-new =
    .label = New workspace
kyberfox-workspace-rename =
    .label = Rename
kyberfox-workspace-delete =
    .label = Delete
kyberfox-workspace-name-input =
    .aria-label = Workspace name
# Variables:
#   $name (string) - The name of the workspace being deleted.
kyberfox-workspace-delete-title = Delete “{ $name }”?
# Variables:
#   $count (number) - How many tabs the workspace has in this window.
kyberfox-workspace-delete-message =
    { $count ->
        [one] This workspace has { $count } tab in this window. The tab moves to the first workspace.
       *[other] This workspace has { $count } tabs in this window. The tabs move to the first workspace.
    }
kyberfox-workspace-delete-confirm = Delete workspace
