# Shelved: character advancement managers (talents, skills, characteristics)

**Status: shelved (2026-10-02).** The GMs decided not to build talent, skill or characteristic
managers for now, to avoid over-engineering; there is no 0.6.0 goal yet. Kept as a record of the
design and of the rules it was checked against, in case the idea comes back. Nothing here is built.

## Principles

- **Wrappers, not replacements.** Talents stay items on the character, skill and characteristic
  purchases stay the system's own refundable purchases (an Active Effect per purchase, linked from
  the XP log). Drag-and-drop and the normal sheet keep working; the new screens make browsing,
  planning and bookkeeping easier.
- **No technical barriers.** Spending more XP than available is allowed: available goes negative and
  a warning shows. Rule breaches (Genesys talent pyramid, free starting ranks above 2, stat picks
  after creation) warn, they do not block. Players are trusted and fully control their own sheets;
  GMs sort out imbalances with them out of character.
- **Everything is logged** in the character's XP log, in a form XP Management can add up.

## Character sheet: three tabs under Species / Career

### Talents

- Browser of the world's talent items (Tier 1 and 2 for now; tiers 3 to 5 only need the items
  added): filters for tier, activation, ranked, text search, "suggested for my career" (the books'
  *Useful talents* lists), "affordable".
- Each talent shows its cost, owned rank and the next rank's cost (a ranked talent's next rank is one
  tier higher). A planning list adds up the XP before buying.
- Buying adds the talent item (as dragging it would) and logs a purchase linked to that item;
  removing it (here or with the sheet's delete) offers to refund the logged cost.
- Genesys pyramid rule, a guideline only (warning when it does not hold): after buying a talent in a
  tier, the character must have more talents in the tier directly below it. A talent on a
  character can be marked **not counted in the pyramid** (e.g. a bonus or custom talent awarded in
  the story); marked talents are left out of the check and shown as such.
- Cost: tier × 5 (no career discount in Genesys / Mass Effect), unless the talent item has the
  addon's **XP cost** override (new field on talent sheets). GMs make free or custom talents by
  copying a talent, renaming or rewording it and setting the cost (e.g. 0). No separate "grant".
- Dragging a talent onto the sheet goes through the same purchase path (the system only offers a
  purchase when XP suffices and otherwise adds the talent for free, unlogged).

### Skills

- Per skill: career skill marker; rank split into **Species | Career | XP** and total; next rank's
  cost (5 × new rank, +5 for non-career skills); buy (+) and refund (−) through the system's
  purchase (refundable, logged), without its "not enough XP" refusal.
- Free starting ranks per the Mass Effect book: one rank in four chosen career skills, the
  species' skill ranks (e.g. Humans: two non-career skills). During character creation no skill
  goes above rank 2, free or bought (Genesys core rules; warning).
  The tab records which ranks are species / career so they never count as XP.
- Existing characters: ranks backed by a logged purchase count as XP; the rest show as
  **Starting (unassigned)** until the player assigns them.

### Characteristics

- **Starting picks:** characteristic increases bought at character creation (10 × new rating, each
  step bought in order, as the system charges and the Genesys core rules set), against XP like any
  purchase. Per the core rules, creation is the only time XP buys characteristics, and no
  characteristic goes above 5 (warnings).
- **Extra increases:** later increases from the story (training, an event) with a reason and an
  optional XP cost (0 when the story grants it). Players and GMs can both add them.

## XP Management

- Per character, compare **spent according to the log** with **spent according to the sheet**
  (talent costs + XP-bought skill ranks + characteristic picks/increases) and flag imbalances
  (e.g. a talent with no purchase, a refund without removal, available XP below zero), with the
  details, so GMs can resolve them with the player.

## Data (to confirm while building)

- Talent cost override: item flag `ffg-azecraft-addon.xpCost` (empty = tier × 5).
- Pyramid exemption: flag `ffg-azecraft-addon.outsidePyramid` on the talent on the character
  (settable in the talent browser and on the talent's sheet).
- Skill rank sources: actor flag with species / career ranks per skill.
- Characteristic picks and extra increases: the system's refundable purchase for XP-costed ones;
  free story increases logged with their reason.
