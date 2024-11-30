import { selectEl, downloadBlob, sleep, selectEls, htmlCodeToElement, CachingFetcher } from "./essential.js";
import * as HoloPrint from "./HoloPrint.js";
import SimpleLogger from "./SimpleLogger.js";
import SupabaseLogger from "./SupabaseLogger.js";

import ResourcePackStack, { VanillaDataFetcher } from "./ResourcePackStack.js";
import LocalResourcePack from "./LocalResourcePack.js";

const IN_PRODUCTION = location.host.includes(".github.io"); // hosted on GitHub Pages
const ACTUAL_CONSOLE_LOG = false;

const supabaseProjectUrl = "https://gnzyfffwvulwxbczqpgl.supabase.co";
const supabaseApiKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImduenlmZmZ3dnVsd3hiY3pxcGdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjMwMjE3NzgsImV4cCI6MjAzODU5Nzc3OH0.AWMhFcP3PiMD3dMC_SeIVuPx128KVpgfkZ5qBStDuVw";

window.OffscreenCanvas ?? class OffscreenCanvas {
	constructor(w, h) {
		console.debug("Using OffscreenCanvas polyfill");
		this.canvas = document.createElement("canvas");
		this.canvas.width = w;
		this.canvas.height = h;
		this.canvas.convertToBlob = () => {
			return new Promise((res, rej) => {
				this.canvas.toBlob(blob => {
					if(blob) {
						res(blob);
					} else {
						rej();
					}
				});
			});
		};
		return this.canvas;
	}
};

let dropFileNotice;

let generatePackForm;
let generatePackFormSubmitButton;
let structureFilesInput;
let packNameInput;
let logger;

let supabaseLogger;

document.onEvent("DOMContentLoaded", async () => {
	document.body.appendChild = selectEl("main").appendChild.bind(selectEl("main"));
	
	generatePackForm = selectEl("#generatePackForm");
	dropFileNotice = selectEl("#dropFileNotice");
	structureFilesInput = generatePackForm.elements.namedItem("structureFiles");
	packNameInput = generatePackForm.elements.namedItem("packName");
	structureFilesInput.onEventAndNow("input", updatePackNameInputPlaceholder);
	
	if(location.search == "?loadFile") {
		window.launchQueue?.setConsumer(async launchParams => {
			let launchFiles = await Promise.all(launchParams.files.map(fileHandle => fileHandle.getFile()));
			handleInputFiles(launchFiles);
		});
	}
	
	let dragCounter = 0;
	document.documentElement.onEvent("dragenter", () => {
		dragCounter++;
	});
	document.documentElement.onEvent("dragover", e => {
		if(e.dataTransfer?.types?.includes("Files")) { // https://html.spec.whatwg.org/multipage/dnd.html#dom-datatransfer-types-dev
			e.preventDefault();
			dropFileNotice.classList.remove("hidden");
		}
	});
	document.documentElement.onEvent("dragleave", () => {
		dragCounter--;
		if(dragCounter == 0) {
			dropFileNotice.classList.add("hidden");
		}
	});
	document.documentElement.onEvent("drop", async e => {
		e.preventDefault();
		dragCounter = 0;
		dropFileNotice.classList.add("hidden");
		let files = [...e.dataTransfer.files]; // apparently this is a "historical accident": https://stackoverflow.com/a/74641156
		handleInputFiles(files);
	});
	
	if(!ACTUAL_CONSOLE_LOG) {
		let logCont = selectEl("#log");
		logger = new SimpleLogger(logCont);
		logger.patchConsoleMethods();
	}
	
	generatePackForm.onEvent("submit", async e => {
		e.preventDefault();
		
		let formData = new FormData(generatePackForm);
		let resourcePacks = [];
		let localResourcePackFiles = generatePackForm.elements.namedItem("localResourcePack").files;
		if(localResourcePackFiles.length) {
			resourcePacks.push(await new LocalResourcePack(localResourcePackFiles));
		}
		makePack(formData.getAll("structureFiles"), resourcePacks);
	});
	generatePackFormSubmitButton = generatePackForm.elements.namedItem("submit");
	
	let opacityModeSelect = generatePackForm.elements.namedItem("opacityMode");
	opacityModeSelect.onEventAndNow("change", () => {
		generatePackForm.elements.namedItem("opacity").parentElement.classList.toggle("hidden", opacityModeSelect.value == "multiple");
	});
	
	let clearResourcePackCacheButton = selectEl("#clearResourcePackCacheButton");
	clearResourcePackCacheButton.onEvent("click", async () => {
		caches.clear();
		temporarilyChangeText(clearResourcePackCacheButton, "Resource pack cache cleared!");
	});
	
	selectEls(".resetButton").forEach(el => {
		el.onEvent("click", () => {
			let fieldset = el.parentElement;
			let elementsToSave = [...generatePackForm.elements].filter(el => el.localName != "fieldset" && el.localName != "button" && !fieldset.contains(el));
			let oldValues = elementsToSave.map(el => el.files ?? el.value);
			generatePackForm.reset();
			elementsToSave.forEach((el, i) => {
				if(el.type == "file") {
					el.files = oldValues[i];
				} else {
					el.value = oldValues[i];
				}
			});
			temporarilyChangeText(el, el.dataset.resetText ?? el.innerText);
		});
	});
	
	let materialListLanguageSelector = selectEl("#materialListLanguageSelector");
	(await new ResourcePackStack()).fetchResource("texts/language_names.json").then(res => res.json()).then(languages => {
		materialListLanguageSelector.firstElementChild.remove();
		languages.forEach(([languageCode, languageName]) => {
			materialListLanguageSelector.appendChild(new Option(languageName, languageCode, false, languageCode.replace("_", "-") == navigator.language));
		});
	}).catch(e => {
		console.warn("Couldn't load language_names.json:", e);
	});
});

