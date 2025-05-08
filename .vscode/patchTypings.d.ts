// This solely exists so my patches of native classes like Response in essential.js have Intellisense support. Wish VSCode was smarter :/

declare global {
	interface Element {
		selectEl(query: String): Element | null;
		selectEls(query: String): NodeListOf<HTMLElement>;
		getAllChildren(): Array<HTMLElement>
	}
	interface DocumentFragment {
		selectEl(query: String): Element | null;
		selectEls(query: String): NodeListOf<HTMLElement>;
		getAllChildren(): Array<HTMLElement>
	}
	interface EventTarget {
		onEvent<K extends keyof HTMLElementEventMap>(type: K, listener: (this: EventTarget, ev: HTMLElementEventMap[K]) => any, options?: boolean | AddEventListenerOptions): void;
		onEvents(types: Array<String>, listener: EventListenerOrEventListenerObject, options?: Boolean | AddEventListenerOptions): void;
		onEventAndNow(type: String, listener: EventListenerOrEventListenerObject, options?: Boolean | AddEventListenerOptions): void;
	}
	interface Response {
		jsonc(): Promise<Object>;
		toImage(): Promise<HTMLImageElement>;
	}
	interface Blob {
		jsonc(): Promise<Object>;
		toImage(): Promise<Image>
	}
	interface Image {
		toImageData(): ImageData;
		toBlob(): Promise<Blob>;
		setOpacity(opacity: Number): Promise<HTMLImageElement>;
		addTint(col: [Number, Number, Number]): Promise<HTMLImageElement>;
	}
	interface HTMLImageElement {
		toImageData(): ImageData;
		toBlob(): Promise<Blob>;
		setOpacity(opacity: Number): Promise<HTMLImageElement>;
		addTint(col: [Number, Number, Number]): Promise<HTMLImageElement>;
	}
	interface ImageData {
		toImage(): Promise<HTMLImageElement>;
	}
	interface Uint8Array {
		toHexadecimalString(): String;
	}
	interface Array<T> {
		removeFalsies(): Array<T>;
	}
	interface CacheStorage {
		clear(): Promise<void>;
	}
}

export {};