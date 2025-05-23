// Small functions that don't do anything specific to HoloPrint's main functionality

import stripJsonComments from "strip-json-comments";

/** @returns {Element|null} */
export const selectEl = selector => document.querySelector(selector);
/** @returns {NodeListOf<HTMLElement>} */
export const selectEls = selector => document.querySelectorAll(selector);
/**
 * Returns the element itself if it matches the selector, or the closest matching descendant, or null if none match.
 *
 * @param {Element} el - The element to search from.
 * @param {string} selector - The CSS selector to match.
 * @returns {Element|null} The matching element or null if not found.
 */
export function closestDescendentOrSelf(el, selector) {
	if(el.matches(selector)) {
		return el;
	}
	return el.querySelector(selector);
}

Element.prototype.selectEl = DocumentFragment.prototype.selectEl = function(query) {
	return this.querySelector(query);
};
Element.prototype.selectEls = DocumentFragment.prototype.selectEls = function(query) {
	return this.querySelectorAll(query);
};
Element.prototype.getAllChildren = DocumentFragment.prototype.getAllChildren = function() {
	let children = [...this.selectEls("*")];
	let allChildren = [];
	while(children.length) {
		let child = children.shift();
		allChildren.push(child);
		if(child.shadowRoot) {
			allChildren.push(...child.shadowRoot.selectEls("*"));
		}
	}
	return allChildren;
};

EventTarget.prototype.onEvent = EventTarget.prototype.addEventListener;
EventTarget.prototype.onEvents = function(types, listener, options = false) {
	types.forEach(type => {
		this.addEventListener(type, listener, options);
	});
};
EventTarget.prototype.onEventAndNow = function(type, listener, options) {
	listener();
	this.addEventListener(type, listener, options);
};

