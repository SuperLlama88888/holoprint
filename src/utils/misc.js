export const sleep = async time => new Promise(resolve => setTimeout(resolve, time));

/**
 * Joins multiple regular expressions or strings. The flags of the last regular expression will be used.
 * @param {...(RegExp | string)} values
 * @returns {RegExp}
 */
export function joinRegExps(...values) {
	return new RegExp(values.reduce((acc, val) => acc + (val instanceof RegExp? val.source : val), ""), values.reverse().find(val => val instanceof RegExp)?.flags ?? ""); // findLast isn't well supported :/
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
 * Clears all caches.
 * @param {CacheStorage} cacheStorage
 */
export async function clearCacheStorage(cacheStorage) {
	let cacheNames = await cacheStorage.keys();
	await Promise.all(cacheNames.map(cacheName => cacheStorage.delete(cacheName)));
}