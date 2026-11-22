/**
 * Range bands layer (`canvas.azecraftRangeBands`): rings, labels and grid shading around the tokens
 * this client has switched on. It sits in the interface group just below the tokens layer
 * (zIndex 180 < 200), where each token's void mesh lets the token art show on top, and below
 * manual fog (190 and up). Being on the canvas, it pans and zooms with the map.
 */

import { MODULE_ID, SETTINGS, bandRadii, cellBand, colorNumber, normalizeConfig, sceneDistance } from "./range-core.js";

export const LAYER = "azecraftRangeBands";
/** Shading is skipped beyond this many grid cells per token (huge rings on big maps). */
const MAX_CELLS = 40000;

/** Token ids this client shows bands for. Kept in memory only, never stored. */
const shown = new Set();

export const getConfig = () => normalizeConfig(game.settings.get(MODULE_ID, SETTINGS.config));

export default class RangeBandsLayer extends foundry.canvas.layers.CanvasLayer {
    static get layerOptions() {
        return foundry.utils.mergeObject(super.layerOptions, { name: LAYER, zIndex: 180 });
    }

    /** Drawn bands by token id: {container, rings, shading, center, size}. */
    #items = new Map();
    /** Tokens whose shading waits for them to stop moving. */
    #stale = new Set();
    #flush = foundry.utils.debounce(() => {
        for (const id of this.#stale) {
            const token = canvas.tokens?.get(id);
            if (token && shown.has(id)) this.drawToken(token);
        }
        this.#stale.clear();
    }, 200);

    isShown(token) {
        return shown.has(token.id);
    }

    /** Show or hide a token's bands (force: true shows, false hides). */
    toggle(token, force = !this.isShown(token)) {
        if (force) {
            shown.add(token.id);
            this.drawToken(token);
        } else {
            this.remove(token.id);
        }
        return force;
    }

    remove(id) {
        shown.delete(id);
        this.#stale.delete(id);
        this.#items.get(id)?.container.destroy({ children: true });
        this.#items.delete(id);
    }

    redrawAll() {
        for (const id of [...shown]) {
            const token = canvas.tokens?.get(id);
            if (token) this.drawToken(token);
            else this.remove(id);
        }
    }

    async _draw() {
        // A redraw of the same scene keeps its tokens' bands; tokens of another scene are dropped.
        this.redrawAll();
    }

    async _tearDown(options) {
        this.#items.clear();
        this.#stale.clear();
        return super._tearDown(options);
    }

    /** Called on every refresh of a shown token: move the rings, redraw shading once it stops. */
    follow(token) {
        const item = this.#items.get(token.id);
        if (!item || item.size !== `${token.w}x${token.h}`) return this.drawToken(token);
        item.container.visible = token.visible;
        const { x, y } = token.center;
        if (x === item.center.x && y === item.center.y) return;
        item.center = { x, y };
        item.rings.position.set(x, y);
        if (item.shading.geometry.graphicsData.length) {
            item.shading.visible = false;
            this.#stale.add(token.id);
            this.#flush();
        }
    }

    drawToken(token) {
        this.#items.get(token.id)?.container.destroy({ children: true });
        const config = getConfig();
        const grid = canvas.grid;
        const center = token.center;
        const radii = bandRadii(config, { gridSize: grid.size, gridDistance: grid.distance, base: Math.max(token.w, token.h) / 2 });
        const colors = config.bands.map(band => colorNumber(band.color));

        const container = this.addChild(new PIXI.Container());
        container.eventMode = "none";
        const shading = container.addChild(new PIXI.Graphics());
        const rings = container.addChild(new PIXI.Container());
        rings.position.set(center.x, center.y);
        const lines = rings.addChild(new PIXI.Graphics());

        radii.forEach((radius, index) => {
            lines.lineStyle(config.lineWidth, colors[index], config.lineAlpha / 100).drawCircle(0, 0, radius);
            if (!config.labels) return;
            const band = config.bands[index];
            const distance = sceneDistance(config, band.distance, grid.distance, grid.units);
            const style = foundry.canvas.containers.PreciseText.getTextStyle({ fontSize: Math.max(14, Math.round(grid.size * 0.22)), fill: colors[index] });
            const text = rings.addChild(new foundry.canvas.containers.PreciseText(band.label ? `${band.label} ${distance}` : distance, style));
            text.anchor.set(0.5, 1);
            text.position.set(0, -radius - config.lineWidth);
        });

        this.#shade(shading, center, radii, colors, config.fillAlpha / 100);
        container.visible = token.visible;
        this.#items.set(token.id, { container, rings, shading, center: { x: center.x, y: center.y }, size: `${token.w}x${token.h}` });
    }

    /** Fill the grid cells of each band (square and hex grids; not gridless). */
    #shade(graphics, center, radii, colors, alpha) {
        const mode = game.settings.get(MODULE_ID, SETTINGS.shading);
        const grid = canvas.grid;
        if (mode === "none" || grid.isGridless || !radii.length || alpha <= 0) return;
        const outer = radii.at(-1);
        const scene = canvas.dimensions.sceneRect;
        const x0 = Math.max(center.x - outer, scene.x);
        const y0 = Math.max(center.y - outer, scene.y);
        const x1 = Math.min(center.x + outer, scene.right);
        const y1 = Math.min(center.y + outer, scene.bottom);
        if (x1 <= x0 || y1 <= y0) return;
        const [i0, j0, i1, j1] = grid.getOffsetRange({ x: x0, y: y0, width: x1 - x0, height: y1 - y0 });
        if ((i1 - i0) * (j1 - j0) > MAX_CELLS) return;
        const shape = grid.getShape();
        for (let i = i0; i < i1; i++) {
            for (let j = j0; j < j1; j++) {
                const c = grid.getCenterPoint({ i, j });
                const vertices = shape.map(p => ({ x: c.x + p.x, y: c.y + p.y }));
                const band = cellBand(vertices, center, radii, mode);
                if (band < 0) continue;
                graphics.beginFill(colors[band], alpha).drawPolygon(vertices.flatMap(v => [v.x, v.y])).endFill();
            }
        }
    }
}
