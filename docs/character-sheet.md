# Character sheet (Mass Effect style)

Character and NPC sheets use the dark Mass Effect style of the mission dashboard instead of the Star
Wars parchment:

- dark navy panels, thin cyan lines and condensed uppercase headings;
- characteristics as glowing "dials";
- skill tables and item/talent lists with cyan header bars;
- the active tab in orange.

NPC sheets (minions, rivals and nemeses) use the same style and also have the Biotics and Tech tabs
below. Their headers no longer have the Force Powers field; the rival / nemesis label is a red tag.

The character sheet header no longer has the **Specializations**, **Force Powers** or **Signature
Abilities** fields; this campaign doesn't use them. Species and Career are unchanged. No character
had any of those items when they were removed, so nothing was hidden.

## Biotics and Tech tabs

Each discipline has its own tab (see [BIOTIC-TECH-POWERS.md](BIOTIC-TECH-POWERS.md) for the rules).

**Power buttons.** The top of the tab has one button per base power (Biotic Attack, Augment, ...;
Tech Attack, Construct, ...), showing its base difficulty and whether it needs concentration.
Clicking one opens the usual dice dialog for the Biotics or Tech skill, already set to the power's
base difficulty (e.g. Easy for Biotic Attack instead of the default Average). Only that power's
optional effects and the general modifiers are listed. Tick the effects you use and roll as normal;
the chat message names the power and the chosen effects. Effects that can be taken more than once
(e.g. Range, Silhouette: "+1 Difficulty die per rank") have a number box instead of a tick box;
set how many ranks you use (up to 5). Rolling Biotics or Tech from the skills
list still shows every power's modifiers.

**Concentration.** Powers that need concentration have a **Conc.** toggle. Click it when the
character starts keeping the power up: it turns orange ("Concentrating") and the power shows as a
chip on the character's mission dashboard card. Click it again (or the chip's ×) when it ends. It
is only a reminder: no stats change.

**Tech loadout.** Tech Attack and Tech Augment subtypes are readied separately, so their buttons
have a loadout row: the element (Incinerate, Cryo Blast, Overload, Neural Shock) and the augment
mode (Tech Armor, Charged Melee, Turbocharge, Tactical Cloak). Click an icon to load it; rolls use
the loaded one. The roll shows its effect (e.g. Incinerate: Burn and Sunder), and the dialog hides
modifiers that do not apply (Anti-Synthetic is Overload only; Anti-Organic is not for Overload).

**Presets.** Under the buttons, **Add** saves a power roll you use often: a name, the power, an
optional subtype and the modifiers to tick in advance (e.g. "Frost wave": Tech Attack, Cryo Blast,
Blast + Range). Presets remember how many ranks of Range and similar effects they use. The row shows the resulting difficulty; clicking it opens the dice dialog with those
modifiers already ticked (untick or add more as usual). Tech presets can follow the loaded
element or name their own, and Construct / Sabotage presets name the construct or sabotage type;
VI Hacking starts at Daunting. Use the pencil to edit and the bin to delete.

Loadout and presets are stored on the Actor, so everyone who can see the sheet sees them; its
owners (and GMs) can change them.

## Star Wars parts removed

The sheets (character and NPC) no longer show Star Wars-only parts: the Force Pool, Force Powers
and Signature Abilities on the Talents tab, the Force Powers header field, and the character's
Obligation / Duty / Morality tab. The medical counter on the Gear tab is labelled "Medi-gel". No
actor used any of these when they were removed. Mass Effect features the sheets lack are added by
this addon instead (e.g. the Biotics / Tech tabs).

World setting: **Mass Effect character sheet** (Configure Settings → FFG Azecraft Addon). Turn it
off to get the parchment look back on all of them (the header fields stay removed).

## How it works (developers)

- **Powers.** `scripts/powers/power-catalog.js` holds the powers, subtypes, base difficulties,
  effects and preset rules (pure, unit-tested). The sheet template has empty `biotics` and `tech`
  tabs that `scripts/powers/power-tabs.js` fills in `renderActorSheet`; presets are edited in
  `scripts/powers/preset-editor.js`. Actor flags: `powerPresets` (list of
  `{id, name, power, subtype, modifiers}`, modifiers as `"<power or general id>:<option id>"`) and
  `techLoadout` (`{power id: subtype id}`) and `concentration` (list of power ids). A power button calls the system's
  `DiceHelpers.rollSkill` for the power's skill and parks the power, subtype and modifiers for the
  roll dialog; the patched `RollBuilderFFG.getData` in `scripts/roll-power-modifiers.js` claims it
  (within 5 s, same discipline), moves the difficulty from Average to the base, ticks the preset's
  modifiers and narrows the modifier list.
- **Template.** `templates/actors/ffg-character-sheet.html` is the starwarsffg 2.0.3 template with
  the Specializations / Force Powers / Signature Abilities rows, the Force Pool, Force Powers and
  Signature Abilities lists and the Obligation tab removed, the medical counter labelled
  "Medi-gel", and empty Biotics and Tech tabs added; everything else is unchanged. The NPC templates
  (`ffg-minion/rival/nemesis-sheet.html`) have the same changes. All are swapped in by
  `scripts/override-actor-templates.js`. When the system updates, re-copy its templates and redo
  these changes (each is marked with an `Azecraft:` comment).
- **Styles.** `styles/character-sheet.css` is added as an **unlayered** `<link>` at `setup` by
  `scripts/character-sheet-theme.js`. The system's `mandar.css` is unlayered too, so a stylesheet
  in Foundry's `modules` CSS layer (the `styles` in `module.json`) could never override it. Rules
  are scoped to `.azcs.starwarsffg.sheet.actor`, and `.azcs` is added to character sheets in
  `renderActorSheet`. Because this stylesheet loads later, it wins ties with the system's rules.
  The one `!important` clears a grey `thead` background that the system sets with a six-class
  selector.
