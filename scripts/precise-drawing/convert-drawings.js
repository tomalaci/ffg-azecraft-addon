/* MIT License   Copyright (c) 2020 KayelGee    https://github.com/KayelGee/DrawingTokenizer */

/**
 * "Convert drawings to an image" (precise drawing, see docs/precise-drawing.md): a button in the
 * drawing controls renders the selected drawings into one WebP image, then either downloads it or
 * (GMs) uploads it to `worlds/<world id>/converted-drawings/`, places a tile with it at the same spot
 * and hides the drawings. Based on Precise Drawing Tools, whose convert code derives from KayelGee's
 * DrawingTokenizer (both MIT, see LICENSE in this folder).
 */

import { imageFileName, softenFullChannels, uploadFolder } from "./drawing-core.js";

const TOOL = "azecraftConvertDrawings";
const QUALITY = 0.92;

/** A progress notification; `step` and `done` do nothing once it is gone. */
function progress(message) {
    const bar = ui.notifications.info(message, { progress: true });
    return {
        step: (message, pct) => bar.update({ message, pct }),
        done: message => bar.update({ message, pct: 1 })
    };
}

/**
 * Redraw a drawing's shape into a new graphics object with the same calls as Foundry's
 * `Drawing#_refreshShape`, lowering full-strength channels of half-transparent colours: PIXI renders
 * those wrongly into an image. (The original changed the drawings' own colours for this, which every
 * client saw, and changed them back afterwards.)
 */
function copyShape(drawing) {
    const { SHAPE_TYPES } = foundry.canvas.placeables.Drawing;
    const line = drawing._getLineStyle();
    const fill = drawing._getFillStyle();
    const shape = drawing.document.shape;
    const graphics = new PIXI.Graphics();
    graphics.lineStyle({ ...line, color: softenFullChannels(Number(line.color), line.alpha) });
    graphics.beginTextureFill({ ...fill, color: softenFullChannels(Number(fill.color), fill.alpha) });
    const lineWidth = graphics.line.width;
    switch (shape.type) {
        case SHAPE_TYPES.RECTANGLE:
            graphics.drawRect(lineWidth / 2, lineWidth / 2, Math.max(shape.width - lineWidth, 0), Math.max(shape.height - lineWidth, 0));
            break;
        case SHAPE_TYPES.ELLIPSE:
            graphics.drawEllipse(shape.width / 2, shape.height / 2, Math.max(shape.width - lineWidth, 0) / 2, Math.max(shape.height - lineWidth, 0) / 2);
            break;
        case SHAPE_TYPES.POLYGON: {
            const closed = drawing.document.fillType || shape.points.slice(0, 2).equals(shape.points.slice(-2));
            if (closed) graphics.drawSmoothedPolygon(shape.points, drawing.document.bezierFactor * 2);
            else graphics.drawSmoothedPath(shape.points, drawing.document.bezierFactor * 2);
            break;
        }
    }
    graphics.endFill();
    return graphics;
}

/**
 * A copy of one drawing at its canvas position: Foundry places `shape` at the drawing's centre with a
 * pivot and rotation, and its text as a child of the shape.
 */
function copyDrawing(drawing) {
    const { shape, document } = drawing;
    const holder = new PIXI.Container();
    holder.position.copyFrom(shape.position);
    holder.pivot.copyFrom(shape.pivot);
    holder.rotation = shape.rotation;
    holder.addChild(copyShape(drawing));
    if (drawing.text) {
        const style = drawing._getTextStyle();
        style.fill = softenFullChannels(Number(document.textColor), document.textAlpha);
        const text = new foundry.canvas.containers.PreciseText(drawing.text.text, style);
        text.position.copyFrom(drawing.text.position);
        text.anchor.set(0.5, 0.5);
        text.alpha = document.textAlpha;
        holder.addChild(text);
    }
    return holder;
}

/**
 * Render drawings into a WebP blob. The image covers exactly the container's bounds (which include
 * line widths, rotation and text), so the tile goes there.
 */
