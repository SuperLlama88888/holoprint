import { html, selectEl, selectEls } from "../utils.js";

export default class MaterialListTable extends HTMLElement {
	#hasRendered = false;
	#countsArePartitioned = false;
	/** @type {MaterialListEntry[]} */
	#entries = [];
	get entries() {
		return this.#entries;
	}
	set entries(entries) {
		this.#entries = entries;
		this.#countsArePartitioned = this.#entries.some(({ count }) => count >= 64);
		this.#render();
	}
	
	constructor() {
		super();
		this.attachShadow({
			mode: "open"
		});
	}
	connectedCallback() {
		if(!this.#hasRendered) {
			this.#render();
		}
	}
	disconnectedCallback() {
		this.#hasRendered = false;
	}
	
	#render() {
		if(this.#entries.length >= 30) {
			this.shadowRoot.innerHTML = html`
				<style>
					:host {
						display: flex;
						justify-content: center;
						gap: 5px;
					}
				</style>
				<material-list-table></material-list-table>
				<material-list-table></material-list-table>
			`;
			/** @type {[MaterialListTable, MaterialListTable]} */
			let subtables = this.shadowRoot[selectEls]("material-list-table");
			subtables[0].entries = this.#entries.slice(0, this.#entries.length / 2 + 0.5);
			subtables[1].entries = this.#entries.slice(this.#entries.length / 2 + 0.5);
			return;
		}
		this.shadowRoot.innerHTML = html`
			<style>
				:host {
					display: flex;
					justify-content: center;
				}
				table {
					border: 1px solid #A0A0A0;
					border-collapse: collapse;
				}
				th, td {
					border: 1px solid #A0A0A0;
					padding: 2px 5px;
				}
				thead tr {
					background-color: #9AE493;
				}
				tbody tr {
					&:nth-child(2n) {
						background-color: #BAE7B6;
					}
					&:nth-child(2n + 1) {
						background-color: #D6ECD4;
					}
					td:not(:first-child) {
						font-family: monospace;
					}
				}
			</style>
			<table>
				<thead>
					<tr>
						<th>Item name</th>
						${this.#countsArePartitioned? html`<th>Count</th>` : ""}
						<th>Amount</th>
					</tr>
				</thead>
				<tbody>
					${this.#entries.length? this.#entries.map(entry => html`
						<tr>
							<td>${entry.itemName}</td>
							${this.#countsArePartitioned? html`<td>${entry.count}</td>` : ""}
							<td>${entry.partitionedCountWithoutTotal}</td>
						</tr>
					`).join("") : html`
						<tr>
							<td colspan="3"><i>There are no items in the material list.</i></td>
						</tr>
					`}
				</tbody>
			</table>
		`;
		
		this.#hasRendered = true;
	}
}

/** @import { MaterialListEntry } from "../HoloPrint.js" */