# Mass Effect Genesys — Biotics and Tech Difficulty Modifiers

The PDF’s custom dice symbols are normalized below:

* **Difficulty die** = purple die
* **Setback die** = black die
* **Upgrade difficulty once** = replace one Difficulty die with one Challenge die
* Difficulty levels: **Simple 0**, **Easy 1**, **Average 2**, **Hard 3**, **Daunting 4**, **Formidable 5**

Increasing difficulty and upgrading difficulty are separate operations in Genesys.

## General Biotics modifiers

These apply independently of the selected power effects.

| Condition                                                                                                                                                    |                                                Modifier |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------: |
| Character does not have at least one free hand                                                                                                               |                                          +1 Setback die |
| Character wears armor granting +2 soak or more, or carries a shield                                                                                          |                                          +1 Setback die |
| Concentration is disrupted: swimming, hanging from a rope, sandstorm, using a power against someone other than the opponent engaged with the character, etc. | Upgrade difficulty once, or more at the GM’s discretion |

## Biotic base powers

| Power       |                                                Base difficulty | Concentration |
| ----------- | -------------------------------------------------------------: | :-----------: |
| Attack      |                                        Easy — 1 Difficulty die |       No      |
| Augment     |                                    Average — 2 Difficulty dice |      Yes      |
| Barrier     |                                        Easy — 1 Difficulty die |      Yes      |
| Domination  | Average — 2 Difficulty dice, or opposed Biotics vs. Discipline |      Yes      |
| Telekinesis |                                        Easy — 1 Difficulty die |       No      |

---

# Biotic Attack

**Base:** Easy — 1 Difficulty die.
**Default range:** Short.

| Additional effect |                   Modifier | Effect                                                                                                            |
| ----------------- | -------------------------: | ----------------------------------------------------------------------------------------------------------------- |
| Blast             |          +1 Difficulty die | Gains Blast equal to ranks in Knowledge (PhysSci).                                                                |
| Close Combat      |          +1 Difficulty die | May target an engaged opponent. The caster is unaffected by their own Blast.                                      |
| Reave             |          +1 Difficulty die | Gains Critical 2 and Vicious equal to ranks in Knowledge (LifeSci). Organic targets only.                         |
| Annihilation      |          +1 Difficulty die | Gains Burn equal to ranks in Discipline.                                                                          |
| Lift              |          +1 Difficulty die | Gains Ensnare equal to ranks in Discipline.                                                                       |
| **Shockwave**     |      **+1 Difficulty die** | Gains Knockdown and Disorient equal to ranks in Knowledge (PhysSci).                                              |
| Non-Lethal        |          +1 Difficulty die | Gains Stun Damage.                                                                                                |
| Pull              |          +1 Difficulty die | On a hit, spend 1 Advantage to move the target horizontally by up to one range band.                              |
| Charge            |          +1 Difficulty die | On a hit, the caster automatically moves into engaged range with the target.                                      |
| Range             | +1 Difficulty die per rank | Increase the attack’s range by one range band per application.                                                    |
| Priming           |          −1 Difficulty die | Deals no damage, but qualities can still activate. Cannot combine with Annihilation, Blast, or Detonating.        |
| Warp              |         +2 Difficulty dice | Gains Sunder and Pierce equal to ranks in Knowledge (PhysSci).                                                    |
| Detonating        |         +2 Difficulty dice | Damage becomes twice Willpower. Blast affects everyone within short range of the target instead of engaged range. |

### Example: Shockwave

```markdown
**Biotic Attack — Shockwave**

- Base: Easy (1 Difficulty)
- Shockwave: +1 Difficulty
- Final difficulty: Average (2 Difficulty)
```

With one Range enhancement:

```markdown
**Biotic Attack — Shockwave — Range**

- Base: Easy (1 Difficulty)
- Shockwave: +1 Difficulty
- Range: +1 Difficulty
- Final difficulty: Hard (3 Difficulty)
```

---

# Biotic Augment

**Base:** Average — 2 Difficulty dice.
**Base range:** Engaged.

| Additional effect |                   Modifier | Effect                                                                                                                                                                                                            |
| ----------------- | -------------------------: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Speed             |          +1 Difficulty die | Targets may always perform a second maneuver without suffering strain.                                                                                                                                            |
| Biotic Warrior    |          +1 Difficulty die | Targets add damage equal to ranks in Knowledge (LifeSci) to unarmed attacks; their unarmed Critical rating becomes 3.                                                                                             |
| Range             | +1 Difficulty die per rank | Increase range by one range band per application.                                                                                                                                                                 |
| Levitate          |          +1 Difficulty die | Targets can hover and suffer no falling damage.                                                                                                                                                                   |
| Warp Ammunition   |          +1 Difficulty die | Ranged attacks gain Pierce 2 or increase existing Pierce by 1, and ignore Setback dice imposed by biotic barriers. Replaces the normal Augment effect and cannot combine with Speed, Biotic Warrior, or Levitate. |
| Additional Target |         +2 Difficulty dice | Affect one additional target. After using the power, spend 1 Advantage per further target.                                                                                                                        |

