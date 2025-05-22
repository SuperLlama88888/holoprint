import { html, htmlCodeToElement } from "../essential.js";
import * as HoloPrint from "../HoloPrint.js";
import { VanillaDataFetcher } from "../ResourcePackStack.js";

let itemsDatalistPromise = (new VanillaDataFetcher()).then(async fetcher => {
	let mojangItems = await fetcher.fetch("metadata/vanilladata_modules/mojang-items.json").then(res => res.json());
	let itemNames = mojangItems["data_items"].map(item => item["name"].replace(/^minecraft:/, ""))
	let datalist = document.createElement("datalist");
	datalist.id = "itemNamesDatalist";
	datalist.append(...itemNames.map(itemName => new Option(itemName)));
	return datalist;
});
let itemTagsDatalistPromise = HoloPrint.createPmmpBedrockDataFetcher().then(async fetcher => {
	let data = await fetcher.fetch("item_tags.json").then(res => res.json());
	let itemTags = Object.keys(data).map(tag => tag.replace(/^minecraft:/, ""));
	let datalist = document.createElement("datalist");
	datalist.id = "itemTagsDatalist";
	datalist.append(...itemTags.map(tag => new Option(tag)));
	return datalist;
});

/** A custom item criteria input element. Translation files can be added by extending and setting translateCurrentLanguage. */
export default class ItemCriteriaInput extends HTMLElement {
	static formAssociated = true;
	static observedAttributes = ["value-items", "value-tags"];
	
	internals;
	
	#connected;
	#tasksPendingConnection;
	#translateCurrentLanguage;
	
	#criteriaInputsCont;
	
