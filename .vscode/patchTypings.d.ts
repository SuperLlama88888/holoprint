// This solely exists so my patches of native classes like Response in essential.js have Intellisense support. Wish VSCode was smarter :/

declare global {
	interface HTMLElement {
		selectEl(query: String): Element | null;
		selectEls(query: String): NodeListOf<HTMLElement>;
	}
	interface EventTarget {
		onEvent(type: String, listener: EventListenerOrEventListenerObject, options?: Boolean | AddEventListenerOptions): void;
		onEventAndNow(type: String, listener: EventListenerOrEventListenerObject, options?: Boolean | AddEventListenerOptions): void;
	}
	interface Response {
		jsonc(): Promise<Object>;
		toImage(): Promise<HTMLImageElement>;
	}
	interface Blob {
		jsonc(): Promise<Object>;
	}
	interface Image {
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