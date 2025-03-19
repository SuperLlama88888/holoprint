// Small functions that don't do anything specific to HoloPrint's main functionality

import stripJsonComments from "strip-json-comments";

/** @returns {Element|null} */
export const selectEl = selector => document.querySelector(selector);
/** @returns {NodeListOf<HTMLElement>} */
export const selectEls = selector => document.querySelectorAll(selector);

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
 * Create a pseudo-enumeration using numbers.
 * @param {Array<String>} keys
 * @returns {Readonly<Record<String, Number>>}
 */
export function createEnum(keys) {
	return Object.freeze(Object.fromEntries(keys.map((key, i) => [key, i])));
}

export function hexColorToClampedTriplet(hexColor) {
	let [, r, g, b] = hexColor.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i);
	return [r, g, b].map(x => parseInt(x, 16) / 255);
}
export function addOrdinalSuffix(num) {
	return num + (num % 10 == 1 && num % 100 != 11? "st" : num % 10 == 2 && num % 100 != 12? "nd" : num % 10 == 3 && num % 100 != 13? "rd" : "th");
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

let translationLanguages = {};
export async function loadTranslationLanguage(language) {
	translationLanguages[language] ??= await fetch(`translations/${language}.json`).then(res => res.jsonc()).catch(() => {
		console.warn(`Failed to load language ${language} for translations!`);
		return {};
	});
}
/**
 * Looks up a translation from translations/`language`.json
 * @param {String} translationKey
 * @param {String} language
 * @returns {String|undefined}
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
 * 
 * @param {T} object
 * @returns {Promise<{[K in keyof T]: Awaited<T[K]>}>}
 * @template T
 */
export async function awaitAllEntries(object) {
	await Promise.all(Object.entries(object).map(async ([key, promise]) => {
		object[key] = await promise;
	}));
	return object;
}

/**
 * Returns the two factors of a number which are closest to each other.
 * @param {Number} n
 * @returns {[Number, Number]}
 */
export function closestFactorPair(n) {
	let x = ceil(sqrt(n));
	while(n % x) x++;
	return [x, n / x];
}

export function downloadBlob(blob, fileName) {
	let a = document.createElement("a");
	let objectURL = URL.createObjectURL(blob);
	a.href = objectURL;
	a.download = fileName ?? blob.name; // blob will have a name if blob is a File
	a.click();
	URL.revokeObjectURL(objectURL);
}

export class JSONSet extends Set {
	#replacer;
	#reviver;
	constructor(replacer, reviver) {
		super();
		this.#replacer = replacer;
		this.#reviver = reviver;
	}
	indexOf(value) { // not part of sets normally! but they keep their order anyway so...
		let stringifiedValues = [...super[Symbol.iterator]()];
		return stringifiedValues.indexOf(this.#stringify(value));
	}
	add(value) {
		return super.add(this.#stringify(value));
	}
	delete(value) {
		return super.delete(this.#stringify(value));
	}
	has(value) {
		return super.has(this.#stringify(value))
	}
	[Symbol.iterator]() {
		let iter = super[Symbol.iterator]();
		return {
			next: () => {
				let { value, done } = iter.next();
				return {
					value: done? undefined : this.#parse(value),
					done
				};
			},
			[Symbol.iterator]() {
				return this;
			}
		};
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
		return JSON.stringify(value, this.#replacer);
	}
	#parse(value) {
		return JSON.parse(value, this.#reviver);
	}
}
export class JSONMap extends Map { // very barebones
	#replacer;
	constructor(replacer) {
		super();
		this.#replacer = replacer;
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
		return JSON.stringify(value, this.#replacer);
	}
}
export class CachingFetcher {
	cacheName;
	#baseUrl;
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
	 * @param {String} url
	 * @returns {Promise<Response>}
	 */
	async fetch(url) {
		let fullUrl = this.#baseUrl + url;
		let cacheLink = `https://cache/${url}`;
		let res = await this.#cache.match(cacheLink);
		if(!res) {
			res = await this.retrieve(fullUrl);
			this.#cache.put(cacheLink, res.clone()).catch(e => console.warn(`Failed to save response from ${fullUrl} to cache ${this.cacheName}:`, e));
		}
		return res;
	}
	/**
	 * Actually load a file, for when it's not found in cache.
	 * @param {String} url
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
export class UserError extends Error {
	constructor(message) {
		super(message);
		this.name = "UserError";
	}
}