// Small functions that don't do anything specific to HoloPrint's main functionality

import stripJsonComments from "strip-json-comments";

/**
 * Patches a method onto an object, returning a symbol that can be used to access that method.
 * @overload
 * @param {object | Array<object>} objects An object or multiple objects onto which the method patch will be applied
 * @param {Function} primaryMethod The method that will be patched onto the object(s)
 * @returns {symbol}
*/
/**
 * Patches a method onto an object, and making a function turn into a symbol during property access, with which the patched method can be accessed. 
 * @template {Function} F
 * @overload
 * @param {object | Array<object>} objects An object or multiple objects onto which the method patch will be applied
 * @param {Function} primaryMethod The method that will be patched onto the object(s)
 * @param {F} secondaryMethod The function that will have a patch applied to turn into a symbol during property access
 * @returns {F & symbol}
 */
function symbolPatch(objects, primaryMethod, secondaryMethod) {
	let symbol = Symbol(primaryMethod.name);
	if(!Array.isArray(objects)) {
		objects = [objects];
	}
	objects.forEach(object => {
		Object.defineProperty(object, symbol, { // defaults to nonconfigurable, nonenumerable and unwritable
			value: primaryMethod
		});
	});
	if(secondaryMethod) {
		secondaryMethod[Symbol.toPrimitive] = () => symbol; // used during property access: https://tc39.es/ecma262/multipage/abstract-operations.html#sec-toprimitive. throws a TypeError if you're trying to convert to a string, but it's fine for property access because it's a symbol
		return secondaryMethod;
	} else {
		return symbol;
	}
}

export const selectEl = symbolPatch([Element.prototype, DocumentFragment.prototype], function selectEl(query) {
	return this.querySelector(query);
}, function(/** @type {string} */ query) {
	return document.querySelector(query);
});
export const selectEls = symbolPatch([Element.prototype, DocumentFragment.prototype], function selectEls(query) {
	return this.querySelectorAll(query);
}, function(/** @type {string} */ query) {
	return document.querySelectorAll(query);
});
/**
 * Finds the closest descendent of an element or itself that matches a given selector.
 * @param {Element} el
 * @param {string} selector
 * @returns {Element | null}
 */
export function closestDescendentOrSelf(el, selector) {
	if(el.matches(selector)) {
		return el;
	}
	return el.querySelector(selector);
}

/**
 * Gets all children of a node, including those in shadow roots. (Doesn't work with nested shadow roots.)
 * @param {Element | DocumentFragment} node
 * @returns {Array<HTMLElement>}
 */
export function getAllChildren(node) {
	let children = Array.from(node[selectEls]("*"));
	let allChildren = [];
	while(children.length) {
		let child = children.shift();
		allChildren.push(child);
		if(child.shadowRoot) {
			allChildren.push(...child.shadowRoot[selectEls]("*"));
		}
	}
	return allChildren;
}

export const onEvent = symbolPatch(EventTarget.prototype, EventTarget.prototype.addEventListener);
export const onEvents = symbolPatch(EventTarget.prototype, function onEvents(types, listener, options = false) {
	types.forEach(type => {
		this.addEventListener(type, listener, options);
	});
});
export const onEventAndNow = symbolPatch(EventTarget.prototype, function onEventAndNow(type, listener, options) {
	listener();
	this.addEventListener(type, listener, options);
});

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

export const sleep = async time => new Promise(resolve => setTimeout(resolve, time));

/** @template T @param {T} x @returns {T} */
export const doNothing = x => x;
export const { min, max, floor, ceil, sqrt, round, abs, PI: pi, exp, log: ln, sin, cos, tan, hypot } = Math;
export const clamp = (n, lowest, highest) => min(max(n, lowest), highest);
export const lerp = (a, b, x) => a + (b - a) * x;
export const nanToUndefined = x => Number.isNaN(x)? undefined : x;
export function sinDeg(deg) {
	return sin(deg * pi / 180);
}
export function cosDeg(deg) {
	return cos(deg * pi / 180);
}
export function tanDeg(deg) {
	return tan(deg * pi / 180);
}
export function rotate([x, y], angle) {
    let c = cos(angle);
    let s = sin(angle);
    return [x * c - y * s, x * s + y * c];
}
export function rotateDeg(p, deg) {
	return rotate(p, deg * pi / 180);
}
/**
 * @param {Vec2} a
 * @param {Vec2} b
 * @returns {Vec2}
 */
