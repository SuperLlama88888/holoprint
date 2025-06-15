import { GUI } from "lil-gui";
import { html, htmlCodeToElement, selectEls } from "../utils.js";

export default class LilGui extends HTMLElement {
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
			container: this.shadowRoot
		});
		let lilGuiStylesheet = Array.from(selectEls("head > style")).find(el => !previousStyles.has(el));
		this.shadowRoot.appendChild(lilGuiStylesheet); // will automatically remove it from <head>
		this.shadowRoot.appendChild(htmlCodeToElement(html`
			<style>
				.lil-gui {
					--font-family: "Space Grotesk", monospace;
				}
			</style>
		`));
	}
}