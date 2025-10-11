import { doNothing, tuple } from "./meta.js";

function stringifyJsonBigIntSafe(value) {
	return JSON.stringify(value, (_, x) => typeof x == "bigint"? (JSON.rawJSON ?? doNothing)(x.toString()) : x); // JSON.rawJSON offers the perfect solution but is very modern, so stringifying them is the next best option
}
// @ts-expect-error
function parseJsonBigIntSafe(value) { // this function is unused but I'm keeping it here because it works well with the function above
	return JSON.parse(value, (_, x, context) => context && Number.isInteger(x) && !Number.isSafeInteger(x)? BigInt(context.source) : x);
}

/**
 * @template A
 * @template B
 */
export class CoupleSet {
	/** @type {[A, B][]} */
	values = [];
	/** @type {Map<A, Map<B, number>>} */
	#val0s = new Map();
	/**
	 * Adds a value and returns the index of it in the set.
	 * @param {[A, B]} value
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
/**
 * @template A
 * @template B
 * @template C
 */
export class TripleSet {
	/** @type {[A, B, C][]} */
	values = [];
	/** @type {Map<A, Map<B, Map<C, number>>>} */
	#val0s = new Map();
	/**
	 * Adds a value and returns the index of it in the set.
	 * @param {[A, B, C]} value
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
			yield tuple([value, value]);
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

/** A set for strings that works with regular expressions. */
export class PatternSet {
	#stringDelimiter;
	/** @type {Set<string>} */
	#stringValues = new Set();
	/** @type {RegExp[]} */
	#patterns = [];
	/**
	 * @param {string[]} [values]
	 * @param {string} [stringDelimiter] If present, values will be split by this substring and treated individually.
	 */
	constructor(values, stringDelimiter) {
		this.#stringDelimiter = stringDelimiter;
		values?.forEach(value => this.add(value));
	}
	/** @param {string} value */
	add(value) {
		value.split(this.#stringDelimiter).forEach(v => {
			if(v.startsWith("/") && v.endsWith("/")) {
				this.#patterns.push(new RegExp(v.slice(1, -1)));
			} else {
				this.#stringValues.add(v);
			}
		});
	}
	/** @param {string} value */
	has(value) {
		return this.#stringValues.has(value) || this.#patterns.some(pattern => pattern.test(value));
	}
}
/**
 * A map for strings that works with regular expressions.
 * @template V
 */
export class PatternMap {
	#stringDelimiter;
	/** @type {Map<string, V>} */
	#stringEntries = new Map();
	/** @type {[RegExp, V][]} */
	#patterns = [];
	/**
	 * @param {Iterable<[string, V]>} [entries]
	 * @param {string} [stringDelimiter] If present, keys will be split by this substring and treated individually.
	 */
	constructor(entries = [], stringDelimiter) {
		this.#stringDelimiter = stringDelimiter;
		Array.from(entries).forEach(([key, value]) => this.set(key, value));
	}
	/**
	 * @param {string} key
	 * @param {V} value
	 */
	set(key, value) {
		key.split(this.#stringDelimiter).forEach(k => {
			if(k.startsWith("/") && k.endsWith("/")) {
				this.#patterns.push([new RegExp(k.slice(1, -1)), value]);
			} else {
				this.#stringEntries.set(k, value);
			}
		});
	}
	/** @param {string} key */
	get(key) {
		return this.#stringEntries.get(key) ?? this.#patterns.find(([pattern]) => pattern.test(key))?.[1];
	}
}
/** A map for string-string entries that works for regular expressions, which can perform replacements on keys. */
export class ReplacingPatternMap {
	#stringDelimiter;
	/** @type {Map<string, string>} */
	#stringEntries = new Map();
	/** @type {[RegExp, string][]} */
	#patterns = [];
	/**
	 * @param {Iterable<[string, string]>} [entries]
	 * @param {string} [stringDelimiter] If present, keys will be split by this substring and treated individually.
	 */
	constructor(entries = [], stringDelimiter) {
		this.#stringDelimiter = stringDelimiter;
		Array.from(entries).forEach(([key, value]) => this.set(key, value));
	}
	/**
	 * @param {string} key
	 * @param {string} value
	 */
	set(key, value) {
		key.split(this.#stringDelimiter).forEach(k => {
			if(k.startsWith("/") && k.endsWith("/")) {
				this.#patterns.push([new RegExp(k.slice(1, -1)), value]);
			} else {
				this.#stringEntries.set(k, value);
			}
		});
	}
	/** @param {string} key */
	get(key) {
		if(this.#stringEntries.has(key)) {
			return this.#stringEntries.get(key);
		}
		let matchingPatternAndReplacement = this.#patterns.find(([pattern]) => pattern.test(key));
		if(matchingPatternAndReplacement) {
			return key.replace(...matchingPatternAndReplacement);
		}
	}
}