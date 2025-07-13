import { GUI } from "lil-gui";
import { html, htmlCodeToElement, selectEls } from "../utils.js";

export default class LilGui extends HTMLElement {
	/** @type {HTMLStyleElement} */
	static #lilGuiStylesheet;
	
	/** @type {GUI} */
	gui;
	constructor() {
		super();
		this.attachShadow({
			mode: "open"
		});
	}
	connectedCallback() {
		let previousStyles = new Set(selectEls("head > style"));
		this.gui = new GUI({
			// @ts-ignore
			container: this.shadowRoot
		});
		if(!LilGui.#lilGuiStylesheet) {
			// @ts-ignore
			LilGui.#lilGuiStylesheet = Array.from(selectEls("head > style")).find(el => !previousStyles.has(el));
			LilGui.#lilGuiStylesheet.remove();
		}
		this.shadowRoot.appendChild(LilGui.#lilGuiStylesheet.cloneNode(true));
		this.shadowRoot.appendChild(htmlCodeToElement(html`
			<style>
				:host {
					width: min(calc(100% - 80px), 245px);
				}
				.lil-gui {
					--font-family: "Space Grotesk", monospace;
					--widget-height: 20px !important;
					--spacing: 4px !important;
					--width: 100%;
					float: right;
				}
			</style>
		`));
	}
	disconnectedCallback() {
		this.gui.destroy();
	}
}