export function addVec2(a, b) {
	return [a[0] + b[0], a[1] + b[1]];
}
/**
 * @param {Vec2} a
 * @param {Vec2} b
 * @returns {Vec2}
 */
export function subVec2(a, b) {
	return [a[0] - b[0], a[1] - b[1]];
}
/**
 * @param {Vec3} a
 * @param {Vec3} b
 * @returns {Vec3}
 */
export function addVec3(a, b) {
	return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}
/**
 * @param {Vec3} a
 * @param {Vec3} b
 * @returns {Vec3}
 */
export function subVec3(a, b) {
	return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
/**
 * @param {Vec3} vec
 * @param {number} factor
 * @returns {Vec3}
 */
export function mulVec3(vec, factor) {
	return [vec[0] * factor, vec[1] * factor, vec[2] * factor];
}
/**
 * @param {Vec3} a
 * @param {Vec3} b
 * @returns {Vec3}
 */
export function crossProduct(a, b) {
	return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
/**
 * @param {Vec3} vec
 * @returns {Vec3}
 */
export function normalizeVec3(vec) {
	return mulVec3(vec, 1 / hypot(...vec))
}
/**
 * @param {Vec3} vec
 * @param {number} decimals
 * @returns {Vec3}
 */
export function vec3ToFixed(vec, decimals) {
	let power = 10 ** decimals;
	return [round(vec[0] * power) / power, round(vec[1] * power) / power, round(vec[2] * power) / power];
}
/**
 * @param {Mat4} mat
 * @param {Vec3 | Vec4} vec
 * @returns {Vec4}
 */
export function mulMat4([[a, b, c, d], [e, f, g, h], [i, j, k, l], [m, n, o, p]], [x, y, z, w = 1]) {
	return [
		a * x + b * y + c * z + d * w,
		e * x + f * y + g * z + h * w,
		i * x + j * y + k * z + l * w,
		m * x + n * y + o * z + p * w
	];
}

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
 * @template T
 * @param {Array<T>} arr
 * @returns {Array<T>}
 */
export function desparseArray(arr) {
	return arr.filter(() => true);
}
/**
 * Makes nulls empty slots in an array.
 * @template T
 * @param {Array<T>} arr
 * @returns {Array<T>}
 */
export function makeNullsEmpty(arr) {
	let res = new Array(arr.length);
	arr.forEach((item, i) => {
		if(item !== null) {
			res[i] = item;
		}
	});
	return res;
}
/**
 * Groups an array into two arrays based on a condition function.
 * @template T
 * @param {Array<T>} arr
 * @param {(item: T) => boolean} conditionFunc
 * @returns {[Array<T>, Array<T>]}
 */
export function conditionallyGroup(arr, conditionFunc) {
	/** @type {[Array<T>, Array<T>]} */
	let res = [[], []];
	arr.forEach(el => {
		res[+conditionFunc(el)].push(el);
	});
	return res;
}
/**
 * Separates array items based on the result of a grouping function.
 * @template T
 * @param {Array<T>} items
 * @param {(item: T) => string} groupFunc
 * @returns {Record<string, Array<T>>}
 */
export function groupBy(items, groupFunc) { // native Object.groupBy is only 89.47% on caniuse...
	/** @type {Record<string, Array<T>>} */
	let res = {};
	items.forEach(item => {
		let group = groupFunc(item);
		res[group] ??= [];
		res[group].push(item);
	});
	return res;
};
/**
 * Groups files by their file extensions.
 * @param {Array<File>} files
 * @returns {Record<string, Array<File> | undefined>}
 */
export function groupByFileExtension(files) {
	return groupBy(files, file => getFileExtension(file));
}
/**
 * Create a pseudo-enumeration using numbers.
 * @template {string[]} T
 * @param {[...T]} keys - An array of string literals to use as keys.
 * @returns {Record<T[number], number>}
 */
export function createNumericEnum(keys) {
	return Object.freeze(Object.fromEntries(keys.map((key, i) => [key, i])));
}
/**
 * Creates an enumeration using Symbols.
 * @template {string} T
 * @param {Array<T>} keys
 * @returns {Readonly<Record<T, symbol>>}
 */
export function createSymbolicEnum(keys) {
	return Object.freeze(Object.fromEntries(keys.map(key => [key, Symbol(key)])));
}
/**
 * Crates a pseudo-enumeration using strings.
 * @template {string} T
 * @param {Array<T>} keys
 * @returns {Readonly<Record<T, string>>}
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

/**
 * @param {string} hexColor
 * @returns {Vec3}
 */
export function hexColorToClampedTriplet(hexColor) {
	let [, r, g, b] = hexColor.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i);
	/** @type {[string, string, string]} */
	let rgb = [r, g, b];
	return rgb.map(x => parseInt(x, 16) / 255);
}
export function addOrdinalSuffix(num) {
	return num + (num % 10 == 1 && num % 100 != 11? "st" : num % 10 == 2 && num % 100 != 12? "nd" : num % 10 == 3 && num % 100 != 13? "rd" : "th");
}
/** Returns the original string when used in a tagged template literal. Only used so the HTML inside can be minified when building, and so VSCode can apply syntax highlighting with the lit-plugin plugin. */
export function html(strings, ...values) {
	return strings.reduce((acc, str, i) => acc + str + (values[i] ?? ""), "");
}
/**
 * Finds the basename from a file path.
 * @param {string} path
 * @returns {string}
 */
export function basename(path) {
	return path.slice(path.lastIndexOf("/") + 1);
}
/**
 * Finds the directory name from a file path. Returns an empty string if there are no directories, else will end in /.
 * @param {string} path
 * @returns {string}
 */
export function dirname(path) {
	return path.includes("/")? path.slice(0, path.lastIndexOf("/") + 1) : "";
}
/**
 * Finds the file extension from a file or filename.
 * @param {File | string} filename
 * @returns {string}
 */
export function getFileExtension(filename) {
	if(filename instanceof File) {
		filename = filename.name;
	}
	return filename.slice(filename.lastIndexOf(".") + 1);
}
/**
 * Removes the (last) file extension from a filename.
 * @param {string} filename
 * @returns {string}
 */
export function removeFileExtension(filename) {
	return filename.includes(".")? filename.slice(0, filename.lastIndexOf(".")) : filename;
}
/**
 * Joins an array of strings with "or", localised.
 * @param {Array<string>} arr
 * @param {string} [language]
 * @returns {string}
 */
export function joinOr(arr, language = "en") {
	return (new Intl.ListFormat(language.replaceAll("_", "-"), {
		type: "disjunction"
	})).format(arr);
}


/**
 * Sets a file input's files and dispatches input an dchange events.
 * @param {HTMLInputElement} fileInput
 * @param {FileList | Array<File>} files
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
 * Checks if a touch from a touch event is in an element's vertical bounds.
 * @param {Touch} touch
 * @param {Element} el
 * @returns {boolean}
 */
export function isTouchInElementVerticalBounds(touch, el) {
	let domRect = el.getBoundingClientRect();
	return touch.clientY >= domRect.top && touch.clientY <= domRect.bottom;
}
export function htmlCodeToElement(htmlCode) {
	let template = document.createElement("template");
	template.innerHTML = htmlCode;
	return template.content.firstElementChild;
}
export function stringToImageData(text, textCol = "black", backgroundCol = "white", font = "12px monospace") {
	let can = new OffscreenCanvas(0, 20);
	let ctx = can.getContext("2d", {
		willReadFrequently: true
	});
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
 * @param  {...HTMLImageElement} images
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

let translationLanguages = {};
export async function loadTranslationLanguage(language) {
	translationLanguages[language] ??= await fetch(`translations/${language}.json`).then(res => jsonc(res)).catch(() => {
		console.warn(`Failed to load language ${language} for translations!`);
		return {};
	});
}
/**
 * Looks up a translation from translations/`language`.json
 * @param {string} translationKey
 * @param {string} language
 * @returns {string | undefined}
 */
export function translate(translationKey, language) {
	if(!(language in translationLanguages)) {
		console.error(`Language ${language} not loaded for translation!`);
		return undefined;
	}
	return translationLanguages[language][translationKey]?.replaceAll(/`([^`]+)`/g, "<code>$1</code>")?.replaceAll(/\[([^\]]+)\]\(([^\)]+)\)/g, `<a href="$2" target="_blank">$1</a>`);
}

export function getStackTrace(e = new Error()) {
	return removeFalsies(e.stack.split("\n").slice(1));
}

/**
 * Returns the SHA-256 hash of a blob.
 * @param {Blob} blob
 * @returns {Promise<Uint8Array>}
 */
export async function sha256(blob) {
	return new Uint8Array(await crypto.subtle.digest("SHA-256", await blob.arrayBuffer()));
}
/**
 * Returns the SHA-256 hash of text
 * @param {string} text
 * @returns {Promise<Uint8Array>}
 */
export async function sha256text(text) {
	return new Uint8Array(await crypto.subtle.digest("SHA-256", (new TextEncoder()).encode(text)));
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
 * Removes "falsy" elements from an array.
 * @template T
 * @param {Array<T>} arr
 * @returns {Array<T>}
 */
export function removeFalsies(arr) {
	return arr.filter(el => el);
}
export function concatenateFiles(files, name) {
	return new File(files, name ?? files.map(file => file.name).join(","));
}

/**
 * Clears all caches.
 * @param {CacheStorage} cacheStorage
 */
export async function clearCacheStorage(cacheStorage) {
	let cacheNames = await cacheStorage.keys();
	await Promise.all(cacheNames.map(cacheName => cacheStorage.delete(cacheName)));
}

/**
 * Promise.all() but for objects
 * @template {string[]} Keys
 * @template {Record<Keys[number], Promise<any>>} T
 * @param {T} object
 * @returns {Promise<{[K in keyof T]: Awaited<T[K]>}>}
 */
export async function awaitAllEntries(object) {
	return Object.fromEntries(await Promise.all(Object.entries(object).map(async ([key, promise]) => [key, await promise])));
}

/**
 * Returns the two factors of a number which are closest to each other.
 * @param {number} n
 * @returns {[number, number]}
 */
export function closestFactorPair(n) {
	let x = ceil(sqrt(n));
	while(n % x) x++;
	return [x, n / x];
}
/**
 * Calculates the GCD of two numbers
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
export function gcd(a, b) {
	while(b != 0) {
		if(!(a >= 1 && b >= 1)) throw new Error(`Cannot find GCD of ${a} and ${b}`);
		[a, b] = [b, a % b]; // Euclidean algorithm
	}
	return a;
}
/**
 * Calculates the LCM of two numbers
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
export function lcm(a, b) {
	return a * b / gcd(a, b);
}
export function distanceSquared(a, b) {
	return (a[0] - b[0]) * (a[0] - b[0]) + (a[1] - b[1]) * (a[1] - b[1]) + (a[2] - b[2]) * (a[2] - b[2]);
}

export function downloadFile(file, filename = file.name) {
	let a = document.createElement("a");
	let objectURL = URL.createObjectURL(file);
	a.href = objectURL;
	a.download = filename;
	a.click();
	URL.revokeObjectURL(objectURL);
}

/**
 * Gets the inheritance chain of a class.
 * @param {Function} c
 * @returns {Array<Function>}
 */
export function getClassInheritance(c) {
	let classes = [];
	while(typeof c == "function" && c.name && c != Function && c != null) {
		classes.push(c);
		c = Object.getPrototypeOf(c);
	}
	return classes;
}
/**
 * Gets the full name of a class and all other classes it is inherited from.
 * @param {Function} c
 * @returns {String}
 */
export function getClassFullName(c) {
	return getClassInheritance(c).map(f => f.name).join(":");
}
export class AsyncFactory {
	static #allowedConstructors = new WeakSet();
	/** Don't use the constructor to create an AsyncFactory instance; use the static async new() method. */
	constructor() {
		if(!AsyncFactory.#allowedConstructors.has(new.target)) {
			throw new Error(`Cannot create ${getClassFullName(new.target)} normally; must call the static async new() method.`);
		}
	}
	async init() {}
	/**
	 * Creates an instance.
	 * @template {AsyncFactory} T
	 * @template {any[]} P
	 * @this {{ new(...params: P): T }}
	 * @param {P} params
	 * @returns {Promise<T>}
	 */
	static async new(...params) {
		let classes = getClassInheritance(this);
		classes.forEach(c => AsyncFactory.#allowedConstructors.add(c));
		let instance = new this(...params);
		classes.forEach(c => AsyncFactory.#allowedConstructors.delete(c));
		await instance.init();
		return instance;
	}
}

function stringifyJsonBigIntSafe(value) {
	return JSON.stringify(value, (_, x) => typeof x == "bigint"? (JSON.rawJSON ?? doNothing)(x.toString()) : x); // JSON.rawJSON offers the perfect solution but is very modern, so stringifying them is the next best option
}
function parseJsonBigIntSafe(value) { // this function is unused but I'm keeping it here because it works well with the function above
	return JSON.parse(value, (_, x, context) => context && Number.isInteger(x) && !Number.isSafeInteger(x)? BigInt(context.source) : x);
}

export class Vec2Set {
	/** @type {Array<Vec2>} */
	values = [];
	#val0s = new Map();
	/**
	 * @param {Vec2} value
	 * @returns {number}
	 */
	add(value) {
		let val1s = this.#val0s.get(value[0]);
		if(!val1s) {
			val1s = new Map();
			this.#val0s.set(value[0], val1s);
		}
		if(val1s.has(value[1])) {
			return val1s.get(value[1]);
		}
		val1s.set(value[1], this.values.length);
		this.values.push(value);
		return this.values.length - 1;
	}
}
export class Vec3Set {
	/** @type {Array<Vec3>} */
	values = [];
	#val0s = new Map();
	/**
	 * @param {Vec3} value
	 * @returns {number}
	 */
	add(value) {
		let val1s = this.#val0s.get(value[0]);
		if(!val1s) {
			val1s = new Map();
			this.#val0s.set(value[0], val1s);
		}
		let val2s = val1s.get(value[1]);
		if(!val2s) {
			val2s = new Map();
			val1s.set(value[1], val2s);
		}
		if(val2s.has(value[2])) {
			return val2s.get(value[2]);
		}
		val2s.set(value[2], this.values.length);
		this.values.push(value);
		return this.values.length - 1;
	}
}
export class JSONSet extends Set {
	stringify = stringifyJsonBigIntSafe;
	/** @type {Map<string, number>} */
	#indices = new Map();
	#actualValues = [];
	constructor(values) {
		super();
		values?.forEach(value => this.add(value));
	}
	/** Not part of regular sets! Constant time indexing. */
	indexOf(value) {
		return this.#indices.get(this.stringify(value));
	}
	add(value) {
		let stringifiedValue = this.stringify(value);
		if(!this.#indices.has(stringifiedValue)) {
			this.#indices.set(stringifiedValue, this.size);
			this.#actualValues.push(structuredClone(value));
		}
		return super.add(stringifiedValue);
	}
	delete(value) {
		return super.delete(this.stringify(value));
	}
	has(value) {
		return super.has(this.stringify(value))
	}
	clear() {
		this.#indices.clear();
		this.#actualValues = [];
		return super.clear();
	}
	[Symbol.iterator]() {
		return this.#actualValues.values();
	}
	*entries() {
		for(let value of this.#actualValues) {
			/** @type {[any, any]} */
			let tuple = [value, value];
			yield tuple;
		}
	}
	keys() {
		return this[Symbol.iterator]();
	}
	values() {
		return this[Symbol.iterator]();
	}
}
/**
 * @template K
 * @template V
 * @extends {Map<any, V>}
 */
export class JSONMap extends Map { // very barebones
	stringify = stringifyJsonBigIntSafe;
	constructor(entries, stringifyFunc) {
		super();
		entries?.forEach(([key, value]) => this.set(key, value));
		if(stringifyFunc) {
			this.stringify = stringifyFunc;
		}
	}
	get(key) {
		return super.get(this.stringify(key));
	}
	has(key) {
		return super.has(this.stringify(key));
	}
	/**
	 * @param {K} key
	 * @param {V} value
	 */
	set(key, value) {
		return super.set(this.stringify(key), value);
	}
}
export class CachingFetcher extends AsyncFactory {
	static URL_PREFIX = "https://cache/";
	static BAD_STATUS_CODES = [429];
	
	cacheName;
	#baseUrl;
	/** @type {Cache} */
	#cache;
	constructor(cacheName, baseUrl = "") {
		super();
		this.cacheName = cacheName;
		this.#baseUrl = baseUrl;
	}
	async init() {
		this.#cache = await caches.open(this.cacheName);
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
				res = await this.retrieve(fullUrl);
			}
			if(CachingFetcher.BAD_STATUS_CODES.includes(res.status)) {
				console.error(`Couldn't avoid getting bad HTTP status code ${res.status} for ${fullUrl}`);
			} else {
				await this.#cache.put(cacheLink, res.clone());
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
 * Creates a custom error class with a given name.
 * @template {string} T
 * @param {T} name
 * @returns {new (message?: string) => Error & { name: T }}
 */
export function createCustomError(name) {
	return class extends Error { // can't have a base class that has this.name = new.target.name because esbuild will rename them... :(
		constructor(message) {
			super(message);
			this.name = name;
		}
	};
}
export const UserError = createCustomError("UserError");

/** @import { Mat4, Vec2, Vec3, Vec4 } from "./HoloPrint.js" */