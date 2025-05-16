import { clamp, createSymbolicEnum, html, isTouchInElementVerticalBounds, max, min, removeFileExtension, sleep } from "../essential.js";

export default class FileInputTable extends HTMLElement {
	static observedAttributes = ["file-count-text", "empty-text", "remove-all-text", "hide-file-extensions"];
	
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
	/** @type {Number} */
	#touchDragVerticalOffset;
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
	attributeChangedCallback(attrName, _, newValue) {
		let elBoundToAttr = this.shadowRoot.selectEl(`[data-text-attribute="${attrName}"]`);
		if(elBoundToAttr) {
			elBoundToAttr.textContent = newValue;
			return;
		}
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
					border: 4px ridge #ADADAD;
					& > * {
						width: 100%;
					}
				}
				@supports (-webkit-text-zoom: normal) { /* Exclusively target WebKit browsers (i.e. Safari) because different styling is needed there. I found this property by looking at https://caniuse.com/?search=-webkit to find webkit-only properties, and -webkit-text-zoom is the ONLY one that's only ever been supported in WebKit. 'Documentation' for this property can be found at https://webkit.org/css-status/#?search=-webkit-text-zoom. A larger list of -webkit- properties can be found at https://developer.mozilla.org/en-US/docs/Web/CSS/WebKit_Extensions. */
					#main {
						border-color: #626262;
					}
				}
				#fileCountHeadingWrapper {
					margin: 0;
					padding: 1px 1px 1px 3px;
					height: 22px;
					box-sizing: border-box;
					background: #0000002B;
				}
				#fileCountHeading {
					font-weight: bold;
					font-size: 1em;
				}
				#removeAllFilesButton {
					padding: 0 4px;
					float: right;
					height: 100%;
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
						display: inline-block;
						width: 1ch;
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
						cursor: initial;
					}
					&:nth-child(2n + 1) {
						background: #0001;
					}
					&.beingDragged {
						position: relative;
						background: #00000028;
						transition: background 0.1s;
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
						width: 5.06rem;
					}
					div {
						height: 24px;
						display: flex;
						* {
							width: 1.265rem;
							height: 24px;
							font-size: 115%;
							transition: font-size 0.1s;
							text-align: center;
						}
					}
					button {
						padding: 0;
						border: none;
						background: none;
						cursor: pointer;
						&:not(.dragMoveCell):active {
							font-size: 80%;
						}
					}
				}
				.material-symbols {
					font-family: "Material Symbols";
					line-height: 1;
				}
			</style>
			<div id="main">
				<p id="fileCountHeadingWrapper"><span id="fileCountHeading"></span><button id="removeAllFilesButton"><span data-text-attribute="remove-all-text">Remove all</span> <span class="material-symbols">delete_sweep</span></button></p>
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
		this.#table.onEvents(["dragstart", "touchstart"], e => {
			if(e.target.classList.contains("dragMoveCell") && getComputedStyle(e.target).opacity != "0") {
				let row = e.target.closest("tr");
				if(row.classList.contains("beingDeleted")) {
					e.preventDefault();
					return;
				}
				this.#rowBeingDragged = row;
				this.#rowBeingDragged.classList.add("beingDragged");
				if(e.type == "dragstart") {
					e.dataTransfer.effectAllowed = "move";
					e.dataTransfer.dropEffect = "move";
					e.dataTransfer.setDragImage(this.#rowBeingDragged.cells[0], 0, 0);
				} else {
					this.#touchDragVerticalOffset = e.changedTouches[0].clientY;
				}
			}
		}, {
			passive: false
		});
		this.#table.onEvents(["dragover", "touchmove"], e => {
			if(!this.#rowBeingDragged) {
				return;
			}
			e.preventDefault();
			let targetRow;
			if(e.type == "dragover") {
				targetRow = e.target.closest("tr");
			} else {
				let touch = e.changedTouches[0];
				if(isTouchInElementVerticalBounds(touch, this.#table)) {
					targetRow = Array.from(this.#table.rows).find(row => row != this.#rowBeingDragged && isTouchInElementVerticalBounds(touch, row));
				}
			}
			if(targetRow && targetRow != this.#rowBeingDragged && !targetRow.getAnimations().length) {
				let initialY = this.#rowBeingDragged.offsetTop;
				if(this.#rowBeingDragged.rowIndex < targetRow.rowIndex) {
					for(let rowI = this.#rowBeingDragged.rowIndex + 1; rowI <= targetRow.rowIndex; rowI++) {
						this.#animateRow(this.#table.rows[rowI], FileInputTable.#ANIMATION_MOVEMENTS.MOVE_UP, false);
					}
					targetRow.after(this.#rowBeingDragged);
					this.#animateRow(this.#rowBeingDragged, e.type == "dragover"? FileInputTable.#ANIMATION_MOVEMENTS.MOVE_DOWN : undefined);
				} else {
					for(let rowI = targetRow.rowIndex; rowI < this.#rowBeingDragged.rowIndex; rowI++) {
						this.#animateRow(this.#table.rows[rowI], FileInputTable.#ANIMATION_MOVEMENTS.MOVE_DOWN, false);
					}
					targetRow.before(this.#rowBeingDragged);
					this.#animateRow(this.#rowBeingDragged, e.type == "dragover"? FileInputTable.#ANIMATION_MOVEMENTS.MOVE_UP : undefined);
				}
				let deltaY = this.#rowBeingDragged.offsetTop - initialY;
				this.#touchDragVerticalOffset += deltaY;
				this.#updateFileInput();
			}
			if(e.type == "touchmove") {
				let currentOffset = parseFloat(this.#rowBeingDragged.style.top) || 0;
				let tableBounds = this.#table.getBoundingClientRect();
				let rowBounds = this.#rowBeingDragged.getBoundingClientRect();
				let lowest = min(tableBounds.top - (rowBounds.top - currentOffset), 0);
				let highest = max(tableBounds.bottom - (rowBounds.bottom - currentOffset), 0);
				let y = clamp(e.changedTouches[0].clientY - this.#touchDragVerticalOffset, lowest, highest);
				this.#rowBeingDragged.style.top = `${y}px`;
			}
		}, {
			passive: false
		});
		this.#table.onEvents(["dragend", "touchend", "touchcancel"], () => {
			if(this.#rowBeingDragged) {
				this.#rowBeingDragged.classList.remove("beingDragged");
				this.#rowBeingDragged.style.left = "";
				this.#rowBeingDragged.style.top = "";
				this.#rowBeingDragged = null;
			}
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
					<button draggable="true" class="dragMoveCell material-symbols">drag_indicator</button>
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
			for(let i = 0; i < 2; i++) { // more emphasis when done twice
				row.animate([
					i == 0? startingFrame : {},
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
			}
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