import { tuple } from "./meta.js";

export function arrayMin(arr) {
	let min = Infinity;
	for(let i = 0; i < arr.length; i++) {
		min = min < arr[i]? min : arr[i];
	}
	return min;
}
export function random(arr) {
	return arr[~~(Math.random() * arr.length)];
}
/**
 * Removes empty slots from a potentially sparse array.
 * @template T
 * @param {T[]} arr
 * @returns {T[]}
 */
export function desparseArray(arr) {
	return arr.filter(() => true);
}
/**
 * Makes nulls empty slots in an array.
 * @template T
 * @param {T[]} arr
 * @returns {T[]}
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
 * Removes "falsy" elements from an array.
 * @template T
 * @param {T[]} arr
 * @returns {T[]}
 */
export function removeFalsies(arr) {
	return arr.filter(el => el);
}
/**
 * Groups an array into two arrays based on a condition function.
 * @template T
 * @param {T[]} arr
 * @param {(item: T) => boolean} conditionFunc
 * @returns {[T[], T[]]}
 */
export function conditionallyGroup(arr, conditionFunc) {
	let res = tuple([[], []]);
	arr.forEach(el => {
		res[+conditionFunc(el)].push(el);
	});
	return res;
}
/**
 * Separates array items based on the result of a grouping function.
 * @template T
 * @param {T[]} items
 * @param {(item: T) => string} groupFunc
 * @returns {Record<string, T[]>}
 */
export function groupBy(items, groupFunc) { // native Object.groupBy is only 89.47% on caniuse...
	/** @type {Record<string, T[]>} */
	let res = {};
	items.forEach(item => {
		let group = groupFunc(item);
		res[group] ??= [];
		res[group].push(item);
	});
	return res;
}

/**
 * Create a pseudo-enumeration using numbers.
 * @template {string[]} T
 * @param {[...T]} keys - An array of string literals to use as keys.
 * @returns {Readonly<{ [K in keyof T as (K extends `${number}`? T[K] : never)]: K extends `${infer N extends number}`? N : never }>}
 */
export function createNumericEnum(keys) {
	// @ts-expect-error
	return Object.freeze(Object.fromEntries(keys.map((key, i) => [key, i])));
}
/**
 * Creates an enumeration using Symbols.
 * @template {string} T
 * @param {T[]} keys
 * @returns {Readonly<Record<T, symbol>>}
 */
export function createSymbolicEnum(keys) {
	return Object.freeze(Object.fromEntries(keys.map(key => [key, Symbol(key)])));
}
/**
 * Crates a pseudo-enumeration using strings.
 * @template {string} T
 * @param {T[]} keys
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