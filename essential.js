// Small functions that don't do anything specific to HoloPrint

import stripJsonComments from "https://esm.run/strip-json-comments@5.0.1";

/** @returns {Element|null} */
export const selectEl = selector => document.querySelector(selector);
/** @returns {NodeListOf<HTMLElement>} */
export const selectEls = selector => document.querySelectorAll(selector);

HTMLElement.prototype.selectEl = function(query) {
	return this.querySelector(query);
};
HTMLElement.prototype.selectEls = function(query) {
	return this.querySelectorAll(query);
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
	await image.decode();
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
	await image.decode();
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

export const sleep = async time => new Promise(resolve => setTimeout(resolve, time));

export const { min, max, floor, ceil, sqrt, round, abs, PI: pi } = Math;
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

export function hexColorToClampedTriplet(hexColor) {
	let [, r, g, b] = hexColor.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i);
	return [r, g, b].map(x => parseInt(x, 16) / 255);
}
export function addOrdinalSuffix(num) {
	return num + (num % 10 == 1 && num % 100 != 11? "st" : num % 10 == 2 && num % 100 != 12? "nd" : num % 10 == 3 && num % 100 != 13? "rd" : "th");
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

export function getStackTrace() {
	return (new Error()).stack.split("\n").slice(1);
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

CacheStorage.prototype.clear = async function() {
	(await this.keys()).forEach(cacheName => this.delete(cacheName));
};

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
	a.download = fileName;
	a.click();
	URL.revokeObjectURL(objectURL);
}
export function blobToImage(blob) {
	return new Promise((res, rej) => {
		let img = new Image();
		let url = URL.createObjectURL(blob);
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