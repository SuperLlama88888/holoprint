import stripJsonComments from "strip-json-comments";

import { tuple } from "./meta.js";
import { onEvent } from "./dom.js";

/**
 * Parses a JSONC blob or response.
 * @param {Response | Blob} val
 * @returns {Promise<object>}
 */
export function jsonc(val) {
	return new Promise((res, rej) => {
		val.text().then(text => {
			let safeText = stripJsonComments(text);
			let json;
			try {
				json = JSON.parse(safeText);
			} catch(e) {
				rej(e);
				return;
			}
			res(json);
		}).catch(e => rej(e));
	});
}
/**
 * Converts a Response, Blob, or ImageData to an Image.
 * @param {Blob | Response | ImageData} val
 * @returns {Promise<HTMLImageElement>}
 */
export async function toImage(val) {
	if(val instanceof Blob) {
		let imageUrl = URL.createObjectURL(val);
		let image = new Image();
		image.src = imageUrl;
		try {
			await image.decode();
		} catch { // Chrome puts arbitrary limits on decoding images because "an error doesn't necessarily mean that the image was invalid": https://issues.chromium.org/issues/40676514 🤦‍♂️
			return new Promise((res, rej) => { // possibly https://github.com/chromium/chromium/blob/874a0ba26635507d1e847600fd8a512f4a10e1f8/cc/tiles/gpu_image_decode_cache.cc#L91
				let image2 = new Image();
				image2[onEvent]("load", () => {
					URL.revokeObjectURL(imageUrl);
					res(image2);
				});
				image2[onEvent]("error", e => {
					URL.revokeObjectURL(imageUrl);
					rej(e);
				});
				image2.src = imageUrl;
			});
		}
		URL.revokeObjectURL(imageUrl);
		return image;
	} else if(val instanceof Response) {
		let imageBlob = await val.blob();
		try {
			return toImage(imageBlob);
		} catch(e) {
			throw new Error(`Failed to convert response with status ${val.status} from URL ${val.url} to image: ${e}`);
		}
	} else if(val instanceof ImageData) {
		let imageBlob = await toBlob(val);
		try {
			return toImage(imageBlob);
		} catch(e) {
			throw new Error(`Failed to decode ImageData with dimensions ${val.width}x${val.height}: ${e}`);
		}
	}
}
/**
 * Gets an image or an image blob's full image data.
 * @param {HTMLImageElement | Blob} val
 * @returns {Promise<ImageData>}
 */
export async function toImageData(val) {
	let image = val instanceof HTMLImageElement? val : await toImage(val);
	let can = new OffscreenCanvas(image.width, image.height);
	let ctx = can.getContext("2d", {
		willReadFrequently: true
	});
	ctx.drawImage(image, 0, 0);
	return ctx.getImageData(0, 0, can.width, can.height);
}
/**
 * Converts an image or image data to a PNG blob.
 * @param {HTMLImageElement | ImageData} val
 * @returns {Promise<Blob>}
 */
export async function toBlob(val) {
	let can = new OffscreenCanvas(val.width, val.height);
	let ctx = can.getContext("2d", {
		willReadFrequently: true
	});
	if(val instanceof HTMLImageElement) {
		ctx.drawImage(val, 0, 0);
	} else if(val instanceof ImageData) {
		ctx.putImageData(val, 0, 0);
	}
	return await can.convertToBlob();
}
/**
 * Converts an array of bytes into a hexadecimal string.
 * @param {Uint8Array} arr
 * @returns {string}
 */
export function toHexadecimalString(arr) {
	return Array.from(arr).map(ch => ch.toString(16).padStart(2, "0")).join("");
}
/**
 * @param {string} hexColor
 * @returns {Vec3}
 */
export function hexColorToClampedTriplet(hexColor) {
	let [, r, g, b] = hexColor.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i);
	return tuple([r, g, b]).map(x => parseInt(x, 16) / 255);
}

/** @import { Vec3 } from "../HoloPrint.js" */