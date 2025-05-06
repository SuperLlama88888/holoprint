import { createSymbolicEnum, html, removeFileExtension, sleep } from "../essential.js";

export default class FileInputTable extends HTMLElement {
	static observedAttributes = ["file-count-text", "empty-text", "hide-file-extensions"];
	
	static #ANIMATION_MOVEMENTS = createSymbolicEnum(["MOVE_DOWN", "MOVE_UP"]);
	static #ANIMATION_LENGTH = 400;
	
	/** @type {HTMLInputElement} */
	fileInput;
	/** @type {HTMLTableElement} */
	#table;
	/** @type {HTMLParagraphElement} */
	#fileCountHeading;
	/** @type {HTMLTableRowElement|null} */
	#rowBeingDragged;
	/** @type {WeakMap<HTMLTableRowElement, File>} */
	#filesByRow;
	
	constructor() {
		super();
		this.attachShadow({
			mode: "open"
		});
		this.#filesByRow = new WeakMap();
	}
	connectedCallback() {
		if(this.childElementCount != 1 || !(this.children[0] instanceof HTMLInputElement) || this.children[0].type != "file") {
			throw new Error("FileInputTable elements need exactly 1 child: a file input!");
		}
		this.fileInput = this.children[0];
		this.#initShadowDom();
		this.fileInput.onEvent("input", () => this.#updateTable());
		
		this.#updateTable();
	}
	attributeChangedCallback(attrName) {
		if(!this.#table) {
			return;
		}
		switch(attrName) {
			case "file-count-text":
			case "empty-text": {
				this.#updateFileCountHeading();
				break;
			}
			case "hide-file-extensions": {
				this.#updateTable();
				break;
			}
		}
	}
	
	#initShadowDom() {
		this.shadowRoot.innerHTML = html`
			<style>
				:host {
					display: block;
					width: 100%;
				}
				#main {
					margin: auto;
					width: 70%;
					border: 3px ridge black;
					& > * {
						width: 100%;
					}
				}
				#fileCountHeadingWrapper {
					margin: 0;
					padding: 1px 1px 0 3px;
					height: 22px;
					box-sizing: border-box;
					background: #0000002B;
				}
				#fileCountHeading {
					font-weight: bold;
					font-size: 1rem;
				}
				#removeAllFilesButton {
					margin-top: 1px;
					padding: 0 4px;
					float: right;
					height: calc(100% - 2px);
					box-sizing: border-box;
					background: #00000028;
					border: 1px solid black;
					border-radius: 7px;
					font-family: inherit;
					line-height: inherit;
					font-size: smaller;
					cursor: pointer;
					transition: transform 0.15s;
					
					.material-symbols {
						font-size: 120%;
						vertical-align: top;
					}
					&:hover {
						transform: scale(1.05);
					}
					&:active {
						transform: scale(1.02);
					}
				}
				button {
					color: inherit;
				}
				table {
					border-collapse: collapse;
					table-layout: fixed;
				}
				tr {
					&:first-child .moveUpButton, &:last-child .moveDownButton {
						visibility: hidden;
					} 
					&:only-child .dragMoveCell {
						opacity: 0; /* silly css bug in both firefox and chrome: the background of the <tr> won't show when the last <td> is hidden. 0 opacity works though. */
					}
					&:nth-child(2n + 1) {
						background: #0001;
					}
					&.beingDragged {
						transition: background 0.1s;
						background: #00000028;
					}
					&:not(:only-child):not(.beingDeleted) .dragMoveCell {
						cursor: grab;
						&:active {
							cursor: grabbing;
						}
					}
				}
				td {
					&:first-child {
						padding: 0 3px;
						overflow: hidden;
						text-overflow: ellipsis;
					}
					&:last-child {
						user-select: none;
						padding: 0;
						width: 80px;
					}
					div {
						height: 20px;
						display: flex;
						* {
							width: 20px;
							height: 20px;
							font-size: 100%;
							transition: font-size 0.1s;
						}
					}
					button {
						padding: 0;
						border: none;
						background: none;
						cursor: pointer;
						text-align: center;
						&:active {
							font-size: 80%;
						}
					}
				}
				.material-symbols {
					font-family: "Material Symbols";
					line-height: 1;
					font-size: 100%;
				}
			</style>
			<div id="main">
				<p id="fileCountHeadingWrapper"><span id="fileCountHeading"></span><button id="removeAllFilesButton"><span>Remove all</span> <span class="material-symbols">delete_sweep</span></button></p>
				<table></table>
			</div>
		`;
		this.#fileCountHeading = this.shadowRoot.selectEl("#fileCountHeading");
		let removeAllFilesButton = this.shadowRoot.selectEl("#removeAllFilesButton");
		this.#table = this.shadowRoot.selectEl("table");
		
		this.#updateFileCountHeading();
		this.#updateHasFilesAttribute();
		let tableObserver = new MutationObserver(() => {
			this.#updateFileCountHeading();
			this.#updateHasFilesAttribute();
		});
		tableObserver.observe(this.#table, {
			childList: true,
			subtree: true
		});
		
