import { measureText, onEventAndNow } from "../utils.js";

/** `<input/>` but automatically resizing to fit the width of the content. Must be written as `<input is="resizing-input"/>`. */
export default class ResizingInput extends HTMLInputElement {
	connectedCallback() {
		this[onEventAndNow]("input", () => {
			let textWidth = measureText(this.value || this.placeholder, getComputedStyle(this).font).width;
			this.style.width = 26 + textWidth + "px";
		});
	}
}