# Item Maker

**Item Maker** in the toolbar (next to the Scene list) opens a window where anyone, players and GMs,
can make an item:

- **Type**: Weapon, Armour, Gear, Attachment, Item property, Talent or Ability.
- **Name**, and the stats that type has: skill, damage, critical rating, range and special for
  weapons; soak and defense for armour; price, rarity, encumbrance and *Restricted* for equipment;
  hard points for weapons, armour and attachments; quantity for gear; what an attachment fits; rank
  and what a property applies to; activation, tier and *Ranked* for talents. Melee and Brawl weapons
  add Brawn to their damage, as the system's own melee weapons do.
- **Item properties** (weapons, armour, gear, attachments): type in the search field and click a
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

- **Crafting cost**: **Add cost** adds a line: an amount and what pays it, either *Credits (character
  sheet)* or any entry of the Resources tracker (Funds, Element Zero, Omni-gel…; its current total
  is shown). If the GMs set a *suggested materials cost* (a percentage of the price), **Suggested**
  puts that amount on the credits line. With **Pay now** ticked (the default), creating the item
  takes the credits from the chosen character's sheet (players can choose their own characters;
  GMs also the active squad's) and records each resource as a Resources tracker change with the
  reason "Item Maker: <item> (made by <user>)". If anything is short, nothing is created and the
  window says what is missing. Untick it to only write the cost down. Either way the item's
  description ends with a **Crafting cost** list (amounts, who made it, and whether it was paid).

**Create** saves the item in the Items sidebar, in the folder **Item Maker › (your user name)**, and
opens it. You own it and everyone else can view it. Drag it onto a character, or (GMs) into another
folder, like any other item. The form keeps its values until you create the item or click **Clear**.

## Icon folders (GMs)

The *Icon folders (GM)* section at the bottom of the icon browser lists the folders everyone picks
icons from, subfolders included. By default these are the system's images and Foundry's core icon
folders (weapons, equipment, tools, consumables, commodities, containers, sundries, skills, and the
SVG icons). Add a folder by typing its path (for example `worlds/<world id>/icons`) or browsing for
it, and remove one with ×. The list is a world setting shared by every GM.

## Suggested materials cost (GMs)

The book's crafting rules are not built into the module. If your table uses a materials cost that
is a share of the item's price, enter that percentage in *Suggested materials cost* (Icon folders
section of the window, or Configure Settings → *Item Maker: suggested materials cost*). 0 turns the
suggestion off. Rarer materials (element zero, omni-gel…) are added by hand as Resources lines.

## How it works

Players may not create world items or browse files (Foundry's default permissions for the Player
role), so a player's Item Maker asks the active GM's client over the module socket. That client
lists icon folders, but only inside the allowed folders and without the folders Foundry marks
private. Requests and replies go only between the asking user and the active GM, and replies are
only accepted from a GM. Other GMs' requests also go through the active GM, so two GMs never create
the Item Maker folders twice. It also creates items from the form's
values: the item is always built by the module from those values, and a player cannot send other
item data. **A GM must be online** for players to browse icons and create items; without one, the
window says so. GMs browse and create directly.

The cost is checked (the requesting user must own the paying character; totals must cover every
line) before the item is created, and paid after it (credits are checked once more). If a payment
fails after that, the item stays, and a warning says which part a GM should adjust by hand.

Created items carry the flag `flags.ffg-azecraft-addon.itemMaker = { createdBy, createdAt, cost:
{ lines: [{resource, label, amount}], paid, payer } }`. The
folders are found by their flag (`itemMakerFolder`: `root`, or the creator's user id), so GMs can
rename or recolour them.

Files: `scripts/item-maker/item-maker-core.js` (rules: types, drafts, item data, similar names, icon
paths; unit-tested in `tests/item-maker-core.test.js`), `scripts/item-maker/item-maker.js` (window,
socket relay, settings), `templates/item-maker/item-maker.hbs`, `styles/item-maker.css`.
