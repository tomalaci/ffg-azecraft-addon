/**
 * "Apply damage" helper on weapon roll chat cards (GM only). It never acts on its own: the GM
 * clicks it, checks or edits each target's number in a dialog, and only then are wounds (or
 * strain) added. Targets are the GM's targeted tokens, or the selected ones when none are
 * targeted. Qualities other than Pierce, Breach and Stun Damage stay reminders on the card.
 */

import { damageAfterSoak, effectiveSoak, hasQuality, hitDamage, qualityRank } from "./damage.js";

const DAMAGEABLE = new Set(["character", "minion", "rival", "nemesis"]);

const { DialogV2 } = foundry.applications.api;

/** Weapon damage as the card shows it (adjusted, else the base value). */
function weaponDamage(data) {
    const adjusted = Number(data?.system?.damage?.adjusted);
    return adjusted ? adjusted : Number(data?.system?.damage?.value) || 0;
}

/** The weapon's current qualities (with attachments and ammo), from the item sheet summary. */
async function weaponQualities(roll) {
    const uuid = roll.data?.flags?.starwarsffg?.uuid ?? roll.data?.flags?.starwarsffg?.ffgUuid;
    try {
        const item = uuid ? await fromUuid(uuid) : null;
        const data = item ? await item.sheet.getData() : null;
        return data?.data?.doNotSubmit?.qualities ?? [];
    } catch {
        return [];
    }
}

function targetTokens() {
    const targeted = [...game.user.targets];
    return targeted.length ? targeted : canvas?.tokens?.controlled ?? [];
}

async function applyFromMessage(message) {
    const roll = message.rolls?.[0];
    const damage = hitDamage(weaponDamage(roll?.data), roll?.ffg?.success);
    const tokens = targetTokens().filter(token => DAMAGEABLE.has(token.actor?.type));
    if (!tokens.length) {
        ui.notifications.warn("Target (or select) the tokens that were hit first. Vehicles are not supported.");
        return;
    }

    const qualities = await weaponQualities(roll);
    const pierce = qualityRank(qualities, "Pierce");
    const breach = qualityRank(qualities, "Breach");
    const stun = hasQuality(qualities, "Stun Damage");
    const esc = foundry.utils.escapeHTML;

    const rows = tokens.map((token, index) => {
        const soak = Number(token.actor.system.stats?.soak?.value) || 0;
        const through = damageAfterSoak(damage, soak, { pierce, breach });
        return `<tr>
            <td>${esc(token.name)}</td>
            <td class="azdm-num" data-tooltip="Soak ${soak}${pierce || breach ? `, ${effectiveSoak(soak, { pierce, breach })} after Pierce/Breach` : ""}">${soak}</td>
            <td><input type="number" name="amount-${index}" value="${through}" min="0" step="1"></td>
            <td><select name="pool-${index}">
                <option value="wounds" ${stun ? "" : "selected"}>Wounds</option>
                <option value="strain" ${stun ? "selected" : ""}>Strain</option>
            </select></td>
        </tr>`;
    }).join("");

    const notes = [
        pierce ? `Pierce ${pierce}` : "",
        breach ? `Breach ${breach}` : "",
        stun ? "Stun Damage (to strain)" : ""
    ].filter(Boolean).join(", ");

    const result = await DialogV2.prompt({
        window: { title: `Apply damage: ${roll.data?.name ?? "hit"}`, icon: "fa-solid fa-burst" },
        position: { width: 480 },
        content: `<p>Hit for <strong>${damage}</strong> damage (${weaponDamage(roll.data)} + ${roll.ffg.success} successes)${notes ? `; ${esc(notes)}` : ""}. Check or change each number before applying.</p>
            <table class="azdm-table">
                <thead><tr><th>Target</th><th>Soak</th><th>Through</th><th>To</th></tr></thead>
                <tbody>${rows}</tbody>
            </table>`,
        ok: {
            label: "Apply",
            icon: "fa-solid fa-check",
            callback: (event, button) => new foundry.applications.ux.FormDataExtended(button.form).object
        },
        rejectClose: false
    });
    if (!result) return;

    const lines = [];
    for (const [index, token] of tokens.entries()) {
        const amount = Math.max(0, Math.trunc(Number(result[`amount-${index}`]) || 0));
        const pool = result[`pool-${index}`] === "strain" ? "strain" : "wounds";
        if (!amount) continue;
        const current = Number(token.actor.system.stats?.[pool]?.value) || 0;
        await token.actor.update({ [`system.stats.${pool}.value`]: current + amount });
        lines.push(`${esc(token.name)}: ${amount} ${pool}`);
    }
    if (lines.length) {
        await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ alias: "GM" }),
            content: `<div class="azdm-chat"><strong>Damage applied</strong> (${esc(roll.data?.name ?? "hit")})<br>${lines.join("<br>")}</div>`,
            whisper: ChatMessage.getWhisperRecipients("GM").map(user => user.id)
        });
    }
}

export function initApplyDamage() {
    Hooks.on("renderChatMessageHTML", (message, html) => {
        if (!game.user.isGM) return;
        const roll = message.rolls?.[0];
        if (roll?.data?.type !== "weapon" || !(roll.ffg?.success > 0)) return;
        const card = html.querySelector(".item-display") ?? html.querySelector(".message-content");
        if (!card || card.querySelector(".azdm")) return;

        const damage = hitDamage(weaponDamage(roll.data), roll.ffg.success);
        const bar = document.createElement("div");
        bar.className = "azdm";
        bar.innerHTML = `<button type="button" data-azdm="apply" data-tooltip="Add this hit's damage (after soak) to the targeted or selected tokens; you can check and change each number first">
            <i class="fa-solid fa-burst" inert></i> Apply ${damage} damage</button>`;
        card.append(bar);
    });

    // Delegated: the system re-renders chat card markup after this hook, dropping element listeners.
    document.addEventListener("click", event => {
        const button = event.target.closest?.(".azdm [data-azdm=apply]");
        if (!button || !game.user.isGM) return;
        event.preventDefault();
        const message = game.messages.get(button.closest("[data-message-id]")?.dataset.messageId);
        if (message) applyFromMessage(message);
    });
}