async function handleInputFiles(files) {
	let structureFiles = files.filter(file => file.name.endsWith(".mcstructure"));
	let resourcePacks = files.filter(file => file.name.endsWith(".mcpack"));
	
	for(let resourcePack of resourcePacks) {
		let extractedStructureFiles = await HoloPrint.extractStructureFilesFromPack(resourcePack);
		structureFiles.push(...extractedStructureFiles);
	}
	if(structureFiles.length) {
		let dataTransfer = new DataTransfer();
		[...structureFilesInput.files, ...structureFiles].forEach(structureFile => dataTransfer.items.add(structureFile));
		structureFilesInput.files = dataTransfer.files;
	}
	updatePackNameInputPlaceholder();
}
function updatePackNameInputPlaceholder() {
	packNameInput.setAttribute("placeholder", HoloPrint.getDefaultPackName([...structureFilesInput.files]));
}

async function temporarilyChangeText(el, text, duration = 2000) {
	let originalText = el.innerText;
	el.innerText = text;
	el.setAttribute("disabled", "");
	await sleep(duration);
	el.innerText = originalText;
	el.removeAttribute("disabled");
}

async function makePack(structureFiles, localResourcePacks) {
	generatePackFormSubmitButton.disabled = true;
	
	let formData = new FormData(generatePackForm);
	let authors = formData.get("author").split(",").map(x => x.trim()).removeFalsies();
	/** @type {import("./HoloPrint.js").HoloPrintConfig} */
	let config = {
		IGNORED_BLOCKS: formData.get("ignoredBlocks").split(/\W/).removeFalsies(),
		SCALE: formData.get("scale") / 100,
		OPACITY: formData.get("opacity") / 100,
		MULTIPLE_OPACITIES: formData.get("opacityMode") == "multiple",
		LAYER_MODE: formData.get("layerMode"),
		TEXTURE_OUTLINE_WIDTH: +formData.get("textureOutlineWidth"),
		TEXTURE_OUTLINE_COLOR: formData.get("textureOutlineColor"),
		TEXTURE_OUTLINE_ALPHA_THRESHOLD: +formData.get("textureOutlineAlphaThreshold"),
		TEXTURE_OUTLINE_ALPHA_DIFFERENCE_MODE: formData.get("textureOutlineAlphaDifferenceMode"),
		DO_SPAWN_ANIMATION: formData.get("spawnAnimationEnabled"),
		CONTROLS: {
			TOGGLE_RENDERING: JSON.parse(formData.get("toggleRenderingControls")),
			CHANGE_OPACITY: JSON.parse(formData.get("changeOpacityControls")),
			TOGGLE_VALIDATING: JSON.parse(formData.get("toggleValidatingControls")),
			CHANGE_LAYER: JSON.parse(formData.get("changeLayerControls")),
			DECREASE_LAYER: JSON.parse(formData.get("decreaseLayerControls")),
			MOVE_HOLOGRAM: JSON.parse(formData.get("moveHologramControls")),
			CHANGE_STRUCTURE: JSON.parse(formData.get("changeStructureControls")),
			DISABLE_PLAYER_CONTROLS: JSON.parse(formData.get("disablePlayerControlsControls"))
		},
		MATERIAL_LIST_LANGUAGE: formData.get("materialListLanguage"),
		PACK_NAME: formData.get("packName") || undefined,
		PACK_ICON_BLOB: formData.get("packIcon").size? formData.get("packIcon") : undefined,
		AUTHORS: authors,
		DESCRIPTION: formData.get("description") || undefined
	};
	
	let previewCont = selectEl("#previewCont");
	
	let resourcePackStack = await new ResourcePackStack(localResourcePacks);
	
	let pack;
	logger?.setOriginTime(performance.now());
	
	if(ACTUAL_CONSOLE_LOG) {
		pack = await HoloPrint.makePack(structureFiles, config, resourcePackStack, previewCont);
	} else {
		try {
			pack = await HoloPrint.makePack(structureFiles, config, resourcePackStack, previewCont);
		} catch(e) {
			console.error(`Pack creation failed: ${e}`);
		}
	}
	
	if(IN_PRODUCTION) {
		supabaseLogger ??= new SupabaseLogger(supabaseProjectUrl, supabaseApiKey);
		supabaseLogger.recordPackCreation(structureFiles);
	}
	
	if(pack) {
		let downloadButton = document.createElement("button");
		downloadButton.classList.add("importantButton");
		downloadButton.innerText = `Download ${pack.name}`;
		downloadButton.onclick = () => downloadBlob(pack, pack.name);
		downloadButton.click();
		document.body.appendChild(downloadButton);
	}
	
	generatePackFormSubmitButton.disabled = false;
	
	return pack;
}

