// import { html } from "../utils.js";

function html(strings, ...values) {
	console.log(strings, values)
	return strings.reduce((acc, str, i) => acc + str + (values[i] ?? ""), "");
}

export default class MaterialListTable extends HTMLElement {
	#hasRendered = false;
	/** @type {MaterialListEntry[]} */
	#entries = [];
	get entries() {
		return this.#entries;
	}
	set entries(entries) {
		this.#entries = entries;
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
		let countsArePartitioned = this.#entries.some(({ count }) => count >= 64);
		
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
						${countsArePartitioned? html`<th>Count</th>` : ""}
						<th>Amount</th>
					</tr>
				</thead>
				<tbody>
					${this.#entries.length? this.#entries.map(entry => html`
						<tr>
							<td>${entry.itemName}</td>
							${countsArePartitioned? html`<td>${entry.count}</td>` : ""}
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