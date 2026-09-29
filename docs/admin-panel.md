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
  would save less than 5% are skipped.
- **Move:** copies files into another folder (not `modules/` or `systems/`; existing files are never
  overwritten) and points every document at the new place.

The confirmation lists each file with the documents and fields that will change. Compendium packs
are not changed.

## Large files

Scan a folder (sub-folders included) for every file over a size (default 5 MB), largest first,
with how many documents use it; `.webp` files are skipped by default. Tick files to convert them in
one go. "Unused" files are candidates to delete or archive.

## Archive

Foundry's API can upload files and create folders, but it cannot delete, move or rename files. So
after a conversion or move the original stays on disk, unused, and is listed here with what
replaced it. Delete those files on the server by hand (for example with a file browser), then tick
them off the list. **Copy paths** copies the whole list.

A real archive (moving originals to `archived/` with the same folder structure) needs a small
helper on the server; the panel's file actions are built so they can use one later.

## How it works (developers)

`scripts/admin/asset-core.js` (pure, unit-tested) finds asset paths in data, replaces a path in
plain and URL-encoded form (whole paths only), and names copies. `scripts/admin/asset-ops.js` walks
every world document and its embedded documents (`metadata.embedded`), finds references, relinks
with `diffObject` updates, converts with `createImageBitmap` → `OffscreenCanvas` → WebP, copies with
`FilePicker.upload`, and keeps the archive list (world setting `assetArchive`).
`scripts/admin/admin-panel.js` is the window.