customElements.define("item-criteria-input", class extends HTMLElement {
	static formAssociated = true;
	static observedAttributes = ["value-items", "value-tags"];
	
	shadowRoot;
	internals;
	
	#connected;
	#tasksPendingConnection;
	
	#vanillaItemsPromise;
	#vanillaItemTagsPromise;
	#criteriaInputsCont;
	
	constructor() {
		super();
		this.shadowRoot = this.attachShadow({
			mode: "open"
		});
		this.internals = this.attachInternals();
		
		this.#connected = false;
		this.#tasksPendingConnection = [];
		
		this.#vanillaItemsPromise = (new VanillaDataFetcher()).then(fetcher => fetcher.fetch("metadata/vanilladata_modules/mojang-items.json")).then(res => res.json()).then(data => data["data_items"].map(item => item["name"].replace(/^minecraft:/, "")));
		this.#vanillaItemTagsPromise = (new CachingFetcher("BedrockData@2.14.1+bedrock-1.21.40", "https://raw.githubusercontent.com/pmmp/BedrockData/refs/tags/2.14.1+bedrock-1.21.40/")).then(fetcher => fetcher.fetch("item_tags.json")).then(res => res.json()).then(data => Object.keys(data).map(tag => tag.replace(/^minecraft:/, "")));
	}
	connectedCallback() {
		if(this.#connected) {
			return;
		}
		this.#connected = true;
		
		this.tabIndex = 0;
		this.shadowRoot.innerHTML = `
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
			<label for="latestInput">Matching:</label>
			<label id="criteriaInputs" data-empty-text="Nothing"></label>
			<button id="addItemButton">+ Item name</button>
			<button id="addTagButton">+ Item tag</button>
			<datalist id="itemNamesDatalist"></datalist>
			<datalist id="itemTagsDatalist"></datalist>
		`;
		this.#vanillaItemsPromise.then(itemNames => {
			let itemNamesDatalist = this.shadowRoot.selectEl("#itemNamesDatalist");
			itemNames.forEach(itemName => {
				itemNamesDatalist.appendChild(new Option(itemName));
			});
		});
		this.#vanillaItemTagsPromise.then(tags => {
			let itemTagsDatalist = this.shadowRoot.selectEl("#itemTagsDatalist");
			tags.forEach(tag => {
				itemTagsDatalist.appendChild(new Option(tag));
			});
		})
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
		
		this.#criteriaInputsCont.onEventAndNow("input", () => {
			this.internals.setFormValue(this.value);
			let allInputs = [...this.#criteriaInputsCont.selectEls("input")];
			if(allInputs.length == 0) {
				this.internals.setValidity({
					tooShort: true
				}, "Please enter item criteria");
			} else if(allInputs.some(el => !el.validity.valid)) {
				this.internals.setValidity({
					patternMismatch: true
				}, "Invalid item/tag name");
			} else {
				this.internals.setValidity({});
			}
		});
		
		this.onEvent("focus", e => {
			if(e.composedPath()[0] instanceof this.constructor) { // If this event was triggered from an element in the shadow DOM being .focus()ed, we don't want to focus something else
				(this.shadowRoot.selectEl("input:invalid") ?? this.shadowRoot.selectEl("input:last-child") ?? this.shadowRoot.selectEl("#addItemButton")).focus();
			}
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
			this.#addNewInput("item", false);
			this.#criteriaInputsCont.selectEl("input:last-child").value = itemName;
		});
		itemCriteria["tags"]?.forEach(tagName => {
			this.#addNewInput("tag", false);
			this.#criteriaInputsCont.selectEl("input:last-child").value = tagName;
		});
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
	#addNewInput(type, autofocus = true) {
		const attributesByType = {
			"item": `placeholder="Item name" list="itemNamesDatalist" class="itemNameInput"`,
			"tag": `placeholder="Tag name" list="itemTagsDatalist" class="itemTagInput"`
		}
		this.#criteriaInputsCont.selectEl(`input:last-child:placeholder-shown`)?.remove();
		let lastNode = [...this.#criteriaInputsCont.childNodes].at(-1);
		if(lastNode && !(lastNode instanceof Text)) {
			this.#criteriaInputsCont.appendChild(new Text(" or "));
		}
		let newInput = htmlCodeToElement(`<input type="text" required pattern="^\\s*(\\w+:)?\\w+\\s*$" spellcheck="false" autocapitalize="off" ${attributesByType[type]}/>`);
		newInput.onEvent("keydown", this.#inputKeyDownEvent);
		this.#criteriaInputsCont.appendChild(newInput);
		if(autofocus) {
			newInput.focus();
		}
	}
	#inputKeyDownEvent = e => { // must be arrow function to keep class scope
		if(e.target.value != "" && (e.key == "Tab" && e.target == this.#criteriaInputsCont.selectEl("input:last-child") || e.key == "Enter" || e.key == ",")) {
			e.preventDefault();
			this.#addNewInput(e.target.classList.contains("itemNameInput")? "item" : "tag");
		} else if(e.key == "Backspace" && e.target.value == "") {
			e.target.remove();
			this.#criteriaInputsCont.childNodes.forEach(node => {
				if(node instanceof Text && (node.previousSibling instanceof Text || !node.previousSibling || !node.nextSibling)) {
					node.remove();
				}
			});
			this.focus();
		}
	};
});