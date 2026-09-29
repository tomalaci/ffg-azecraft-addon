# Admin Panel (GMs)

The **Admin Panel** button in the toolbar (next to the Scene list, GMs only) opens a window over the
free scene area with bulk fixes and an asset manager. Every change shows a summary of what it will
touch first and waits for confirmation.

## Quick actions

- **Replace Star Wars placeholder art:** actors and placed tokens still showing the system's Star
  Wars placeholders or the generic silhouette get the addon's default art (see
  [default-art.md](default-art.md)). Shows the count per type first.
- **Lightweight portraits:** remake the WebP copies of every squad member's and Person of Note's
  portrait, or make missing copies for all actors (see [lightweight-images.md](lightweight-images.md)).
- **Conversion settings:** the WebP quality used by *Convert* (default 0.9: generous, keeps
  battlemaps crisp).

## Assets

Browse the user data folders (starting at the world's folder; type any path or click the
breadcrumbs). Each file shows its size (over 5 MB highlighted) and how many documents use it.
Tick files for bulk actions, or use the buttons on a row:

- **Convert to WebP** (PNG, JPEG, BMP, AVIF): writes `Name.optimized.webp` next to the original at
  full resolution, then points every document that used the original at it: actor portraits and
  tokens, items, Scene backgrounds, tokens and tiles, journal pages and images inside text,
  playlists, chat messages, world settings (including the addon's default art). Images where WebP
  would save less than 5% are skipped. The originals then show under Unused files.
- **Move:** copies files into another folder (not `modules/` or `systems/`; existing files are never
  overwritten) and points every document at the new place.

The confirmation lists each file with the documents and fields that will change. Compendium packs
are not changed.

## Large files

Scan a folder (sub-folders included) for every file over a size (default 5 MB), largest first,
with how many documents use it. `.webp` files and unused files are skipped by default (see Unused
files for those). Tick files to convert them in one go.

## Unused files

Scan a folder (sub-folders included) for files that no world document (actors, items, Scenes,
journals, playlists, chat…), no world setting (any module's) and no world compendium uses, largest
first, with their total size. **Copy paths** copies the list, to delete the files on the server by
hand (Foundry's API cannot delete files). Originals left behind by a conversion or move show up
here. Check before deleting: files used only by other modules' compendiums, or by macros that build
paths in code, are not detected.

## How it works (developers)

`scripts/admin/asset-core.js` (pure, unit-tested) finds asset paths in data, replaces a path in
plain and URL-encoded form (whole paths only), and names copies. `scripts/admin/asset-ops.js` walks
every world document and its embedded documents (`metadata.embedded`), finds references, relinks
with `diffObject` updates, converts with `createImageBitmap` → `OffscreenCanvas` → WebP, copies with
`FilePicker.upload`, and builds the reference index (world documents, settings, world compendiums).
`scripts/admin/admin-panel.js` is the window.