	/**
	 * @param {Function} [translateCurrentLanguage]
	 */
	constructor(translateCurrentLanguage) {
		super();
		this.#translateCurrentLanguage = translateCurrentLanguage;
		this.attachShadow({
			mode: "open"
		});
		this.internals = this.attachInternals();
		
		this.#connected = false;
		this.#tasksPendingConnection = [];
	}
	connectedCallback() {
		if(this.#connected) {
			return;
		}
		this.#connected = true;
		
		this.tabIndex = 0;
		this.shadowRoot.innerHTML = html`
			<style>
				:host {
					display: block;
					padding-left: 15px;
					font-size: 0.8rem;
				}
				#criteriaInputs:empty::before {
					content: attr(data-empty-text);
				}
				button {
					background: color-mix(in srgb, var(--accent-col) 50%, white);
					cursor: pointer;
					font-family: inherit;
					line-height: inherit;
				}
				input, button {
					box-sizing: border-box;
					border-style: solid;
					border-color: var(--accent-col);
					outline-color: var(--accent-col);
					accent-color: var(--accent-col);
				}
				input {
					font-family: monospace;
				}
				input.itemNameInput, #addItemButton {
					--accent-col: #01808C;
				}
				input.itemTagInput, #addTagButton {
					--accent-col: #E6BE1A;
				}
				/* input:valid {
					--accent-col: #70B80B;
				} */
				input:invalid:not(:placeholder-shown) {
					--accent-col: #E24436;
				}
			</style>
			<label data-translate="item_criteria_input.matching">Matching:</label>
			<label id="criteriaInputs" data-empty-text="Nothing" data-translate-data-empty-text="item_criteria_input.nothing"></label>
			<button id="addItemButton">+ <span data-translate="item_criteria_input.item_name">Item name</span></button>
			<button id="addTagButton">+ <span data-translate="item_criteria_input.item_tag">Item tag</span></button>
		`;
		this.#criteriaInputsCont = this.shadowRoot.selectEl("#criteriaInputs");
		this.shadowRoot.selectEl("#addItemButton").onEvent("click", () => {
			this.#addNewInput("item");
		});
		this.shadowRoot.selectEl("#addTagButton").onEvent("click", () => {
			this.#addNewInput("tag");
		});
		
		let task;
		while(task = this.#tasksPendingConnection.shift()) {
			task();
		}
		
		this.#criteriaInputsCont.onEventAndNow("input", () => this.#reportFormState());
		this.onEvent("focus", async e => {
			if(e.composedPath()[0] instanceof this.constructor) { // If this event was triggered from an element in the shadow DOM being .focus()ed, we don't want to focus something else
				(this.shadowRoot.selectEl("input:invalid") ?? this.shadowRoot.selectEl("input:last-child") ?? this.shadowRoot.selectEl("#addItemButton")).focus();
			}
			this.shadowRoot.append(await itemsDatalistPromise, await itemTagsDatalistPromise);
		});
		this.onEvent("blur", async () => { // remove empty inputs when focus is lost
			if([...this.#criteriaInputsCont.selectEls("input")].filter(input => input.value.trim() == "").map(input => input.remove()).length) {
				this.#reportFormState();
				this.#removeConsecutiveOrSpacers();
			}
			this.shadowRoot.removeChild(await itemsDatalistPromise);
			this.shadowRoot.removeChild(await itemTagsDatalistPromise);
		});
	}
	attributeChangedCallback(...args) { // called for all attributes in the tag before connectedCallback(), so we schedule them to be handled later
		if(this.#connected) {
			this.#handleAttributeChange(...args);
		} else {
			this.#tasksPendingConnection.push(() => {
				this.#handleAttributeChange(...args);
			});
		}
	}
	formResetCallback() {
		this.value = this.getAttribute("default") ?? "{}";
	}
	get form() {
		return this.internals.form;
	}
	get name() {
		return this.getAttribute("name");
	}
	get type() {
		return this.localName;
	}
	get value() {
		let itemNames = [...this.#criteriaInputsCont.selectEls(".itemNameInput")].map(input => input.value.trim());
		let tagNames = [...this.#criteriaInputsCont.selectEls(".itemTagInput")].map(input => input.value.trim());
		return JSON.stringify(HoloPrint.createItemCriteria(itemNames, tagNames));
	}
	set value(stringifiedValue) {
		this.#criteriaInputsCont.innerHTML = "";
		let itemCriteria = JSON.parse(stringifiedValue.replaceAll("'", `"`));
		itemCriteria["names"]?.forEach(itemName => {
			this.#addNewInput("item", false, itemName);
		});
		itemCriteria["tags"]?.forEach(tagName => {
			this.#addNewInput("tag", false, tagName);
		});
	}
	
	#reportFormState() {
		this.internals.setFormValue(this.value);
		let allInputs = [...this.#criteriaInputsCont.selectEls("input")];
		if(allInputs.length == 0) {
			this.internals.setValidity({
				tooShort: true
			}, this.#translateCurrentLanguage?.("item_criteria_input.error.empty") ?? "Please enter item criteria");
		} else if(allInputs.some(el => !el.validity.valid)) {
			this.internals.setValidity({
				patternMismatch: true
			}, this.#translateCurrentLanguage?.("item_criteria_input.error.invalid") ?? "Invalid item/tag name");
		} else {
			this.internals.setValidity({});
		}
	}
	#handleAttributeChange(attrName, oldValue, newValue) {
		let inputValue = JSON.parse(this.value);
		newValue = newValue.split(",");
		switch(attrName) {
			case "value-items": {
				inputValue["names"] = newValue;
			} break;
			case "value-tags": {
				inputValue["tags"] = newValue;
			} break;
		}
		this.value = JSON.stringify(inputValue);
	}
	#addNewInput(type, autofocus = true, initialValue) {
		const attributesByType = {
			"item": `placeholder="Item name" list="itemNamesDatalist" class="itemNameInput" data-translate-placeholder="item_criteria_input.item_name"`,
			"tag": `placeholder="Tag name" list="itemTagsDatalist" class="itemTagInput" data-translate-placeholder="item_criteria_input.item_tag"`
		}
		this.#criteriaInputsCont.selectEl(`input:last-child:placeholder-shown`)?.remove();
		let lastNode = [...this.#criteriaInputsCont.childNodes].at(-1);
		if(lastNode && !(lastNode instanceof HTMLSpanElement)) {
			let orSpan = document.createElement("span");
			orSpan.dataset.translate = "item_criteria_input.or";
			orSpan.innerText = " or ";
			this.#criteriaInputsCont.appendChild(orSpan);
		}
		let newInput = htmlCodeToElement(`<input type="text" required pattern="^\\s*(\\w+:)?\\w+\\s*$" spellcheck="false" autocapitalize="off" ${attributesByType[type]}/>`);
		newInput.onEvent("keydown", this.#inputKeyDownEvent);
		if(initialValue != undefined) {
			newInput.value = initialValue;
		}
		this.#criteriaInputsCont.appendChild(newInput);
		if(autofocus) {
			newInput.focus();
		}
		this.#reportFormState();
	}
	#inputKeyDownEvent = e => { // must be arrow function to keep class scope
		if(e.target.value != "" && (e.key == "Tab" && !e.shiftKey && e.target == this.#criteriaInputsCont.selectEl("input:last-child") || e.key == "Enter" || e.key == ",")) {
			e.preventDefault();
			this.#addNewInput(e.target.classList.contains("itemNameInput")? "item" : "tag");
			this.#reportFormState();
		} else if(e.key == "Backspace" && e.target.value == "") {
			e.preventDefault();
			e.target.remove();
			this.#removeConsecutiveOrSpacers();
			this.focus();
			this.#reportFormState();
		}
	};
	#removeConsecutiveOrSpacers() {
		[...this.#criteriaInputsCont.children].forEach(node => {
			if(node instanceof HTMLSpanElement && (node.previousSibling instanceof HTMLSpanElement || node.nextSibling instanceof HTMLSpanElement || !node.previousSibling || !node.nextSibling)) {
				node.remove();
			}
		});
	}
}