import { symbolPatch } from "./meta.js";

export const selectEl = symbolPatch([Element.prototype, DocumentFragment.prototype], function selectEl(query) {
	return this.querySelector(query);
}, document.querySelector.bind(document));
export const selectEls = symbolPatch([Element.prototype, DocumentFragment.prototype], function selectEls(query) {
	return this.querySelectorAll(query);
}, document.querySelectorAll.bind(document));
/** @type {unique symbol} */
// @ts-expect-error
export const onEvent = symbolPatch(EventTarget.prototype, EventTarget.prototype.addEventListener);
/** @type {unique symbol} */
// @ts-expect-error
export const onEvents = symbolPatch(EventTarget.prototype, function onEvents(types, listener, options = false) {
	types.forEach(type => {
		this.addEventListener(type, listener, options);
	});
});
/** @type {unique symbol} */
// @ts-expect-error
export const onEventAndNow = symbolPatch(EventTarget.prototype, function onEventAndNow(type, listener, options) {
	listener();
	this.addEventListener(type, listener, options);
});
/**
 * Finds the closest descendent of an element or itself that matches a given selector.
 * @param {Element} el
 * @param {string} selector
 * @returns {Element | null}
 */
export function closestDescendentOrSelf(el, selector) {
	if(el.matches(selector)) {
		return el;
	}
	return el.querySelector(selector);
}

/**
 * Gets all children of a node, including those in shadow roots. (Doesn't work with nested shadow roots.)
 * @param {Element | DocumentFragment} node
 * @returns {HTMLElement[]}
 */
export function getAllChildren(node) {
	let children = Array.from(node[selectEls]("*"));
	let allChildren = [];
	while(children.length) {
		let child = children.shift();
		allChildren.push(child);
		if(child.shadowRoot) {
			allChildren.push(...child.shadowRoot[selectEls]("*"));
		}
	}
	return allChildren;
}

/**
 * Checks if a touch from a touch event is in an element's vertical bounds.
 * @param {Touch} touch
 * @param {Element} el
 * @returns {boolean}
 */
export function isTouchInElementVerticalBounds(touch, el) {
	let domRect = el.getBoundingClientRect();
	return touch.clientY >= domRect.top && touch.clientY <= domRect.bottom;
}
export function htmlCodeToElement(htmlCode) {
	let template = document.createElement("template");
	template.innerHTML = htmlCode;
	return template.content.firstElementChild;
}

/**
 * Dispatches the input and change events on an <input>.
 * @param {HTMLInputElement} input
 * @param {any} [detail]
 */
export function dispatchInputEvents(input, detail) {
	input.dispatchEvent(new CustomEvent("input", {
		bubbles: true,
		detail
	}));
	input.dispatchEvent(new CustomEvent("change", {
		bubbles: true,
		detail
	}));
}