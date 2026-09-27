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

## Powers tab

The **Powers** tab has one button per readied Biotics or Tech power (see
[BIOTIC-TECH-POWERS.md](BIOTIC-TECH-POWERS.md)). Each button shows the power's base difficulty and
whether it needs concentration. Clicking it opens the usual dice dialog for the Biotics or Tech
skill, already set to the power's base difficulty (e.g. Easy for Biotic Attack instead of the
default Average). Only that power's optional effects and the general modifiers are listed, with the
power's list open. Tick the effects you use and roll as normal; the chat message names the power
and the chosen effects. Rolling Biotics or Tech from the skills list still shows every power's
modifiers.

Which powers show: until someone chooses, every power of each discipline the character has ranks
in. The owner (or GM) can click the gear to tick the readied powers instead; **Show by skill ranks
instead** goes back to the automatic list. The choice is stored on the Actor.

World setting: **Mass Effect character sheet** (Configure Settings → FFG Azecraft Addon). Turn it
off to get the parchment look back (the header fields stay removed).

## How it works (developers)

- **Powers.** `scripts/powers/power-catalog.js` holds the powers, their base difficulties and
  effects (pure, unit-tested). The sheet template has an empty `powers` tab that
  `scripts/powers/power-block.js` fills in `renderActorSheet`. A power button calls the system's
  `DiceHelpers.rollSkill` for the power's skill and parks the power for the roll dialog; the patched
  `RollBuilderFFG.getData` in `scripts/roll-power-modifiers.js` claims it (within 5 s, same
  discipline), moves the difficulty from Average to the power's base, and narrows the modifier list.
- **Template.** `templates/actors/ffg-character-sheet.html` is the starwarsffg 2.0.3 template with
  the Specializations / Force Powers / Signature Abilities rows removed and an empty Powers tab
  added; everything else is unchanged. It is swapped in by `scripts/override-actor-templates.js`, the same mechanism as the
  NPC templates. When the system updates, re-copy its template, remove those rows and add the Powers tab again.
- **Styles.** `styles/character-sheet.css` is added as an **unlayered** `<link>` at `setup` by
  `scripts/character-sheet-theme.js`. The system's `mandar.css` is unlayered too, so a stylesheet
  in Foundry's `modules` CSS layer (the `styles` in `module.json`) could never override it. Rules
  are scoped to `.azcs.starwarsffg.sheet.actor`, and `.azcs` is added to character sheets in
  `renderActorSheet`. Because this stylesheet loads later, it wins ties with the system's rules.
  The one `!important` clears a grey `thead` background that the system sets with a six-class
  selector.
