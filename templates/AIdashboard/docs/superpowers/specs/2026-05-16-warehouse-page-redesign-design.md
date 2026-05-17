# Warehouse Page Redesign — Design

**Date:** 2026-05-16
**Status:** Approved, pending implementation plan
**File:** `templates/AIdashboard/warehouse.html` (single file; served by Flask `send_file` at `/dashboard/warehouse`)

## Problem

The warehouse page stacks every control vertically at full width — storage
meter, a giant drop zone, train/import buttons, an API-access panel, an
upload-visibility row, filters, bulk actions, the folder tree, and the file
table all compete for attention at once. It is visually overwhelming and
the hierarchy is unclear.

## Goal

A first-time user should glance at the page and immediately understand
three things: what folders exist, what is in the selected folder, and how
to add content. Everything else is one click away, not on the surface.

## Layout — header + two columns

The redesign keeps everything inside the existing `#listView`; the
`#detailView` and `#askView` siblings are unchanged.

### Header (full width)

- **Left:** the warehouse title/name.
- **Right cluster, in order:**
  - **`+ Add content`** — a secondary button opening a small dropdown
    menu with: *Upload files* (opens the upload modal), *Train a
    website* (existing `trainSiteBtn` flow), *Import from Google Drive*
    (existing `driveBtn` flow).
  - **`Ask the warehouse`** — the primary (accent) button. Highest-value
    action; reachable from anywhere. Reuses the existing `askOpen`
    behavior.
  - **`⚙` settings icon** — a button opening a dropdown/popover that
    contains the **Programmatic API access** panel (token generate /
    copy / regenerate / revoke / curl example) — the existing
    `apiAccessPanel` content, relocated.

### Left sidebar (~240px, persistent)

- The folder tree explorer (`#whFolderPane`) — unchanged behavior
  (collapsible folders, files shown inside, click-to-open).
- **`+ New folder`** pinned at the bottom of the tree (existing
  `__whNewFolder`).
- **Storage meter** — the `#quotaRow` content, restyled as a slim bar,
  pinned at the very bottom of the sidebar (moved off the page top).

### Main content (center, dominant)

- **Breadcrumb** at the top reflecting the sidebar's `activeFolder`
  (e.g. `All docs` or `ChicagoCTA / trains`). Clicking a crumb selects
  that ancestor folder. This is the single source of truth for the
  active folder together with the sidebar — the old top-right `Folder`
  dropdown (`upFolderSelect` in `.up-vis-row`) is removed from the page
  surface (the folder picker moves into the upload modal).
- **Compact toolbar** (one row): `searchInput`, `formatFilter`,
  `sortSel`, `whRefreshBtn`.
- **Document table** — unchanged: name, format, size, updated, status,
  access columns; the colgroup/fixed-layout table stays.
- **Bulk bar** (`docBulkBar`) and the delete-progress bar
  (`docDelProgress`) — already `hidden` until a selection exists;
  keep that, just reposition above the table.
- **Upload progress list** (`#uploads`) stays above the table.

## Upload modal

A new modal opened by *Add content → Upload files*. Contains:

- The drop zone (`dropZone`) + hidden `fileInput` — relocated into the
  modal body (no longer a giant page element).
- A **folder picker** (`upFolderSelect`) — defaults to the currently
  active folder.
- The **Internal / Customer-facing** radio toggle (`upVis`) — the
  choice now made at upload time, inside the modal.
- A small **info icon** next to the toggle; the explanatory sentence
  ("Internal is the safe default — customer bots can't read internal
  files…") becomes its tooltip rather than always-on body text.

After upload, per-document Internal/Customer changes remain available in
the table's Access column / the detail view (unchanged).

## Element-ID preservation (implementation constraint)

`warehouse.html` has extensive JavaScript bound to specific DOM IDs.
The redesign restructures HTML and CSS but **every existing ID is
preserved**, only repositioned. IDs that must survive:

`askOpen`, `quotaRow`, `dropZone`, `fileInput`, `trainSiteBtn`,
`driveBtn`, `apiAccessPanel` (+ `apiTokenNone/Have/Gen/Value/Copy/
Meta/Regen/Revoke/Curl`), `upVis` radios, `upFolderSelect`,
`searchInput`, `formatFilter`, `sortSel`, `whRefreshBtn`, `uploads`,
`docBulkBar` (+ `docBulkCount/Delete/Clear`), `docDelProgress` (+
`docDelProgressLabel/Fill`), `whFolderPane`, `docCheckAll`, `docBody`,
the table colgroup, and all `#detailView` / `#askView` IDs.

New IDs introduced: the upload modal and its backdrop, the Add-content
menu, the settings popover, the breadcrumb container.

JS additions: open/close wiring for the upload modal, the Add-content
menu, and the settings popover; a `renderBreadcrumb()` that draws
crumbs from `activeFolder` and is called wherever `renderFolderPane()`
/ `renderList()` already run.

## Visual style

Light and modern: generous whitespace, soft neutral background, the
existing blue as the single accent, muted secondary buttons, subtle
1px dividers instead of heavy boxed panels. Status pills (Ready,
Internal, etc.) kept but quieter — smaller, softer fills. Icons used
sparingly and consistently.

## Dark mode

Every new or restructured element must have full dark-mode parity via
the existing `[data-theme="dark"]` selectors: header, sidebar, storage
meter, breadcrumb, toolbar, the Add-content menu, the settings popover,
the upload modal (backdrop + body + drop zone + tooltip), and the
quieter status pills.

## What must remain accessible (reorganized, not removed)

Ask the warehouse · folder tree + hierarchy · file table with all
current columns · Upload files · Train a website · Import from Google
Drive · Internal vs Customer-facing (moved into the upload flow) ·
search / format filter / sort · bulk select + delete · storage usage
indicator · Programmatic API access (demoted into the settings menu).

## Out of scope

Changes to `#detailView` or `#askView` internals; backend/API changes;
new document features; mobile-specific layout beyond graceful
narrow-width behavior.

## Testing (smoke)

1. Page loads — header, sidebar, main column render; no console errors.
2. Folder tree works (expand/collapse, file open, new folder).
3. Breadcrumb reflects the selected folder and its crumbs navigate.
4. Add content → Upload files opens the modal; drop/select uploads a
   file into the chosen folder with the chosen visibility.
5. Add content → Train a website / Import Drive trigger the existing
   flows.
6. Settings → API access generates / copies / revokes a token.
7. Search, format filter, sort, refresh all work.
8. Selecting rows shows the bulk bar; deselecting hides it; bulk delete
   works with its progress bar.
9. Storage meter shows usage at the sidebar bottom.
10. Dark mode: toggle the theme — every element above is legible.
11. Regression: detail view and ask view open and work unchanged.
