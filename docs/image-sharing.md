# Share Image

A toolbar tab for everyone (players and GMs) to show an image to the others quickly, like Foundry's
*Show to players*, without uploading it to the server.

## Using it

- **Share Image** in the toolbar opens a small window.
- Drop an image on it, paste one (Ctrl+V, e.g. a screenshot), click to choose a file, or give a
  link (`https://…` or a Foundry image path such as `worlds/…/map.webp`).
- Optional caption (shown as plain text with the image).
- **Show to:** *Everyone online* (default), or untick it and pick the people.
- **Share**: the image opens in Foundry's image viewer for them, titled "Shared by <name>".
- **This session:** the images shared or received since you loaded the game; click one to open it
  again. The list is gone after a reload.

Nothing is saved: no file on the server and nothing in the world. People who join after an image was
shared do not get it (share it again).

## How it works (developers)

- `scripts/share/share-core.js` (pure, unit-tested): recipients, who a message is for, image links,
  the shrinking steps; `scripts/share/image-share.js`: the window, encoding and the socket.
- Files are shrunk in the browser to WebP (longest side 1600 px, then smaller steps down to 600 px)
  until the data URL is at most 600 KB, then sent inside a `shareImage` message on the module socket
  (`module.ffg-azecraft-addon`), with `to: null` (everyone) or the chosen user ids. Links are sent as
  they are. Recipients open `foundry.applications.apps.ImagePopout` with the data URL or link.
- Messages of several MB pass Foundry's socket locally; the 600 KB cap leaves room for the proxies in
  front of the hosted server.
