import { toImage, toImageData } from "./conversions.js";
import { lcm } from "./math.js";

/**
 * Sets the opacity of an image.
 * @param {HTMLImageElement} image
 * @param {number} opacity
 * @returns {Promise<HTMLImageElement>}
 */
export async function setImageOpacity(image, opacity) {
	let imageData = await toImageData(image);
	let data = imageData.data;
	for(let i = 0; i < data.length; i += 4) {
		data[i + 3] *= opacity;
	}
	return await toImage(imageData);
}
/**
 * Adds a tint to an image.
 * @param {HTMLImageElement} image
 * @param {Vec3} col
 * @returns {Promise<HTMLImageElement>}
 */
export async function addTintToImage(image, col) {
	let imageData = await toImageData(image);
	let data = imageData.data;
	for(let i = 0; i < data.length; i += 4) {
		data[i] *= col[0];
		data[i + 1] *= col[1];
		data[i + 2] *= col[2];
	}
	return await toImage(imageData);
}
/**
 * Adds transparent padding around an image.
 * @param {HTMLImageElement} image
 * @param {Partial<{ left: number, right: number, top: number, bottom: number }>} padding Pixels
 * @returns {Promise<HTMLImageElement>}
 */
export async function addPaddingToImage(image, padding) {
	let { left = 0, right = 0, top = 0, bottom = 0 } = padding;
	let can = new OffscreenCanvas(image.width + left + right, image.height + top + bottom);
	let ctx = can.getContext("2d", {
		willReadFrequently: true
	});
	ctx.drawImage(image, left, top);
	let blob = await can.convertToBlob();
	return await toImage(blob);
}
/**
 * Overlays square images together, with the first image being the base. They can be different dimensions and will be resized to not lose quality.
 * @param {...HTMLImageElement} images
 * @returns {Promise<Blob>}
 */
export async function overlaySquareImages(...images) {
	let outputSize = images.map(image => image.width).reduce((a, b) => lcm(a, b));
	let can = new OffscreenCanvas(outputSize, outputSize);
	let ctx = can.getContext("2d", {
		willReadFrequently: true
	});
	ctx.imageSmoothingEnabled = false;
	images.forEach(image => {
		ctx.drawImage(image, 0, 0, outputSize, outputSize);
	});
	return await can.convertToBlob();
}
/**
 * Resizes an image to a specific size without image smoothing.
 * @param {HTMLImageElement} image
 * @param {number} width
 * @param {number} [height]
 * @returns {Promise<Blob>}
 */
export async function resizeImageToBlob(image, width, height = width) {
	let can = new OffscreenCanvas(width, height);
	let ctx = can.getContext("2d", {
		willReadFrequently: true
	});
	ctx.imageSmoothingEnabled = false;
	ctx.drawImage(image, 0, 0, width, height);
	return await can.convertToBlob();
}

/** @import { Vec3 } from "../HoloPrint.js" */