---

# Biotic Barrier

**Base:** Easy — 1 Difficulty die.
**Base range:** Engaged.

| Additional effect |                   Modifier | Effect                                                                                                                     |
| ----------------- | -------------------------: | -------------------------------------------------------------------------------------------------------------------------- |
| Additional Target |          +1 Difficulty die | Affect one additional target. After using the power, spend 1 Advantage per further target.                                 |
| Range             | +1 Difficulty die per rank | Increase range by one range band per application.                                                                          |
| Add Defense       |         +2 Difficulty dice | Each target gains melee and ranged defense equal to ranks in Knowledge (PhysSci).                                          |
| Empowered         |         +2 Difficulty dice | Damage reduction equals the number of uncancelled Successes instead of using the normal Barrier effect.                    |
| Backlash          |         +2 Difficulty dice | When an attacker generates 3 Threat or 1 Despair, they suffer a hit equal to the attack’s total damage after resolving it. |

---

# Biotic Domination

**Base:** Average — 2 Difficulty dice.
At the GM’s discretion, use an opposed **Biotics vs. Discipline** check instead. Organic targets only.

| Additional effect |                   Modifier | Effect                                                                                                                                         |
| ----------------- | -------------------------: | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Enervate          |          +1 Difficulty die | Whenever the target suffers strain, it suffers 1 additional strain.                                                                            |
| Range             | +1 Difficulty die per rank | Increase range by one range band per application.                                                                                              |
| Additional Target |         +2 Difficulty dice | Affect one additional target. After using the power, spend 1 Advantage per further target.                                                     |
| Confusion         |         +2 Difficulty dice | After the target rolls a check, change one die not showing Triumph or Despair to another face.                                                 |
| Stasis            |         +3 Difficulty dice | Target is staggered and immobilized. Cannot combine with Additional Target.                                                                    |
| Mind Control      |         +3 Difficulty dice | Target obeys the caster. The caster may spend a maneuver to determine the target’s action and maneuver. Cannot combine with Additional Target. |

---

# Biotic Telekinesis

**Base:** Easy — 1 Difficulty die.
Targets one silhouette-0 object within short range.

| Additional effect |                   Modifier | Effect                                                                                                                                                                           |
| ----------------- | -------------------------: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Silhouette        | +1 Difficulty die per rank | Increase the maximum object silhouette by one per application.                                                                                                                   |
| Range             | +1 Difficulty die per rank | Increase the distance the object can be moved by one range band per application.                                                                                                 |
| Fine Control      |          +1 Difficulty die | Allows precise manipulation equivalent to using the character’s hands.                                                                                                           |
| Throw             |         +2 Difficulty dice | Throw the object as a ranged combat attack. Damage is 5 for silhouette 0, or 10 × silhouette for silhouette 1+. For every silhouette beyond 1, also upgrade the difficulty once. |

---

# General Tech modifiers

These apply independently of the selected Tech power effects.

| Condition                                                                                                                                                 |                                                Modifier |
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------: |
| Character does not have at least one free hand                                                                                                            |                                          +1 Setback die |
| Target is protected by the Biotic Barrier power                                                                                                           |                                          +1 Setback die |
| Electronic interference: high-powered magnet, lightning storm, underwater use, targeting someone other than the opponent engaged with the character, etc. | Upgrade difficulty once, or more at the GM’s discretion |

An active omni-tool on the free hand **does not** count as occupying that hand.

## Tech base powers

| Power          |             Base difficulty | Concentration |
| -------------- | --------------------------: | :-----------: |
| Tech Attack    | Average — 2 Difficulty dice |       No      |
| Tech Construct | Average — 2 Difficulty dice |      Yes      |
| Sabotage       | Average — 2 Difficulty dice |      Yes      |
| Tech Augment   | Average — 2 Difficulty dice |      Yes      |

---

# Tech Attack

**Base:** Average — 2 Difficulty dice.
**Default range:** Short. Each subtype—Incinerate, Cryo Blast, Overload, and Neural Shock—is readied separately.

