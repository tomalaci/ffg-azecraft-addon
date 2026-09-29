/**
 * "Reduce visual effects" (per-player setting): turns off the addon's animations, glows, blurs and
 * angled corners for weaker machines, via the body class `azecraft-lite` (styles/perf.css).
 * Animations are also off whenever the operating system asks for reduced motion.
 */

const MODULE_ID = "ffg-azecraft-addon";
const SETTING = "reduceEffects";

function apply() {
    document.body.classList.toggle("azecraft-lite", game.settings.get(MODULE_ID, SETTING));
}

export function initVisualEffects() {
    game.settings.register(MODULE_ID, SETTING, {
        name: "Reduce visual effects",
        hint: "Turn off the dashboard's and sheets' animations, glows and angled corners. Try this if the game feels laggy on this computer.",
        scope: "client",
        config: true,
        type: Boolean,
        default: false,
        onChange: apply
    });
    Hooks.once("ready", apply);
}
