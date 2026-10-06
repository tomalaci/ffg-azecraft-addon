# Share Image and Share Text

Two toolbar tabs for everyone (players and GMs) to show an image or a piece of text to the others
quickly, like Foundry's *Show to players*. What is shared is kept in a share archive in the world
unless the sharer unticks **Keep in the archive**.

## Share Image

- **Share Image** in the toolbar opens a small window.
- Drop an image on it, paste one (Ctrl+V, e.g. a screenshot), click to choose a file, or give a
  link (`https://…` or a Foundry image path such as `worlds/…/map.webp`).
- Optional caption (shown as plain text with the image).
- **Show to:** *Everyone online* (default), or untick it and pick the people.
- **Share**: the image opens in Foundry's image viewer for them, titled "Shared by <name>".
- **Recent (until you reload):** the images shared or received since this page loaded; click one to
  open it again. The list is gone after a reload (the archive below keeps them).

## Share Text

- **Share Text** in the toolbar opens a window with an optional title and a text editor (formatting,
  links, images, as in journal pages).
- Write the text, or drop a journal text page (or a journal entry: its first text page) on the window
  to share its title and text. GM secrets in it that are not revealed are left out.
- **Show to** and **Share** work as for images: the text opens for them in a read-only window titled
  "Shared by <name>". Links to documents (`@UUID[…]`) work for those who can see the document.

## The archive

- Kept shares go into the *current archive*: a journal entry in the **Shared Content** journal folder,
  one page per share named "<title> — <author>". Everyone can read the archives; the pages are written
  by the GM's client, so keeping a share needs a GM online (otherwise it is shown but not kept, with a
  warning).
- Both windows list the current archive's shares of their kind, most recently shared first: open one,
  **share it again** at once (to the window's Show-to choice), put it back in the window to change it
  or who sees it, or delete it (its author and GMs; asks first).
- Sharing the same image or text again does not copy it: the kept one moves to the top (a new image
  caption replaces the old one). The Recent list also shows each image once.
- The first kept share starts an archive called "Shared". GMs can start a **New archive** (e.g. one
  per session; it becomes current) and choose another archive to browse, and **Make current** to send
  new shares there. Archives are ordinary journal entries: rename, move or delete them as usual.
- Images are kept inside the page (their shrunk data URL), so nothing is uploaded and deleting a page
  or an archive frees the space.

## How it works (developers)

- `scripts/share/share-core.js` (pure, unit-tested): recipients, who a message is for, image links,
  the shrinking steps; `scripts/share/image-share.js` and `share-text.js`: the windows and their
  socket messages; `share-archive.js`: archive reading, writing (active GM) and its socket requests;
  `archive-ui.js` with `templates/share/archive.hbs`: the archive section of both windows.
- Files are shrunk in the browser to WebP (longest side 1600 px, then smaller steps down to 600 px)
  until the data URL is at most 600 KB, then sent inside a `shareImage` message on the module socket
  (`module.ffg-azecraft-addon`), with `to: null` (everyone) or the chosen user ids. Links are sent as
  they are. Recipients open `foundry.applications.apps.ImagePopout` with the data URL or link.
- Text is sent as HTML in a `shareText` message; recipients clean it with `foundry.utils.cleanHTML`
  (no scripts or event handlers) and enrich it before showing it. Unrevealed journal secrets
  (`section.secret` without `revealed`) are removed before sending and before keeping
  (`scripts/share/secrets.js`).
- Every handler takes the sender from Foundry (the socket's sender id), not from the message:
  window titles ("Shared by …") and archive authors are rebuilt from it.
- Keeping, deleting and new archives go to the active GM as `shareStore`, `shareDelete` and
  `shareNewArchive` messages (a GM handles their own directly). The GM checks that a delete comes from
  the author or a GM, and handles the requests one at a time. Archive journals carry the flag `shareArchive`, their pages `share`
  (kind, author, time, caption), the folder `shareFolder`; the current archive is the world setting
  `shareArchiveCurrent`.
- Messages of several MB pass Foundry's socket locally; the 600 KB cap leaves room for the proxies in
  front of the hosted server.
