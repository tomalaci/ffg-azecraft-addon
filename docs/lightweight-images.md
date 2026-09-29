# Lightweight images

Character art is often very large (the party portraits were up to 5000×7000 px and 76 MB). Shown
at a few hundred pixels in the dashboard, the Actors tab or a sheet header, such an image still has
to be downloaded and decoded at full size by every player, which made the UI stutter.

The addon makes a lightweight **WebP copy** (at most 1400 px on its longest side) of every large
actor image and shows it instead. The originals are untouched: clicking a portrait still opens the
full image, and the actors' data keeps pointing at the originals.

- **Automatic.** The GM's browser makes the copies when the world loads, and again when an actor
  is created or its portrait or dashboard art changes. Copies are saved next to
  their originals as `Name.thumb.webp` (images inside `modules/` or `systems/` go to
  `worlds/<world>/azecraft-thumbs/`) and listed in a world setting, so every player gets them.
  Images under 600 KB and 2000 px, and SVGs, are left as they are.
- **Everywhere.** Any image showing an original that has a copy is switched to the copy: dashboard
  cards and People of Note, the Actors tab, sheet headers, chat. The image viewer and the file
  picker always show the original.
- **Settings** (Configure Settings → FFG Azecraft Addon):
  - *Use lightweight images* (per player): turn off to always see the originals.
  - *Lightweight images* (GM): lists the copies and the space saved; *Check now* makes missing
    copies, *Remake all* replaces them (e.g. after editing an image file in place).

The first GM login after installing this makes the copies once (about 10 seconds for the current
party art); nothing is needed afterwards.

## How it works (developers)

`scripts/thumbnails/thumbnail-core.js` (pure, unit-tested) decides which images get a copy, its
size and file name, and normalizes image paths for lookup. `scripts/thumbnails/thumbnails.js`
makes copies on the active GM's client (decode with `createImageBitmap`, draw to an
`OffscreenCanvas`, encode WebP, upload with `FilePicker.upload`), keeps the registry (world setting
`imageCopies`), and swaps `<img>` sources with a `MutationObserver` on the document. The dashboard
renders the copies directly (`displaySrc`), keeping the original in `data-art-src`.
