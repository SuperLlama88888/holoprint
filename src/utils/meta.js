import { removeFalsies } from "./arrays.js";

/**
 * Patches a method onto an object, returning a symbol that can be used to access that method.
 * @overload
 * @param {object | object[]} objects An object or multiple objects onto which the method patch will be applied
 * @param {Function} primaryMethod The method that will be patched onto the object(s)
 * @returns {symbol}
*/
/**
 * Patches a method onto an object, and making a function turn into a symbol during property access, with which the patched method can be accessed.
 * @template {Function} F
 * @overload
 * @param {object | object[]} objects An object or multiple objects onto which the method patch will be applied
 * @param {Function} primaryMethod The method that will be patched onto the object(s)
 * @param {F} secondaryMethod The function that will have a patch applied to turn into a symbol during property access
 * @returns {F & symbol}
 */
export function symbolPatch(objects, primaryMethod, secondaryMethod) {
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

export const nanToUndefined = x => Number.isNaN(x)? undefined : x;
/** @template T @param {T} x @returns {T} */
export const doNothing = x => x;
/** @template {any[]} T @param {[...T]} x @returns {T} */
export const tuple = x => x;
/** @template T @param {T} _type @returns {T extends any[]? T[number]["prototype"][] : T["prototype"]} */
export const cast = (x, _type) => x;
/** @template T @param {T} _type @returns {asserts x is (T extends any[]? T[number]["prototype"][] : T["prototype"])} */
export const assertAs = (x, _type) => x;
/** Returns the original string when used in a tagged template literal. Only used so the HTML inside can be minified when building, and so VSCode can apply syntax highlighting with the lit-plugin plugin. */
export function html(strings, ...values) {
	return strings.reduce((acc, str, i) => acc + str + (values[i] ?? ""), "");
}

export function getStackTrace(e = new Error()) {
	return removeFalsies(e.stack.split("\n").slice(1));
}
/**
 * Gets the inheritance chain of a class.
 * @param {Function} c
 * @returns {Function[]}
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
 * @returns {string}
 */
export function getClassFullName(c) {
	return getClassInheritance(c).map(f => f.name).join(":");
}

/**
 * @template {WeakKey} P
 * @template {(x: P) => any} F
 * @param {F} func
 * @returns {F}
 */
export function weaklyCacheUnaryFunc(func) {
	/** @type {WeakMap<P, ReturnType<F>>} */
	let cache = new WeakMap();
	// @ts-expect-error
	return x => {
		if(cache.has(x)) {
			return cache.get(x);
		}
		let res = func(x);
		cache.set(x, res);
		return res;
	};
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

/**
 * @template {(...args: any[]) => Promise<any>} F
 * @template {any[]} P
 * @param {(...args: P) => Promise<F>} factory
 * @param {P} factoryParams
 * @returns {F}
 */
export function lazyLoadAsyncFunctionFactory(factory, ...factoryParams) {
	/** @type {Promise<F>} */
	let f;
	// @ts-expect-error
	return async (...args) => {
		f ??= factory(...factoryParams);
		return (await f)(...args);
	};
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