# Character sheet (Mass Effect style)

Player character sheets use the dark Mass Effect style of the mission dashboard instead of the Star
Wars parchment:

- dark navy panels, thin cyan lines and condensed uppercase headings;
- characteristics as glowing "dials";
- skill tables and item/talent lists with cyan header bars;
- the active tab in orange.

The sheet header no longer has the **Specializations**, **Force Powers** or **Signature
Abilities** fields; this campaign doesn't use them. Species and Career are unchanged. No character
had any of those items when they were removed, so nothing was hidden.

World setting: **Mass Effect character sheet** (Configure Settings → FFG Azecraft Addon). Turn it
off to get the parchment look back (the header fields stay removed).

## How it works (developers)

- **Template.** `templates/actors/ffg-character-sheet.html` is the starwarsffg 2.0.3 template with
  the Specializations / Force Powers / Signature Abilities rows removed; everything else is
  unchanged. It is swapped in by `scripts/override-actor-templates.js`, the same mechanism as the
  NPC templates. When the system updates, re-copy its template and remove those rows again.
- **Styles.** `styles/character-sheet.css` is added as an **unlayered** `<link>` at `setup` by
  `scripts/character-sheet-theme.js`. The system's `mandar.css` is unlayered too, so a stylesheet
  in Foundry's `modules` CSS layer (the `styles` in `module.json`) could never override it. Rules
  are scoped to `.azcs.starwarsffg.sheet.actor`, and `.azcs` is added to character sheets in
  `renderActorSheet`. Because this stylesheet loads later, it wins ties with the system's rules.
  The one `!important` clears a grey `thead` background that the system sets with a six-class
  selector.
