# Mission Dashboard: GM and player guide

The mission dashboard is a heads-up display shown on **every** Foundry Scene. On the left is a column of
squad cards. At the bottom are the mission panels: the current objective, a mission summary, and key
intel with People of Note. The map in the middle stays a normal, playable canvas. Panning and zooming
move the map, not the dashboard.

The dashboard only shows information that lives elsewhere:

| Shown on the dashboard | Where it really lives |
| --- | --- |
| Name, portrait, wounds, strain, soak, defense, species, career, critical injuries | The character's Actor (the normal character sheet) |
| Full-body art and Desire | The character's Actor (saved with the character, shared across missions) |
| Mission summary, current objective, key intel | Journal pages you choose |
| Which characters, pages and People of Note belong to this mission | The Scene |
| Fame and faction reputation | The campaign ledger Journal (shared by all GMs and Scenes) |
| Hidden, compact or collapsed | Each person's own browser |

In the game, the **(?)** button in the dashboard header opens a help window with a GM quick start, a
player quick start and a short reference for every feature. The configuration and Campaign Standing
windows have a Help entry too.

## Campaign dashboard and per-Scene setups

Every Scene shows the dashboard, including Scenes created later. Normally all of them share one
**campaign dashboard**: the squad, mission pages and People of Note are set up once and appear
everywhere. That fits a campaign that moves between a ship, a hub and battle maps during one
mission.

A GM can give a Scene **its own squad and mission** instead, for a one-off mission or a side
party. In that Scene's configuration, choose *This Scene's own squad and mission* under **Squad
and mission**. It starts as a copy of the campaign dashboard. To promote a Scene's own setup to the
campaign dashboard, click **Use as campaign dashboard** and save. That Scene switches back to the
campaign dashboard, but its old setup is kept, so you can switch back to it later.

To keep the dashboard off one Scene (a title card, say), untick **Show dashboard on this Scene** or
right-click the Scene and choose **Hide Mission Dashboard on this Scene**. **Show Mission Dashboard
on this Scene** undoes it. The world setting *Show mission dashboard on every Scene* (Configure
Settings → FFG Azecraft Addon) turns the always-on behaviour off; then only Scenes with the box
ticked show it.

Minimizing (the eye button) is separate: each person hides the dashboard on their own screen to
look at the Scene art, and brings it back with the **Dashboard** button.

## Setting up the dashboard (GM)

1. Click the gear button in the dashboard header on any Scene. You can also right-click a Scene in
   the Scenes sidebar and choose **Configure Mission Dashboard**, or use **Mission Dashboard** in a
   Scene configuration window's header menu (⋮).
2. Keep **Squad and mission** on **Campaign dashboard** (or pick the Scene's own setup, see above).
3. Keep **Show dashboard on this Scene** ticked.
4. Under **Squad**, choose a character for each slot. Characters from the *Player Characters* Actor
   folder are listed first. There are six slots by default. Use **Add slot**, the arrows and the
   trash button to change the count and order. Empty slots are hidden from players. Each character
   can only be in one slot.
5. Under **Mission ledgers**, the default ledger per tab is chosen (see below). Leave it on *Most
   recent ledger*, or click the book button to create one.
6. Optionally add **People of Note** (see below).
7. Click **Save**.

### Ledgers and entries

Each tab (Current Objective, Mission Summary, Key Intel) shows a **ledger**: a Journal whose pages
are that tab's entries, oldest first. The module keeps ledgers in its own Journal folder,
**Mission Dashboard**, with the subfolders **Objectives**, **Mission Summaries** and **Key Intel**.
The active GM's client creates these folders automatically. Your other Journals are never touched.
You can rename or move the folders and ledgers; they're recognized by a hidden tag, not by name.

- **What everyone sees first**: the newest entry of the tab's default ledger. If no default is set,
  the most recently created ledger is used.
- **Switching and browsing (everyone)**: the dropdown under a tab's title switches ledgers (★ marks
  the default), and ‹ 2/3 › browses entries. This only changes your own screen. An *Earlier entry*
  banner with **Back to current** shows when you're not on the newest entry.
- **New entry (GM, +)**: adds the next page (e.g. *Objective 3*) to the ledger you're viewing and
  opens it for editing. It becomes the newest entry for everyone; earlier entries stay as history.
- **New ledger (GM, book button)**: creates a ledger in the right folder for a new operation or side
  job. It can become the default, and you can leave it hidden from players while you prepare it.
- **Set as default (GM, ☆)**: makes the ledger you're viewing the tab's default. The default is
  stored with the dashboard setup: the campaign dashboard, or a Scene's own setup.
- **Permissions**: players only see ledgers and entries they can read. Secret blocks in an entry are
  only shown to GMs. The pencil button opens the entry's editor.

Use the tabs like this:

- **Summary** answers “why are we here?”
- **Current Objective** answers “what do we do next?” Keep it short. It is highlighted in orange and
  stays visible even when the mission panels are collapsed.
- **Key Intel** holds People, Places and Clues. Normal Actor, Item and Journal links work there.

### Starting a new mission

Create a new ledger on each tab (it can become the default right away), or add entries with **+**
as the mission moves on. Old ledgers stay available in the dropdown. A duplicated Scene keeps its
settings, including a Scene's own default ledgers. Actors, Journals and reputation are never copied
automatically.

## People of Note (GM)

In the configuration, click **Add person**, choose the NPC's Actor, and fill in any of *Role*,
*Status*, *Relationship* and *Note*. The name and portrait always come from the Actor.