async function renderDrawings(drawings) {
    const bar = progress("Preparing the drawings...");
    const container = new PIXI.Container();
    try {
        drawings.forEach((drawing, i) => {
            container.addChild(copyDrawing(drawing));
            bar.step("Preparing the drawings...", 0.5 * ((i + 1) / drawings.length));
        });
        const bounds = container.getLocalBounds();
        bar.step("Rendering the image...", 0.6);
        const image = canvas.app.renderer.extract.canvas(container, bounds);
        const blob = await new Promise(resolve => image.toBlob(resolve, "image/webp", QUALITY));
        if (!blob) throw new Error("The image could not be made (the drawings may be too large).");
        bar.done("Image ready.");
        return { blob, x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
    } catch (error) {
        bar.done("Converting failed.");
        throw error;
    } finally {
        container.destroy({ children: true });
    }
}

async function ensureFolder(folder) {
    const { FilePicker } = foundry.applications.apps;
    const parent = folder.slice(0, folder.lastIndexOf("/"));
    const listing = await FilePicker.implementation.browse("data", parent);
    if (!listing.dirs.includes(folder)) await FilePicker.implementation.createDirectory("data", folder);
}

/** Upload the image, place a tile with it and hide the drawings (GMs only). */
async function replaceWithTile(drawings, image, fileName) {
    const bar = progress("Uploading the image...");
    const folder = uploadFolder(game.world.id);
    let uploaded;
    try {
        await ensureFolder(folder);
        const file = new File([image.blob], fileName, { type: "image/webp" });
        uploaded = await foundry.applications.apps.FilePicker.implementation.upload("data", folder, file, {}, { notify: false });
    } catch (error) {
        console.error(error);
    }
    // upload() answers false, nothing or {} when it fails (it shows its own errors for some).
    if (!uploaded?.path) {
        bar.done("Upload failed.");
        ui.notifications.error("The image could not be uploaded; the drawings are unchanged.");
        return;
    }
    bar.step("Placing the tile...", 0.4);
    await canvas.scene.createEmbeddedDocuments("Tile", [{
        x: image.x,
        y: image.y,
        width: image.width,
        height: image.height,
        texture: { src: uploaded.path }
    }]);
    bar.step("Hiding the drawings...", 0.7);
    await canvas.scene.updateEmbeddedDocuments("Drawing", drawings.map(drawing => ({ _id: drawing.id, hidden: true })));
    bar.done(`Drawings replaced by a tile (${uploaded.path}).`);
}

function download(url, fileName) {
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();
    link.remove();
}

async function openConvertDialog() {
    const drawings = [...(canvas.drawings?.controlled ?? [])];
    if (!drawings.length) return ui.notifications.warn("Select the drawings to convert first.");
    let image;
    try {
        image = await renderDrawings(drawings);
    } catch (error) {
        console.error(error);
        return ui.notifications.error(`Converting the drawings failed: ${error.message}`);
    }

    const url = URL.createObjectURL(image.blob);
    const name = `drawing-${foundry.utils.randomID(4)}`;
    const content = `
        <img class="azecraft-convert-preview" src="${url}" alt="The converted drawings">
        <div class="form-group">
            <label for="azecraft-convert-name">File name</label>
            <input id="azecraft-convert-name" type="text" name="filename" value="${name}" required>
        </div>
        <p class="hint">${Math.round(image.width)} x ${Math.round(image.height)} px. A tile is uploaded to <code>${uploadFolder(game.world.id)}/</code>.</p>`;
    const fileNameFrom = button => {
        const fileName = imageFileName(button.form.elements.filename.value);
        if (!fileName) ui.notifications.error("Enter a file name.");
        return fileName;
    };
    const buttons = [{
        action: "download",
        icon: "fa-solid fa-download",
        label: "Download image",
        callback: (event, button) => {
            const fileName = fileNameFrom(button);
            if (fileName) download(url, fileName);
        }
    }];
    if (game.user.isGM) {
        buttons.push({
            action: "tile",
            icon: "fa-solid fa-eye-slash",
            label: "Replace with a tile (drawings hidden)",
            default: true,
            callback: async (event, button) => {
                const fileName = fileNameFrom(button);
                if (fileName) await replaceWithTile(drawings, image, fileName);
            }
        });
    }
    try {
        await foundry.applications.api.DialogV2.wait({
            window: { title: "Convert drawings to an image", icon: "fa-solid fa-image" },
            classes: ["azecraft-convert-drawings"],
            position: { width: 640 },
            content,
            buttons,
            rejectClose: false
        });
    } finally {
        URL.revokeObjectURL(url);
    }
}

/** Add the convert button to the drawing controls (getSceneControlButtons). */
export function addConvertButton(controls) {
    const drawings = controls.drawings;
    if (!drawings) return;
    drawings.tools[TOOL] = {
        name: TOOL,
        order: Object.keys(drawings.tools).length,
        title: "Convert the selected drawings to an image",
        icon: "fa-solid fa-image",
        button: true,
        onChange: () => openConvertDialog()
    };
}
