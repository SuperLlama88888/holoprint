import { doNothing, tuple } from "./meta.js";

function stringifyJsonBigIntSafe(value) {
	return JSON.stringify(value, (_, x) => typeof x == "bigint"? (JSON.rawJSON ?? doNothing)(x.toString()) : x); // JSON.rawJSON offers the perfect solution but is very modern, so stringifying them is the next best option
}
// @ts-expect-error
function parseJsonBigIntSafe(value) { // this function is unused but I'm keeping it here because it works well with the function above
	return JSON.parse(value, (_, x, context) => context && Number.isInteger(x) && !Number.isSafeInteger(x)? BigInt(context.source) : x);
}

export class Vec2Set {
	/** @type {Vec2[]} */
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
	/** @type {Vec3[]} */
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

/** @import { Vec2, Vec3 } from "../HoloPrint.js" */