# Default actor art

starwarsffg gives every new actor Star Wars placeholder art: a stormtrooper for minions, an Imperial
officer for rivals, Darth Vader for nemeses, and so on. The addon replaces these placeholders with
its own abstract, Mass Effect style tokens (`assets/default-art/`):

| Type | Art |
| --- | --- |
| Minion | One grey-blue chevron |
| Rival | Two orange chevrons |
| Nemesis | Three red chevrons and a star |
| Character | Cyan hexagon with a figure |
| Vehicle | Cyan ship silhouette |

New actors get this art for both the portrait and the prototype token. An actor created with art
already chosen (e.g. imported, or dropped from a compendium with its own art) keeps it.

## Configuring (GM)

Configure Settings → FFG Azecraft Addon → **Default actor art** → *Configure default art*:

- Set a **Portrait** and, optionally, a separate **Token** image for each type (use the file picker).
  An empty token uses the portrait.
- The ↺ button next to a type resets it to the addon's art; **Reset all** resets every type.
- **Save**. If existing actors or placed tokens still show the previous default art, you are
  offered to update them to the new art.

## Replacing placeholders on existing actors (GM)

**Replace placeholders on existing actors** (in the same window) looks for actors whose portrait
or prototype token is still a placeholder, and for placed tokens on any Scene that are. A
placeholder is the system's Star Wars art, Foundry's generic silhouette, or this addon's art. The
window lists how many there are per type and asks before changing anything. Art that someone
picked is never touched. Save your configuration before using it.

To go back to the system's Star Wars art for a type, set its portrait to
`systems/starwarsffg/images/defaults/actors/<type>.png`.