| Additional effect |                   Modifier | Effect                                                                                                                                           |
| ----------------- | -------------------------: | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Blast             |          +1 Difficulty die | Gains Blast equal to ranks in Knowledge (PhysSci).                                                                                               |
| Close Combat      |          +1 Difficulty die | May target an engaged opponent. The caster is unaffected by their own Blast.                                                                     |
| Deadly            |          +1 Difficulty die | Gains Critical 2. Vicious equals Knowledge (PhysSci) against synthetics or Knowledge (LifeSci) against organics. Cannot combine with Non-Lethal. |
| Impact            |          +1 Difficulty die | Gains Knockdown. On a hit, spend 1 Advantage to move the target horizontally by up to one range band.                                            |
| Non-Lethal        |          +1 Difficulty die | Gains Stun Damage.                                                                                                                               |
| Anti-Synthetic    |          +1 Difficulty die | Against synthetic targets, each uncancelled Success adds 2 damage instead of 1. Overload only.                                                   |
| Anti-Organic      |          +1 Difficulty die | Against organic targets, each uncancelled Success adds 2 damage instead of 1. Incinerate, Cryo Blast, or Neural Shock only.                      |
| Range             | +1 Difficulty die per rank | Increase range by one range band per application.                                                                                                |
| Priming           |          −1 Difficulty die | Deals no damage, but qualities can still activate. Cannot combine with Deadly, Blast, or Detonating.                                             |
| Multi-Target      |         +2 Difficulty dice | Gains Auto-fire. The normal difficulty increase for using Auto-fire is already included in this modifier.                                        |
| Detonating        |         +2 Difficulty dice | Damage becomes twice Intellect. Blast affects everyone within short range of the target instead of engaged range.                                |

## Tech Attack subtypes

These subtype abilities do not inherently add further difficulty.

| Subtype      | Inherent effect                                                                                       |
| ------------ | ----------------------------------------------------------------------------------------------------- |
| Incinerate   | Burn equal to Knowledge (PhysSci); Sunder against the target’s armor.                                 |
| Cryo Blast   | Ensnare equal to Knowledge (PhysSci); spend Triumph to stagger the target for one round.              |
| Overload     | Phasic equal to half Knowledge (PhysSci), rounded up; Sunder against electronic equipment.            |
| Neural Shock | Disorient equal to Knowledge (LifeSci); spend Triumph to stagger for one round; organic targets only. |

---

# Tech Construct

**Base:** Average — 2 Difficulty dice.
The construct normally appears at engaged range.

| Additional effect |                   Modifier | Effect                                                                                                                                               |
| ----------------- | -------------------------: | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Range             | +1 Difficulty die per rank | Summon the construct one additional range band away per application.                                                                                 |
| Detonate          |          +1 Difficulty die | The caster may spend a maneuver to destroy the construct. Everyone engaged with it suffers damage equal to Intellect + ranks in Knowledge (PhysSci). |

Construct subtypes are **Barricade**, **Combat Drone**, **Decoy**, and **Supply Pylon**.

---

# Tech Sabotage

**Base:** Average — 2 Difficulty dice.
**VI Hacking:** Daunting — 4 Difficulty dice, or opposed **Tech vs. Computers** at the GM’s discretion.

| Additional effect |                   Modifier | Effect                                                                                         |
| ----------------- | -------------------------: | ---------------------------------------------------------------------------------------------- |
| Damping           |          +1 Difficulty die | After the target rolls a check, change one Setback die to a face showing Failure.              |
| Range             | +1 Difficulty die per rank | Increase range by one range band per application.                                              |
| Additional Target |         +2 Difficulty dice | Affect one additional target. After using the power, spend 1 Advantage per further target.     |
| Malfunction       |         +2 Difficulty dice | After the target rolls a check, change one die not showing Triumph or Despair to another face. |

Sabotage subtypes—**Invasion**, **Overheat**, **Energy Drain**, **Tactical Scan**, and **VI Hacking**—are all available when Sabotage is readied.

---

# Tech Augment

**Base:** Average — 2 Difficulty dice.
**Base range:** Engaged. Each subtype—Tech Armor, Charged Melee, Turbocharge, and Tactical Cloak—is readied separately.

| Additional effect  |                   Modifier | Effect                                                                                     |
| ------------------ | -------------------------: | ------------------------------------------------------------------------------------------ |
| Range              | +1 Difficulty die per rank | Increase range by one range band per application.                                          |
| Recon Visor        |          +1 Difficulty die | Affected targets may perform the Aim maneuver as an incidental.                            |
| Overcharge Shields |         +2 Difficulty dice | Affected targets gain melee and ranged defense equal to ranks in Knowledge (PhysSci).      |
| Additional Target  |         +2 Difficulty dice | Affect one additional target. After using the power, spend 1 Advantage per further target. |