		removeAllFilesButton.onEvent("click", async () => {
			for(let button of this.#table.selectEls(".deleteButton")) {
				button.click();
				await sleep(FileInputTable.#ANIMATION_LENGTH * 0.15);
			}
		});
		
		this.#table.addEventListener("click", e => {
			if(!(e.target instanceof HTMLButtonElement)) {
				return;
			}
			let row = e.target.closest("tr");
			if(e.target.classList.contains("moveUpButton")) {
				this.#animateRow(row.previousElementSibling, FileInputTable.#ANIMATION_MOVEMENTS.MOVE_DOWN, false);
				row.previousElementSibling.before(row);
				this.#animateRow(row, FileInputTable.#ANIMATION_MOVEMENTS.MOVE_UP);
			} else if(e.target.classList.contains("moveDownButton")) {
				this.#animateRow(row.nextElementSibling, FileInputTable.#ANIMATION_MOVEMENTS.MOVE_UP, false);
				row.nextElementSibling.after(row);
				this.#animateRow(row, FileInputTable.#ANIMATION_MOVEMENTS.MOVE_DOWN);
			} else if(e.target.classList.contains("deleteButton")) {
				this.#deleteRow(row);
			} else {
				return;
			}
			this.#updateFileInput();
		});
		this.#table.onEvent("dragstart", e => {
			if(e.target.classList.contains("dragMoveCell") && getComputedStyle(e.target).opacity != "0") {
				let row = e.target.closest("tr");
				if(row.classList.contains("beingDeleted")) {
					e.preventDefault();
					return;
				}
				this.#rowBeingDragged = row;
				this.#rowBeingDragged.classList.add("beingDragged");
				e.dataTransfer.effectAllowed = "move";
				e.dataTransfer.dropEffect = "move";
				e.dataTransfer.setDragImage(this.#rowBeingDragged.cells[0], 0, 0);
			}
		});
		this.#table.onEvent("dragover", e => {
			if(this.#rowBeingDragged) {
				let targetRow = e.target.closest("tr");
				e.preventDefault();
				if(targetRow && targetRow != this.#rowBeingDragged && !targetRow.getAnimations().length) {
					if(this.#rowBeingDragged.rowIndex < targetRow.rowIndex) {
						for(let rowI = this.#rowBeingDragged.rowIndex + 1; rowI <= targetRow.rowIndex; rowI++) {
							this.#animateRow(this.#table.rows[rowI], FileInputTable.#ANIMATION_MOVEMENTS.MOVE_UP, false);
						}
						targetRow.after(this.#rowBeingDragged);
						this.#animateRow(this.#rowBeingDragged, FileInputTable.#ANIMATION_MOVEMENTS.MOVE_DOWN);
					} else {
						for(let rowI = targetRow.rowIndex; rowI < this.#rowBeingDragged.rowIndex; rowI++) {
							this.#animateRow(this.#table.rows[rowI], FileInputTable.#ANIMATION_MOVEMENTS.MOVE_DOWN, false);
						}
						targetRow.before(this.#rowBeingDragged);
						this.#animateRow(this.#rowBeingDragged, FileInputTable.#ANIMATION_MOVEMENTS.MOVE_UP);
					}
					this.#animateRow(this.#rowBeingDragged);
					this.#updateFileInput();
				}
			}
		});
		this.#table.onEvent("dragend", () => {
			this.#rowBeingDragged?.classList.remove("beingDragged");
			this.#rowBeingDragged = null;
		});
	}
	/**
	 * Updates the table to show all files selected.
	 */
	#updateTable() {
		let alreadyHadRows = this.#table.rows.length > 0; // don't animate new files added if they're the first files added
		let oldFiles = alreadyHadRows && new Set(Array.from(this.#table.rows).map(row => this.#filesByRow.get(row)));
		this.#table.textContent = "";
		Array.from(this.fileInput.files).forEach(file => {
			let row = this.#table.insertRow();
			this.#filesByRow.set(row, file);
			let fileNameCell = row.insertCell();
			fileNameCell.textContent = this.hasAttribute("hide-file-extensions") && file.name.lastIndexOf(".") != 0? removeFileExtension(file.name) : file.name;
			this.#addGenericRowButtons(row);
			if(alreadyHadRows && !oldFiles.has(file)) {
				this.#animateRow(row);
			}
		});
	}
	#updateFileCountHeading() {
		if(this.fileInput.files.length) {
			let countText = this.getAttribute("file-count-text") ?? "{COUNT} file[s] selected";
			let pluralizedCountText = this.fileInput.files.length > 1? countText.replaceAll(/\[|\]/g, "") : countText.replaceAll(/\[.+\]/g, "");
			this.#fileCountHeading.textContent = pluralizedCountText.replace("{COUNT}", this.fileInput.files.length);
		} else {
			this.#fileCountHeading.textContent = this.getAttribute("empty-text") ?? "No files are selected";
		}
	}
	#updateHasFilesAttribute() {
		if(this.fileInput.files.length) {
			this.setAttribute("has-files", ""); // An earlier iteration of this used custom states with ElementInternals. This allowed for the CSS to be :state(has-files) rather than [has-files]. However, it's too modern and wouldn't have worked on old browsers.
		} else {
			this.removeAttribute("has-files");
		}
	}
	/**
	 * Adds all the control buttons to a table row.
	 * @param {HTMLTableRowElement} row
	 */
	#addGenericRowButtons(row) {
		row.insertAdjacentHTML("beforeend", html`
			<td>
				<div>
					<button class="moveUpButton material-symbols">arrow_upward</button>
					<button class="moveDownButton material-symbols">arrow_downward</button>
					<button class="deleteButton material-symbols">delete</button>
					<span draggable="true" class="dragMoveCell material-symbols">drag_indicator</span>
				</div>
			</td>
		`);
	}
	#updateFileInput() {
		let files = Array.from(this.#table.rows).filter(row => !row.classList.contains("beingDeleted")).map(row => this.#filesByRow.get(row));
		let dt = new DataTransfer();
		files.forEach(file => dt.items.add(file));
		this.fileInput.files = dt.files;
		this.#updateFileCountHeading();
	}
	/**
	 * Plays a small movement animation on a row.
	 * @param {HTMLTableRowElement} row
	 * @param {Symbol|undefined} [movement]
	 * @param {Boolean} [highlight]
	 */
	#animateRow(row, movement, highlight = true) {
		let startingFrame = {};
		if(movement) {
			let rowHeight = row.getBoundingClientRect().height;
			let offset = rowHeight * (movement == FileInputTable.#ANIMATION_MOVEMENTS.MOVE_DOWN? -1 : 1);
			startingFrame = {
				transform: `translateY(${offset}px)`,
				composite: "add"
			};
		}
		if(highlight) {
			const middleFrame = {
				transform: "scale(1.08)",
				boxShadow: "0 0 5px #0008"
			};
			row.animate([
				startingFrame,
				{
					...middleFrame,
					offset: 0.3
				},
				{
					...middleFrame,
					offset: 0.7
				},
				{}
			], {
				duration: FileInputTable.#ANIMATION_LENGTH,
				easing: "ease"
			});
		} else {
			row.animate([startingFrame, {}], {
				duration: FileInputTable.#ANIMATION_LENGTH * 0.3,
				easing: "ease"
			});
		}
	}
	/**
	 * Deletes the row and plays an animation.
	 * @param {HTMLTableRowElement} row
	 */
	async #deleteRow(row) {
		if(row.classList.contains("beingDeleted")) {
			return;
		}
		row.classList.add("beingDeleted");
		let deleteAnimation = row.animate({
			opacity: [1, 0]
		}, {
			duration: FileInputTable.#ANIMATION_LENGTH,
			easing: "cubic-bezier(0.165, 0.84, 0.44, 1)"
		});
		await deleteAnimation.finished;
		for(let rowI = row.rowIndex + 1; rowI < this.#table.rows.length; rowI++) {
			this.#animateRow(this.#table.rows[rowI], FileInputTable.#ANIMATION_MOVEMENTS.MOVE_UP, false);
		}
		let rowHeight = row.getBoundingClientRect().height;
		this.#table.animate({
			marginBottom: [rowHeight + "px", "0"]
		}, {
			duration: FileInputTable.#ANIMATION_LENGTH * 0.3,
			easing: "ease",
			composite: "add"
		});
		row.remove();
	}
}