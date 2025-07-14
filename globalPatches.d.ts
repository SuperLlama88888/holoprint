// Fixes a few issues with TypeScript types.

declare global {
	interface Array<T> {
		// the bits at the end indicate that if the array has extra properties, only the numeric ones (the indices) will be in the return object
		map<U extends any[], This extends readonly unknown[]>(this: This, callbackfn: (value: T, index: number, array: This) => [...U]): { [K in keyof This]: K extends number | `${number}`? U : never };
		map<U, This extends readonly unknown[]>(this: This, callbackfn: (value: T, index: number, array: This) => U): { [K in keyof This]: K extends number | `${number}`? U : never };
	}
	interface ObjectConstructor {
		entries<K extends string, T>(o: Record<K, T>): [K, T][];
		// fromEntries is from https://github.com/microsoft/TypeScript/pull/61074
		fromEntries<K extends PropertyKey, T = any>(entries: Iterable<readonly [K, T]>): { [Key in K]: T; };
	}
	interface String {
		startsWith<S extends string, This extends string>(this: This, searchString: S, position?: 0): This extends `${S}${string}`? true : false;
		startsWith<S extends string, This extends string>(this: This, searchString: S): This extends `${string}${S}`? true : false;
	}
	interface JSON {
		rawJSON(text: string): RawJSON;
	}
	interface RawJSON {}
	interface Math {
		/** FOR .MOLANG.JS ONLY!!! */
		mod(n: number, d: number): number;
	}
	interface EventTarget {
		// For my prototype symbol patches.
		[k: symbol]: any;
	}
	interface Window {
		launchQueue: any;
	}
}
declare module "https://esm.sh/three@0.177.0/examples/jsm/controls/OrbitControls.js" {
	interface OrbitControls {
		_sphericalDelta: {
			phi: number
			theta: number
		}
	}
}
export {};