Response.prototype.jsonc = Blob.prototype.jsonc = function() {
	return new Promise((res, rej) => {
		this.text().then(text => {
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
};
Response.prototype.toImage = async function() {
	let imageBlob = await this.blob();
	let imageUrl = URL.createObjectURL(imageBlob);
	let image = new Image();
	image.src = imageUrl;
	try {
		await image.decode();
	} catch { // Chrome puts arbitrary limits on decoding images because "an error doesn't necessarily mean that the image was invalid": https://issues.chromium.org/issues/40676514 🤦‍♂️
		return new Promise((res, rej) => { // possibly https://github.com/chromium/chromium/blob/874a0ba26635507d1e847600fd8a512f4a10e1f8/cc/tiles/gpu_image_decode_cache.cc#L91
			let image2 = new Image();
			image2.onEvent("load", () => {
				URL.revokeObjectURL(imageUrl);
				res(image2);
			});
			image2.onEvent("error", e => {
				URL.revokeObjectURL(imageUrl);
				rej(`Failed to load image from response with status ${this.status} from URL ${this.url}: ${e}`);
			});
			image2.src = imageUrl;
		});
	}
	URL.revokeObjectURL(imageUrl);
	return image;
};
Image.prototype.toImageData = function() {
	let can = new OffscreenCanvas(this.width, this.height);
	let ctx = can.getContext("2d");
	ctx.drawImage(this, 0, 0);
	return ctx.getImageData(0, 0, can.width, can.height);
};
ImageData.prototype.toImage = async function() {
	let can = new OffscreenCanvas(this.width, this.height);
	let ctx = can.getContext("2d");
	ctx.putImageData(this, 0, 0);
	let blob = await can.convertToBlob();
	let imageUrl = URL.createObjectURL(blob);
	let image = new Image();
	image.src = imageUrl;
	try {
		await image.decode();
	} catch {
		return new Promise((res, rej) => {
			let image2 = new Image();
			image2.onEvent("load", () => {
				URL.revokeObjectURL(imageUrl);
				res(image2);
			});
			image2.onEvent("error", e => {
				URL.revokeObjectURL(imageUrl);
				rej(`Failed to decode ImageData with dimensions ${this.width}x${this.height}: ${e}`);
			});
			image2.src = imageUrl;
		});
	}
	URL.revokeObjectURL(imageUrl);
	return image;
};
Image.prototype.toBlob = async function() {
	let can = new OffscreenCanvas(this.width, this.height);
	let ctx = can.getContext("2d");
	ctx.drawImage(this, 0, 0);
	return await can.convertToBlob();
};
Image.prototype.setOpacity = async function(opacity) {
	let imageData = this.toImageData();
	let data = imageData.data;
	for(let i = 0; i < data.length; i += 4) {
		data[i + 3] *= opacity;
	}
	return await imageData.toImage();
};
Image.prototype.addTint = async function(col) {
	let imageData = this.toImageData();
	let data = imageData.data;
	for(let i = 0; i < data.length; i += 4) {
		data[i] *= col[0];
		data[i + 1] *= col[1];
		data[i + 2] *= col[2];
	}
	return await imageData.toImage();
};
Blob.prototype.toImage = function() {
	return new Promise((res, rej) => {
		let img = new Image();
		let url = URL.createObjectURL(this);
		img.onEvent("load", () => {
			URL.revokeObjectURL(url);
			res(img);
		});
		img.onEvent("error", e => {
			URL.revokeObjectURL(url);
			rej(e);
		});
		img.src = url;
	});
};

export const sleep = async time => new Promise(resolve => setTimeout(resolve, time));

export const { min, max, floor, ceil, sqrt, round, abs, PI: pi, exp } = Math;
export const clamp = (n, lowest, highest) => min(max(n, lowest), highest);
export const lerp = (a, b, x) => a + (b - a) * x;
export const nanToUndefined = x => Number.isNaN(x)? undefined : x;

export function arrayMin(arr) {
	let min = Infinity;
	for(let i = 0; i < arr.length; i++) {
		min = min < arr[i]? min : arr[i];
	}
	return min;
}
export function range(a, b, c) {
	if(b == undefined && c == undefined) {
		return (new Array(a + 1)).fill().map((x, i) => i);
	} else if(c == undefined) {
		return (new Array(b - a + 1)).fill().map((x, i) => i + a);
	} else {
		return (new Array((b - a) / c + 1)).fill().map((x, i) => i * c + a);
	}
}
export function random(arr) {
	return arr[~~(Math.random() * arr.length)];
}
/**
 * Removes empty slots from a potentially sparse array.
 * @template {Array} T
 * @param {T} arr
 * @returns {T}
 */
export function desparseArray(arr) {
	return arr.filter(() => true);
}
/**
 * Splits an array into two arrays based on a condition function.
 *
 * @template T
 * @param {Array<T>} arr - The array to split.
 * @param {function(T): boolean} conditionFunc - Function that determines which group each element belongs to.
 * @returns {[Array<T>, Array<T>]} A tuple where the first array contains elements for which {@link conditionFunc} returns false, and the second contains those for which it returns true.
 */
export function conditionallyGroup(arr, conditionFunc) {
	let res = [[], []];
	arr.forEach(el => {
		res[+conditionFunc(el)].push(el);
	});
	return res;
}
/**
 * Groups items into an object keyed by the result of a grouping function.
 *
 * @template T
 * @param {Array<T>} items - The array of items to group.
 * @param {function(T): string} groupFunc - Function that returns a group key for each item.
 * @returns {Record<string, Array<T>>} An object where each key is a group and the value is an array of items in that group.
 */
export function groupBy(items, groupFunc) { // native Object.groupBy is only 89.47% on caniuse...
	let res = {};
	items.forEach(item => {
		let group = groupFunc(item);
		res[group] ??= [];
		res[group].push(item);
	});
	return res;
};
/**
 * Groups an array of File objects by their file extension.
 *
 * @param {Array<File>} files - The files to group.
 * @returns {Record<string, Array<File>|undefined>} An object mapping each file extension to an array of Files with that extension.
 */
export function groupByFileExtension(files) {
	return groupBy(files, file => getFileExtension(file));
}
/**
 * Creates an object mapping string keys to unique numeric values, simulating a numeric enum.
 *
 * @template {string[]} T
 * @param {[...T]} keys - Array of string literals to use as enum keys.
 * @returns {Record<T[number], number>} An object where each key is assigned a unique number starting from 0.
 */
export function createNumericEnum(keys) {
	return Object.freeze(Object.fromEntries(keys.map((key, i) => [key, i])));
}
/**
 * Creates an enumeration object with unique Symbol values for each provided key.
 *
 * @template {string} T
 * @param {Array<T>} keys - The keys to include in the enumeration.
 * @returns {Readonly<Record<T, symbol>>} An object mapping each key to a unique Symbol.
 */
export function createSymbolicEnum(keys) {
	return Object.freeze(Object.fromEntries(keys.map(key => [key, Symbol(key)])));
}
/**
 * Creates a string-based enumeration from an array of keys, assigning each key a unique alphabetic code.
 *
 * @template {string} T
 * @param {Array<T>} keys - The keys to include in the enumeration.
 * @returns {Readonly<Record<T, string>>} An object mapping each key to a unique lowercase alphabetic string code (e.g., "a", "b", ..., "z", "aa", "ab", ...).
 */
export function createStringEnum(keys) {
	return Object.freeze(Object.fromEntries(keys.map((key, i) => {
		let n = i + 1;
		let value = "";
		while(n) {
			value = String.fromCharCode((n - 1) % 26 + 97) + value;
			n = ~~((n - 1) / 26);
		}
		return [key, value];
	})));
}

export function hexColorToClampedTriplet(hexColor) {
	let [, r, g, b] = hexColor.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i);
	return [r, g, b].map(x => parseInt(x, 16) / 255);
}
export function addOrdinalSuffix(num) {
	return num + (num % 10 == 1 && num % 100 != 11? "st" : num % 10 == 2 && num % 100 != 12? "nd" : num % 10 == 3 && num % 100 != 13? "rd" : "th");
}
/**
 * Returns the raw string result of a tagged template literal, concatenating all string and value parts.
 *
 * Intended for use as a tag for HTML template literals to enable build-time minification and editor syntax highlighting.
 *
 * @param {TemplateStringsArray} strings - The literal string segments.
 * @param {...any} values - The interpolated values.
 * @returns {string} The concatenated string with all values inserted.
 */
export function html(strings, ...values) {
	return strings.reduce((acc, str, i) => acc + str + (values[i] ?? ""), "");
}
/**
 * Returns the last portion of a file path after the final '/' character.
 *
 * @param {string} path - The file path to extract the basename from.
 * @returns {string} The basename of the provided path.
 */
export function basename(path) {
	return path.slice(path.lastIndexOf("/") + 1);
}
/**
 * Returns the directory portion of a file path, including the trailing slash, or an empty string if no directory exists.
 *
 * @param {string} path - The file path to extract the directory from.
 * @returns {string} The directory path ending with '/', or an empty string if {@link path} contains no directory.
 */
export function dirname(path) {
	return path.includes("/")? path.slice(0, path.lastIndexOf("/") + 1) : "";
}
/**
 * Returns the file extension from a File object or filename string.
 *
 * If the input is a File, its name property is used. The extension is the substring after the last period, or the entire string if no period is present.
 *
 * @param {File|string} filename - The File object or filename string to extract the extension from.
 * @returns {string} The file extension, or an empty string if none exists.
 */
export function getFileExtension(filename) {
	if(filename instanceof File) {
		filename = filename.name;
	}
	return filename.slice(filename.lastIndexOf(".") + 1);
}
/**
 * Removes the last file extension from a filename string.
 *
 * If the filename contains one or more periods, returns the substring up to (but not including) the last period; otherwise, returns the original filename unchanged.
 *
 * @param {string} filename - The filename from which to remove the extension.
 * @returns {string} The filename without its last extension.
 */
export function removeFileExtension(filename) {
	return filename.includes(".")? filename.slice(0, filename.lastIndexOf(".")) : filename;
}
/**
 * Joins an array of strings using a localized "or" conjunction.
 *
 * @param {Array<string>} arr - The array of strings to join.
 * @param {string} [language="en"] - Optional BCP 47 language tag for localization.
 * @returns {string} The joined string with a language-appropriate "or" separator.
 */
export function joinOr(arr, language = "en") {
	return (new Intl.ListFormat(language.replaceAll("_", "-"), {
		type: "disjunction"
	})).format(arr);
}


/**
 * Sets a file input's files and dispatches input an dchange events.
 * @param {HTMLInputElement} fileInput
 * @param {FileList|Array<File>} files
 */
export function setFileInputFiles(fileInput, files) {
	if(!files.length) {
		return;
	}
	if(Array.isArray(files)) {
		files = fileArrayToFileList(files);
	}
	fileInput.files = files;
	dispatchInputEvents(fileInput);
}
/**
 * Adds files to a file input.
 * @param {HTMLInputElement} fileInput
 * @param {Array<File>} files
 */
export function addFilesToFileInput(fileInput, files) {
	if(!files.length) {
		return;
	}
	setFileInputFiles(fileInput, [...fileInput.files, ...files]);
}
/**
 * Turns an array of files into a FileList.
 * @param {Array<File>} files
 * @returns {FileList}
 */
export function fileArrayToFileList(files) {
	let dataTransfer = new DataTransfer();
	files.forEach(file => dataTransfer.items.add(file));
	return dataTransfer.files;
}
/**
 * Clears all the files in a file input.
 * @param {HTMLInputElement} fileInput
 */
export function clearFileInput(fileInput) {
	fileInput.files = (new DataTransfer()).files;
	dispatchInputEvents(fileInput);
}
/**
 * Dispatches the input and change events on an <input>.
 * @param {HTMLInputElement} input
 */
export function dispatchInputEvents(input) {
	input.dispatchEvent(new Event("input", {
		bubbles: true
	}));
	input.dispatchEvent(new Event("change", {
		bubbles: true
	}));
}
/**
 * Determines whether a touch event's vertical position is within the vertical bounds of a given element.
 *
 * @param {Touch} touch - The touch point to check.
 * @param {Element} el - The element whose vertical bounds are tested.
 * @returns {boolean} True if the touch's Y coordinate is within the element's top and bottom edges; otherwise, false.
 */
export function isTouchInElementVerticalBounds(touch, el) {
	let domRect = el.getBoundingClientRect();
	return touch.clientY >= domRect.top && touch.clientY <= domRect.bottom;
}
export function htmlCodeToElement(htmlCode) {
	return (new DOMParser()).parseFromString(htmlCode, "text/html").body.firstElementChild;
}
export function stringToImageData(text, textCol = "black", backgroundCol = "white", font = "12px monospace") {
	let can = new OffscreenCanvas(0, 20);
	let ctx = can.getContext("2d");
	ctx.font = font;
	can.width = ctx.measureText(text).width;
	ctx.fillStyle = backgroundCol;
	ctx.fillRect(0, 0, can.width, can.height);
	ctx.fillStyle = textCol;
	ctx.font = font;
	ctx.fillText(text, 0, 15);
	return ctx.getImageData(0, 0, can.width, can.height);
}
/**
 * Returns a new image with transparent padding added to each side.
 *
 * @param {HTMLImageElement} image - The source image.
 * @param {{ left?: number, right?: number, top?: number, bottom?: number }} padding - Amount of transparent padding (in pixels) to add to each side.
 * @returns {Promise<HTMLImageElement>} A Promise that resolves to the padded image.
 */
export async function addPaddingToImage(image, padding) {
	let { left = 0, right = 0, top = 0, bottom = 0 } = padding;
	let can = new OffscreenCanvas(image.width + left + right, image.height + top + bottom);
	let ctx = can.getContext("2d");
	ctx.drawImage(image, left, top);
	let blob = await can.convertToBlob();
	return await blob.toImage();
}
/**
 * Overlays square images together, with the first image being the base. They can be different dimensions and will be resized to not lose quality.
 * @param  {...HTMLImageElement} images
 * @returns {Promise<Blob>}
 */
export async function overlaySquareImages(...images) {
	let outputSize = images.map(image => image.width).reduce((a, b) => lcm(a, b));
	let can = new OffscreenCanvas(outputSize, outputSize);
	let ctx = can.getContext("2d");
	ctx.imageSmoothingEnabled = false;
	images.forEach(image => {
		ctx.drawImage(image, 0, 0, outputSize, outputSize);
	});
	return await can.convertToBlob();
}
/**
 * Resizes an image to the specified width and height without smoothing and returns the result as a Blob.
 *
 * @param {HTMLImageElement} image - The image to resize.
 * @param {number} width - The target width in pixels.
 * @param {number} [height=width] - The target height in pixels. Defaults to the width if not provided.
 * @returns {Promise<Blob>} A promise that resolves to a Blob containing the resized image.
 */
export async function resizeImageToBlob(image, width, height = width) {
	let can = new OffscreenCanvas(width, height);
	let ctx = can.getContext("2d");
	ctx.imageSmoothingEnabled = false;
	ctx.drawImage(image, 0, 0, width, height);
	return await can.convertToBlob();
}

let translationLanguages = {};
/**
 * Loads and caches a translation JSON file for the specified language.
 *
 * If the translation file cannot be loaded or parsed, an empty object is cached for the language.
 *
 * @param {string} language - The language code to load translations for.
 * @returns {Promise<void>}
 */
export async function loadTranslationLanguage(language) {
	translationLanguages[language] ??= await fetch(`translations/${language}.json`).then(res => res.jsonc()).catch(() => {
		console.warn(`Failed to load language ${language} for translations!`);
		return {};
	});
}
/**
 * Retrieves a localized translation string for a given key and language, replacing inline code and Markdown-style links with HTML tags.
 *
 * @param {string} translationKey - The key identifying the translation string.
 * @param {string} language - The language code to use for translation.
 * @returns {string|undefined} The translated string with HTML formatting, or undefined if the language is not loaded.
 */
export function translate(translationKey, language) {
	if(!(language in translationLanguages)) {
		console.error(`Language ${language} not loaded for translation!`);
		return undefined;
	}
	return translationLanguages[language][translationKey]?.replaceAll(/`([^`]+)`/g, "<code>$1</code>")?.replaceAll(/\[([^\]]+)\]\(([^\)]+)\)/g, `<a href="$2" target="_blank">$1</a>`);
}

export function getStackTrace(e = new Error()) {
	return e.stack.split("\n").slice(1).removeFalsies();
}

/**
 * Returns the SHA-256 hash of a blob.
 * @param {Blob} blob
 * @returns {Promise<Uint8Array>}
 */
export async function sha256(blob) {
	return new Uint8Array(await crypto.subtle.digest("SHA-256", await blob.arrayBuffer()));
}
export async function sha256text(text) {
	return new Uint8Array(await crypto.subtle.digest("SHA-256", (new TextEncoder()).encode(text)));
}
Uint8Array.prototype.toHexadecimalString = function() {
	return [...this].map(ch => ch.toString(16).padStart(2, "0")).join("");
};
Array.prototype.removeFalsies = function() {
	return this.filter(el => el);
};
export function concatenateFiles(files, name) {
	return new File(files, name ?? files.map(file => file.name).join(","));
}

CacheStorage.prototype.clear = async function() {
	(await this.keys()).forEach(cacheName => this.delete(cacheName));
};

/**
 * Promise.all() but for objects
 * @template T
 * @param {T} object
 * @returns {Promise<{[K in keyof T]: Awaited<T[K]>}>}
 */
export async function awaitAllEntries(object) {
	await Promise.all(Object.entries(object).map(async ([key, promise]) => {
		object[key] = await promise;
	}));
	return object;
}

/**
 * Finds the pair of integer factors of a number that are closest in value.
 *
 * @param {number} n - The number to factor.
 * @returns {[number, number]} An array containing the two closest integer factors of {@link n}.
 */
export function closestFactorPair(n) {
	let x = ceil(sqrt(n));
	while(n % x) x++;
	return [x, n / x];
}
/**
 * Computes the greatest common divisor (GCD) of two positive integers using the Euclidean algorithm.
 *
 * @param {number} a - First positive integer.
 * @param {number} b - Second positive integer.
 * @returns {number} The greatest common divisor of {@link a} and {@link b}.
 *
 * @throws {Error} If either {@link a} or {@link b} is less than 1.
 */
export function gcd(a, b) {
	while(b != 0) {
		if(!(a >= 1 && b >= 1)) throw new Error(`Cannot find GCD of ${a} and ${b}`);
		[a, b] = [b, a % b]; // Euclidean algorithm
	}
	return a;
}
/**
 * Calculates the least common multiple (LCM) of two numbers.
 *
 * @param {number} a - The first integer.
 * @param {number} b - The second integer.
 * @returns {number} The smallest positive integer that is a multiple of both {@link a} and {@link b}.
 *
 * @throws {TypeError} If {@link a} or {@link b} is not a finite integer.
 * @throws {RangeError} If {@link a} or {@link b} is zero.
 */
export function lcm(a, b) {
	return a * b / gcd(a, b);
}

export function downloadBlob(blob, fileName) {
	let a = document.createElement("a");
	let objectURL = URL.createObjectURL(blob);
	a.href = objectURL;
	a.download = fileName ?? blob.name; // blob will have a name if blob is a File
	a.click();
	URL.revokeObjectURL(objectURL);
}

function stringifyJsonBigIntSafe(value) {
	return JSON.stringify(value, (_, x) => typeof x == "bigint"? (JSON.rawJSON ?? String)(x) : x); // JSON.rawJSON offers the perfect solution but is very modern, so stringifying them is the next best option
}
function parseJsonBigIntSafe(value) { // this function is unused but I'm keeping it here because it works well with the function above
	return JSON.parse(value, (_, x, context) => context && Number.isInteger(x) && !Number.isSafeInteger(x)? BigInt(context.source) : x);
}
export class JSONSet extends Set {
	#actualValues;
	constructor() {
		super();
		this.#actualValues = new Map();
	}
	indexOf(value) { // not part of sets normally! but they keep their order anyway so...
		let stringifiedValues = [...super[Symbol.iterator]()];
		return stringifiedValues.indexOf(this.#stringify(value));
	}
	add(value) {
		let stringifiedValue = this.#stringify(value);
		if(!this.#actualValues.has(stringifiedValue)) {
			this.#actualValues.set(stringifiedValue, structuredClone(value));
		}
		return super.add(stringifiedValue);
	}
	delete(value) {
		return super.delete(this.#stringify(value));
	}
	has(value) {
		return super.has(this.#stringify(value))
	}
	[Symbol.iterator]() {
		return this.#actualValues.values();
	}
	entries() {
		let iter = this[Symbol.iterator]();
		return {
			next: () => {
				let { value, done } = iter.next();
				return {
					value: done? undefined : [value, value],
					done
				};
			},
			[Symbol.iterator]() {
				return this;
			}
		};
	}
	keys() {
		return this[Symbol.iterator]();
	}
	values() {
		return this[Symbol.iterator]();
	}
	#stringify(value) {
		return stringifyJsonBigIntSafe(value);
	}
}
export class JSONMap extends Map { // very barebones
	constructor() {
		super();
	}
	get(key) {
		return super.get(this.#stringify(key));
	}
	has(key) {
		return super.has(this.#stringify(key));
	}
	set(key, value) {
		return super.set(this.#stringify(key), value)
	}
	#stringify(value) {
		return stringifyJsonBigIntSafe(value);
	}
}
export class CachingFetcher {
	static URL_PREFIX = "https://cache/";
	static BAD_STATUS_CODES = [429];
	
	cacheName;
	#baseUrl;
	/** @type {Cache} */
	#cache;
	constructor(cacheName, baseUrl = "") {
		return (async () => {
			this.#cache = await caches.open(cacheName);
			this.#baseUrl = baseUrl;
			this.cacheName = cacheName;
			
			return this;
		})();
	}
	/**
	 * Fetches a file, checking first against cache.
	 * @param {string} url
	 * @returns {Promise<Response>}
	 */
	async fetch(url) {
		let fullUrl = this.#baseUrl + url;
		let cacheLink = CachingFetcher.URL_PREFIX + url;
		let res = await this.#cache.match(cacheLink);
		if(CachingFetcher.BAD_STATUS_CODES.includes(res?.status)) {
			await this.#cache.delete(cacheLink);
			res = undefined;
		}
		if(!res) {
			res = await this.retrieve(fullUrl);
			let fetchAttempsLeft = 5;
			const fetchRetryTimeout = 1000;
			while(CachingFetcher.BAD_STATUS_CODES.includes(res.status) && fetchAttempsLeft--) {
				console.debug(`Encountered bad HTTP status ${res.status} from ${fullUrl}, trying again in ${fetchRetryTimeout}ms`);
				await sleep(fetchRetryTimeout);
			}
			if(fetchAttempsLeft) {
				await this.#cache.put(cacheLink, res.clone());
			} else {
				console.error(`Couldn't avoid getting bad HTTP status codes for ${fullUrl}`);
			}
		}
		return res;
	}
	/**
	 * Actually load a file, for when it's not found in cache.
	 * @param {string} url
	 * @returns {Promise<Response>}
	 */
	async retrieve(url) {
		const maxFetchAttempts = 3;
		const fetchRetryTimeout = 500; // ms
		let lastError;
		for(let i = 0; i < maxFetchAttempts; i++) {
			try {
				return await fetch(url);
			} catch(e) {
				if(navigator.onLine && e instanceof TypeError && e.message == "Failed to fetch") { // random Chrome issue when fetching many images at the same time. observed when fetching 1600 images at the same time.
					console.debug(`Failed to fetch resource at ${url}, trying again in ${fetchRetryTimeout}ms`);
					lastError = e;
					await sleep(fetchRetryTimeout);
				} else {
					throw e;
				}
			}
		}
		console.error(`Failed to fetch resource at ${url} after ${maxFetchAttempts} attempts...`);
		throw lastError;
	}
}
/**
 * Generates a custom Error subclass with the specified name.
 *
 * @param {string} name - The name to assign to the custom error class.
 * @returns {typeof Error} A new Error subclass with the given name.
 */
export function createCustomError(name) {
	return class extends Error {
		constructor(message) {
			super(message);
			this.name = name;
		}
	};
}
export const UserError = createCustomError("UserError");