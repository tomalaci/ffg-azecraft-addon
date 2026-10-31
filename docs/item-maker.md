# Item Maker

**Item Maker** in the toolbar (next to the Scene list) opens a window where anyone, players and GMs,
can make an item:

- **Type**: Weapon, Armour, Gear or Attachment.
- **Name**, and the stats that type has: skill, damage, critical rating, range and special for
  weapons; soak and defense for armour; base price, rarity, encumbrance and *Restricted* for all of
  them; hard points for weapons, armour and attachments; quantity and *Single use* for gear; *Single
  use* for weapons; what an attachment fits. Melee and Brawl weapons add Brawn to their damage, as the
  system's own melee weapons do.
- **Item properties**: type in the search field and click a
  property, or press Enter, to add the first result. Set each property's rank; × removes it. The list
  comes from the world's Item property items that only GMs can edit (so properties made by players,
  in the Item Maker or elsewhere, are not offered). When two have the same name, the one in an "Item
  Properties" folder is used. They are added the way dropping a property on an item adds them: as
  copies with their rank, plus the property's Active Effects on weapons, armour and attachments.
- **Icon**: pick one in the icon browser on the right. Choose an icon folder from the list, open
  subfolders, and use the filter for big folders. Click the icon at the top of the form to jump to
  the browser. Without a choice, the system's default image for the type is used.
- **Description**: plain text; an empty line starts a new paragraph.
- **Similar items**: while you type a name, items with similar names show under it (only items you
  can see). Click one to open it, for example to check that what you want does not exist already.

- **Price**: worked out as you fill in the form, line by line, from the [price table](#price-table):
  the base price, then what the damage, critical rating, range, soak, defense and each property add,
  then the percentages (Melee and Brawl weapons, single-use items). The **base price** is for what the
  stats and properties don't cover, such as a narrative feature or an attachment's effect. The item
  gets this price, and its description ends with a **Price** list of the lines and the total. Nothing
  is paid when the item is made; the price is what the item is worth, for buying it or adding it to a
  character.
- **Crafting** (Mass Effect crafting rules), also written into the item:
  - *Materials*: half the price (used up whether the check succeeds or not).
  - *Check*: the skill and the difficulty, half the rarity rounded up (rarity 3: Average, 2 dice;
    Formidable at most). The skill is Computers for omni-tools and amps (Tech and Biotics weapons)
    and Mechanics otherwise; choose another (Medicine for medical gear) in *Crafting skill*.
  - *Time*: 1 hour plus 1 per point of rarity for items of encumbrance 1 or less, otherwise days;
    half with a fabricator.
- **Book guidance**: warnings from the Genesys weapon design advice, for example *Stun 6: recommended
  rank 1–4* (higher can stun a target for the whole fight), Cumbersome or Unwieldy 1 (does nothing),
  more than four properties, Pierce with Breach, or a critical rating of 1 or 6. They are suggestions:
  the item can still be made, and its description then ends with a **Warnings** list of them.

**Create** saves**Create** saves the item in the Items sidebar, in the folder **Item Maker › (your user name)**, and
opens it. You own it and everyone else can view it. Drag it onto a character, or (GMs) into another
folder, like any other item. The form keeps its values until you create the item or click **Clear**.

## Icon folders (GMs)

The *Icon folders (GM)* section at the bottom of the icon browser lists the folders everyone picks
icons from, subfolders included. By default these are the system's images and Foundry's core icon
folders (weapons, equipment, tools, consumables, commodities, containers, sundries, skills, and the
SVG icons). Add a folder by typing its path (for example `worlds/<world id>/icons`) or browsing for
it, and remove one with ×. The list is a world setting shared by every GM.

## Price table

**Price table** (at the end of the type buttons) shows what each stat point and property adds to a
made item's price. Everyone can read it; GMs can change it and click **Save** (a world setting).
Changed values are marked, and the defaults are listed beside them. An empty field goes back to its
default, and **Reset to defaults** puts the whole table back.

- **Weapons**: an amount for each damage point by band (4–5, 6–7, 8–9, 10–12, 13 and up; 1–3 are
  free), for critical ratings 4 to 1 (5 and up are free), and for Medium, Long and Extreme range;
  then a percentage of the price for Melee and Brawl weapons (they add Brawn) and for single-use
  weapons and gear.
- **Armour**: soak and defense by point (the 1st, 2nd and 3rd point each have an amount, every
  point from the 4th the same amount), plus an amount when the armour has both.
- **Item properties**: every property in the world, with a flat amount, an amount per rank, and the
  recommended ranks (*Min rank* / *Max rank*, 0 for no limit) behind the book guidance warnings.
  Drawbacks are negative (Cumbersome and Unwieldy start at 100 and take 100 off per rank, so rank 1
  costs nothing). A property not in the table costs the *any other property* amount per rank. Also
  here: how many properties one item may have before a warning (0: no warning).
- **Crafting**: materials as a percentage of the price (50) and the crafting time with a fabricator
  (50% of the time).

The defaults follow the Genesys Core weapon and armour design guidance and the Mass Effect crafting
rules, checked against the prices of the world's weapons and armour: standard pistols, rifles, shotguns, knives, swords and light armour come out close to their
listed prices. Heavy weapons and setting-specific gear often have features the table cannot see
(add them as a base price or adjust the table).

## How it works

## How it works

Players may not create world items or browse files (Foundry's default permissions for the Player
role), so a player's Item Maker asks the active GM's client over the module socket. That client
lists icon folders, but only inside the allowed folders and without the folders Foundry marks
private. Requests and replies go only between the asking user and the active GM, and replies are
only accepted from a GM. Other GMs' requests also go through the active GM, so two GMs never create
the Item Maker folders twice. It also creates items from the form's
values: the item is always built by the module from those values, and the price is worked out on
the GM's client from the price table, so a player cannot send other item data or their own price. **A GM must be online** for players to browse icons and create items; without one, the
window says so. GMs browse and create directly.

Created items carry the flag `flags.ffg-azecraft-addon.itemMaker = { createdBy, createdAt, price:
{ lines: [{label, amount}], total }, crafting: { materials, skill, dice, difficulty, time, fabricator,
unit }, warnings: [text] }`. The
folders are found by their flag (`itemMakerFolder`: `root`, or the creator's user id), so GMs can
rename or recolour them.

Files: `scripts/item-maker/item-maker-core.js` (rules: types, drafts, item data, similar names, icon
paths; unit-tested in `tests/item-maker-core.test.js`), `scripts/item-maker/item-prices.js` (price table
rows, default property prices and recommended ranks, the price, crafting and design warnings;
`tests/item-prices.test.js`),
`scripts/item-maker/item-maker.js` (window, socket relay, settings), `templates/item-maker/item-maker.hbs`, `styles/item-maker.css`.
