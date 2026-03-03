import { html } from "../utils.js";

export default class MaterialListTable extends HTMLElement {
	#hasRendered = false;
	#countsArePartitioned = false;
	/** @type {MaterialListEntry[]} */
	#entries;
	/** @type {MaterialList} */
	#materialList;
	get materialList() {
		return this.#materialList;
	}
	set materialList(materialList) {
		this.#materialList = materialList;
		this.#entries = this.#materialList.export();
		this.#countsArePartitioned = this.#entries.some(({ count }) => count >= 64);
		this.#render();
	}
	/** @type {string | undefined} */
	#packName;
	get packName() {
		return this.#packName;
	}
	set packName(packName) {
		this.#packName = packName;
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
		this.shadowRoot.innerHTML = html`
			<style>
				:host {
					margin: 15px;
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
						<th colspan="3">${this.packName? `Material list: ${this.packName}` : "Material list"}</th>
					</tr>
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
							<td>${entry.partitionedCountWithoutTotal.replaceAll(this.#materialList.shulkerBoxGlyphChar, "sb")}</td>
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
/** @import MaterialList from "../MaterialList.js" */