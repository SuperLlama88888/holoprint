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
		let tableHeading = this.packName? `Material list: ${this.packName}` : "Material list";
		let countColumnName = this.#countsArePartitioned? html`<th>Count</th>` : "";
		let tableColumnNames = html`
			<th>Item name</th>
			${countColumnName}
			<th>Amount</th>
		`;
		let tableBody = this.#entries.length? this.#entries.map(entry => this.#makeRowForEntry(entry)).join("") : html`
			<tr>
				<td colspan="3"><i>There are no items in the material list.</i></td>
			</tr>
		`;
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
						<th colspan="3">${tableHeading}</th>
					</tr>
					<tr>
						${tableColumnNames}
					</tr>
				</thead>
				<tbody>
					${tableBody}
				</tbody>
			</table>
		`;
		
		this.#hasRendered = true;
	}
	/**
	 * @param {MaterialListEntry} entry
	 * @returns {string}
	 */
	#makeRowForEntry(entry) {
		let rawCountCell = this.#countsArePartitioned? html`<td>${entry.count}</td>` : "";
		const partitionedCount = entry.partitionedCountWithoutTotal.replaceAll(this.#materialList.shulkerBoxGlyphChar, "sb");
		return html`
			<tr>
				<td>${entry.itemName}</td>
				${rawCountCell}
				<td>${partitionedCount}</td>
			</tr>
		`
	}
}

/** @import { MaterialListEntry } from "../HoloPrint.js" */
/** @import MaterialList from "../MaterialList.js" */