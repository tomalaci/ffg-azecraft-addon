/**
 * Quick image sharing (pure rules, unit-tested): who receives a shared image, how far to shrink it,
 * and what a share message looks like. Nothing is uploaded or saved: the image travels in the
 * message itself (see image-share.js).
 */

/** Largest image sent (bytes of the data URL); Cloudflare and nginx sit between players and server. */
export const MAX_BYTES = 600 * 1024;
/** Longest side the image starts at, and the smallest it may be shrunk to while fitting MAX_BYTES. */
export const START_SIDE = 1600;
export const MIN_SIDE = 600;
export const QUALITY = 0.82;

/** Sizes (longest side) to try, largest first, until the image fits MAX_BYTES. */
export function sideSteps(longest, start = START_SIDE, min = MIN_SIDE) {
    const steps = [];
    let side = Math.min(longest, start);
    while (side > min) {
        steps.push(Math.round(side));
        side *= 0.8;
    }
    steps.push(Math.min(longest, min));
    return [...new Set(steps)];
}

/** Width and height for a longest side, keeping the aspect ratio and never enlarging. */
export function scaled(width, height, side) {
    const longest = Math.max(width, height);
    if (!longest) return { width: 0, height: 0 };
    const scale = Math.min(1, side / longest);
    return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/**
 * Recipients of a share: null means everyone online; otherwise the chosen user ids (without the
 * sender). An empty choice shares with nobody.
 * @param {boolean} everyone
 * @param {string[]} chosen
 */
export function recipients(everyone, chosen, senderId) {
    if (everyone) return null;
    return [...new Set(chosen)].filter(id => id && id !== senderId);
}

/** Whether a share message is for this user (never for the sender). */
export function isFor(message, userId) {
    if (!message || message.from === userId) return false;
    return message.to === null || (Array.isArray(message.to) && message.to.includes(userId));
}

/** An image link someone pasted (http(s) or a Foundry data path), not text. */
export function imageLink(text) {
    const value = String(text ?? "").trim();
    if (!value || /\s/.test(value)) return null;
    if (/^https?:\/\/\S+$/i.test(value)) return value;
    if (/^[\w%./-]+\.(png|jpe?g|webp|gif|avif|svg|bmp)$/i.test(value)) return value;
    return null;
}

/** Window title of a shared image: "Shared by Jesper: Map of the base". */
export function shareTitle(senderName, caption) {
    const text = String(caption ?? "").trim();
    return text ? `Shared by ${senderName}: ${text}` : `Shared by ${senderName}`;
}

/** Bytes of a base64 data URL's content (roughly what goes over the wire). */
export function dataUrlBytes(dataUrl) {
    return String(dataUrl ?? "").length;
}
