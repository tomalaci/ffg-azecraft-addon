# Apply damage (GM)

Weapon roll chat cards that hit get an **Apply N damage** button, shown to GMs only. N is the
weapon's damage plus the uncancelled successes, as on the card. Nothing happens until the GM
clicks it and confirms:

1. Target the tokens that were hit (or select them; targets win when both are set). Characters,
   rivals, nemeses and minions are supported; vehicles are not.
2. Click **Apply N damage**. A window lists each target with its soak and the damage that gets
   through (damage minus soak, with the weapon's **Pierce** and **Breach** already taken off the
   soak). Weapons with **Stun Damage** default to strain.
3. Change any number or switch wounds / strain as the story needs, then **Apply**. The amounts are
   added to each target's current wounds or strain, and a GM-only whisper records what was
   applied.

Critical injuries, Burn, Ensnare, Disorient and other qualities are not applied: they stay on the
card as reminders for the table to resolve.

## How it works (developers)

`scripts/combat/damage.js` has the arithmetic (pure, unit-tested); `scripts/combat/apply-damage.js`
adds the button in `renderChatMessageHTML` for messages whose roll is a weapon roll
(`message.rolls[0].data.type === "weapon"`, successes from `roll.ffg.success`). The weapon's
qualities (including attachments and ammo) come from the same item sheet summary the card shows.
The click listener is delegated on `document`, because the system re-renders the card markup after
the hook runs.
