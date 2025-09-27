import { tuple } from "./meta.js";

/**
 * Object.entries for **all** entries, including inherited ones.
 * @template {string} K
 * @template V
 * @param {Record<K, V>} object
 * @returns {[K, V][]}
 */
export function allEntries(object) {
	let entries = [];
	for(let key in object) {
		entries.push(tuple([key, object[key]]));
	}
	return entries;
}
/**
 * Flattens inherited properties to be direct properties of an object.
 * @template {string} K
 * @template V
 * @param {Record<K, V>} object
 * @returns {{ [Key in K]: V }}
 */
export function flattenObject(object) {
	return Object.fromEntries(allEntries(object));
}
/**
 * Applies Array.prototype.reduce on each property from all objects.
 * @template V
 * @template {Record<string, V>} T
 * @param {T[]} objects
 * @param {(previousValue: V, currentValue: V, currentIndex: number, array: V[]) => V} reducer
 * @returns {T}
 */
export function reduceProperties(objects, reducer) {
	let keys = Object.keys(objects[0]);
	let entries = keys.map(key => [key, objects.map(o => o[key]).reduce(reducer)]);
	// @ts-expect-error
	return Object.fromEntries(entries);
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