/**
 * Small −/+ buttons around number inputs (`<span class="az-stepper">`): power modifiers that may be
 * added several times (Range, Telekinesis Silhouette) in the roll dialog and the preset editor. The
 * buttons change the number within its min/max and fire the input's normal "change" event, so the
 * existing handlers see a typed value.
 */

let installed = false;

export function initSteppers() {
    if (installed) return;
    installed = true;
    document.addEventListener("click", event => {
        const button = event.target.closest?.(".az-stepper [data-step]");
        if (!button) return;
        event.preventDefault();
        const input = button.closest(".az-stepper").querySelector("input[type=number]");
        if (!input || input.disabled) return;
        const min = input.min === "" ? -Infinity : Number(input.min);
        const max = input.max === "" ? Infinity : Number(input.max);
        const next = Math.max(min, Math.min(max, (Number.parseInt(input.value, 10) || 0) + Number(button.dataset.step)));
        if (String(next) === input.value) return;
        input.value = String(next);
        input.dispatchEvent(new Event("change", { bubbles: true }));
    });
}