- A player only sees an entry if they can see its Actor. The Actor's ownership must be **Limited** or
  higher for that player (or as the default). You see entries players can't see marked **GM only**,
  and the configuration warns about them.
- In this campaign, NPC Actors default to no access for players. For a Person of Note to appear
  for players, set that NPC's ownership (right-click it in the Actors sidebar, then Configure
  Ownership) to **Limited** for all players. Limited shows the name and portrait but not the sheet
  details.
- Everything typed into these fields can be read by players. Keep secrets in the GM Notes page.
- Clicking a name or portrait opens the Actor's sheet if the user is allowed to.

The Key Intel page is shown under the People of Note cards, so free-form people, places and clues
still work.

## Character cards

- Click a character's **name** or **art** to open their sheet.
- Click a **critical injury** to open that injury.
- **Wounds** and **Strain** show the current value against the threshold, exactly as on the sheet.
  A value above the threshold is shown in red and marked *over*. The bar stops at full, but the
  number always shows the real value. The dashboard doesn't apply any rules effects.
- **Soak**, **Def M** (melee) and **Def R** (ranged) are the values from the sheet, including gear
  and effects. A dash (—) means the value isn't set on the sheet.

### Desire (players)

Desire is what you would like your character to pursue or experience in play. It belongs to the
character, so it carries over to every mission.

- The character's owner (and any GM) sees a pencil next to **Desire**. Click it, type up to 500
  characters, and click **Save** (or press Ctrl+Enter). **Cancel** or Escape discards your changes.
- If someone else changes the Desire while you are typing, your text is kept. A warning shows their
  version, and you can switch to it or save yours over it.
- Everyone who can see the character's stats can read their Desire.

### Full-body art

Hover a card and click the image button in the corner of the art to set dashboard art for the
character. Art is shown whole, not cropped. Leave the path empty to go back to the Actor portrait.
Players who can't browse files can paste a path that a GM gives them. If an image can't be loaded,
the card falls back to the portrait.

## Hiding and compact mode (everyone)

By default the squad column and the mission bar form a solid **frame** around the map; the Scene
shows through the window between them. The client setting *Mission dashboard style* switches to
separate **floating panels** instead.

These buttons in the dashboard header only affect **your** screen:

- **Crop** (Fit Scene): zooms and pans your view so the whole Scene image sits inside the frame.
  GMs can tick *Fit into the frame when opened* in a Scene's dashboard configuration (good for art
  and landing Scenes) so this happens once whenever someone opens that Scene.

- **Eye** (Focus map): hides the dashboard. A small **Dashboard** button stays at the top of the
  screen, just right of the Scene list, to bring it back. You can also bind a key to *Toggle mission dashboard* in Configure Controls.
- **List**: compact cards. The button cycles between Auto, On and Off. *Auto* turns compact mode on
  for small screens or when the sidebar leaves little room. In compact mode, the expand button on a
  card shows its details.
- **Chevron**: collapses the mission panels to one bar that still shows the current objective.

The same options are in **Game Settings → Configure Settings → FFG Azecraft Addon**.

## Fame and faction reputation

**Fame** is how well known the squad is. **Faction reputation** is how much a particular
organization likes them. Fame was called Renown in earlier planning. Both are plain whole numbers
that start at 0. There are no caps and no automatic effects on rolls.

Open the campaign window with the **Fame** button in the dashboard header, or from the console with
`game.modules.get("ffg-azecraft-addon").api.missionDashboard.openCampaign()`.

### First-time setup (GM)

Open the campaign window and click **Create ledger**. This creates a Journal named
*Campaign Reputation Ledger*. Players can read it but can't change it, and every Scene and every GM
uses the same one. If the ledger Journal is ever deleted, the window lets a GM create a new one or
select another existing ledger. It is never recreated automatically.

### Recording changes (GM)

- **Add faction**, then use **+1** or **−1** on its row, or on Fame. A dialog opens where you can
  change the amount and must enter a **reason**. Players see the reason, so keep it player-safe. The
  session label is optional.
- For an existing campaign, record the current values as opening entries, for example
  “+3 Systems Alliance: Opening balance”.
- Mistakes are fixed with **Correct** (the ↺ button in History). It records a new entry that reverses
  the original. The original stays in the history, marked *corrected*.
- **Archive** hides a faction from the list without losing its history, and **Rename** keeps its
  history attached.

Each change is a separate page in the ledger Journal, so two GMs recording at the same moment both
get counted. The history is a campaign log for the table, not a tamper-proof audit: a GM can still
edit the Journal directly.

## Permissions summary

| Action | Who |
| --- | --- |
| Enable, configure, assign squad and pages, People of Note | GMs |
| See a card's stats and Desire | Anyone with Observer or higher on that Actor |
| See only a card's name and art | Limited on that Actor |
| Edit Desire or full art | The Actor's owners and GMs |
| Read mission panels | Anyone who can read the page (Observer) and see its Journal (Limited) |
| Record Fame or reputation changes, manage factions | GMs |
| Read Fame, reputation and history | Anyone who can read the ledger Journal |
| Hide, compact or collapse the dashboard | Each person, for themselves only |

In this campaign, player characters use Observer as their default ownership, so every player sees
every PC card. The dashboard never changes anyone's permissions.

## Tokens

Cards always show the **world Actor**. Linked tokens, which is how player characters are normally
set up, share that Actor, so damage done through them shows on the card. Damage on an unlinked
token only changes that token, so the card won't show it.
