// Fixes a few issues with TypeScript types.

import FileInputTable from "./src/components/FileInputTable";
import ItemCriteriaInput from "./src/components/ItemCriteriaInput";
import LilGui from "./src/components/LilGui";
import ResizingInput from "./src/components/ResizingInput";
import SimpleLogger from "./src/components/SimpleLogger";
import Vec3Input from "./src/components/Vec3Input";
import { onEvent, onEvents, onEventAndNow } from "./src/utils";

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
	interface Function {
		bind<This, NewThis>(this: This, thisArg: NewThis): This;
		bind<This, NewThis, A extends any[]>(this: This, thisArg: NewThis, ...argArray: A): This extends (this: NewThis, ...args: [...A, ...infer B]) => infer C? (...args: B) => C : never;
	}
	interface String {
		startsWith<S extends string, This extends string>(this: This, searchString: S, position?: 0): This extends `${S}${string}`? true : false;
		endsWith<S extends string, This extends string>(this: This, searchString: S): This extends `${string}${S}`? true : false;
	}
	interface JSON {
		rawJSON(text: string): RawJSON;
	}
	interface RawJSON {}
	interface HTMLElementTagNameMap {
		"item-criteria-input": ItemCriteriaInput;
		"file-input-table": FileInputTable;
		"resizing-input": ResizingInput;
		"vec-3-input": Vec3Input;
		"simple-logger": SimpleLogger;
		"lil-gui": LilGui;
	}
	interface EventTarget {
		[onEvent]: this["addEventListener"];
		[onEventAndNow]: this["addEventListener"];
		[onEvents](types: string[], listener: EventListenerOrEventListenerObject | null, options?: AddEventListenerOptions | boolean): void;
	}
	interface HTMLElement {
		[onEvents]<T extends (keyof HTMLElementEventMap)[]>(types: T, listener: (ev: HTMLElementEventMap[T[number]]) => any, options?: boolean | AddEventListenerOptions): void;
	}
	interface Window {
		launchQueue: LaunchQueue;
	}
	interface LaunchQueue {
		setConsumer(consumer: (params: LaunchParams) => any): void;
	}
	interface LaunchParams {
		readonly files: ReadonlyArray<FileSystemFileHandle>;
		readonly targetURL: string;
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