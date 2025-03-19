import { selectEl, downloadBlob, sleep, selectEls, htmlCodeToElement, CachingFetcher, loadTranslationLanguage, translate, getStackTrace, random, UserError } from "./essential.js";
import * as HoloPrint from "./HoloPrint.js";
import SimpleLogger from "./SimpleLogger.js";
import SupabaseLogger from "./SupabaseLogger.js";

import ResourcePackStack, { VanillaDataFetcher } from "./ResourcePackStack.js";
import LocalResourcePack from "./LocalResourcePack.js";
import TextureAtlas from "./TextureAtlas.js";

const IN_PRODUCTION = false;
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
let completedPacksCont;
let logger;
let languageSelector;
let defaultResourcePackStackPromise;

let supabaseLogger;

let texturePreviewImageCont;
let texturePreviewImage;

document.onEvent("DOMContentLoaded", () => {
	document.body.appendChild = selectEl("main").appendChild.bind(selectEl("main"));
	
	generatePackForm = selectEl("#generatePackForm");
	dropFileNotice = selectEl("#dropFileNotice");
	structureFilesInput = generatePackForm.elements.namedItem("structureFiles");
	packNameInput = generatePackForm.elements.namedItem("packName");
	packNameInput.onEvent("invalid", () => {
		packNameInput.setCustomValidity(translateCurrentLanguage("metadata.pack_name.error"));
	});
	packNameInput.onEvent("input", () => {
		packNameInput.setCustomValidity("");
	});
	structureFilesInput.onEventAndNow("input", updatePackNameInputPlaceholder);
	completedPacksCont = selectEl("#completedPacksCont");
	texturePreviewImageCont = selectEl("#texturePreviewImageCont");
	defaultResourcePackStackPromise = new ResourcePackStack();
	
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
	generatePackForm.onEvent("input", e => {
		if(e.target.closest("fieldset")?.classList?.contains("textureSettings") && e.target.hasAttribute("name")) {
			updateTexturePreview();
		}
	});
	updateTexturePreview();
	generatePackFormSubmitButton = generatePackForm.elements.namedItem("submit");
	
	let opacityModeSelect = generatePackForm.elements.namedItem("opacityMode");
	opacityModeSelect.onEventAndNow("change", () => {
		generatePackForm.elements.namedItem("opacity").parentElement.classList.toggle("hidden", opacityModeSelect.value == "multiple");
	});
	
	let playerControlsInputCont = selectEl("#playerControlsInputCont");
	Object.entries(HoloPrint.DEFAULT_PLAYER_CONTROLS).map(([control, itemCriteria]) => {
		let label = document.createElement("label");
		let playerControlTranslationKey = HoloPrint.PLAYER_CONTROL_NAMES[control];
		label.innerHTML = `<span data-translate="${playerControlTranslationKey}">...</span>:`;
		let input = document.createElement("item-criteria-input");
		input.setAttribute("name", `control.${control}`);
		if(itemCriteria["names"].length > 0) {
			input.setAttribute("value-items", itemCriteria["names"].join(","));
		}
		if(itemCriteria["tags"].length > 0) {
			input.setAttribute("value-tags", itemCriteria["tags"].join(","));
		}
		label.appendChild(input);
		playerControlsInputCont.appendChild(label);
		input.setAttribute("default", input.value); // has to be called after being added to the DOM
	});
	
	let clearResourcePackCacheButton = selectEl("#clearResourcePackCacheButton");
	clearResourcePackCacheButton.onEvent("click", async () => {
		caches.clear();
		temporarilyChangeText(clearResourcePackCacheButton, clearResourcePackCacheButton.dataset.resetTranslation);
	});
	
	selectEls(".resetButton").forEach(el => {
		el.onEvent("click", () => {
			let fieldset = el.parentElement;
			let elementsToSave = [...generatePackForm.elements].filter(el => el.localName != "fieldset" && el.localName != "button" && (!fieldset.contains(el) || !el.hasAttribute("name")));
			let oldValues = elementsToSave.map(el => {
				switch(el.type) {
					case "file": {
						let dataTransfer = new DataTransfer(); // Simply copying el.files wouldn't work since that's a FormData object, and resetting the form will reset the files in there as well. To work around this, we just copy all files to a DataTransfer, which is the only other thing that uses FormData. (Using structuredClone() is laggy on Chrome.)
						[...el.files].forEach(file => dataTransfer.items.add(file));
						return dataTransfer.files;
					}
					case "checkbox": return el.checked;
					default: return el.value;
				}
			});
			generatePackForm.reset(); // this resets the entire form, which is why the old values must be saved
			elementsToSave.forEach((el, i) => {
				switch(el.type) {
					case "file": {
						el.files = oldValues[i];
					} break;
					case "checkbox": {
						el.checked = oldValues[i];
					} break;
					default: {
						el.value = oldValues[i];
					}
				}
			});
			temporarilyChangeText(el, el.dataset.resetTranslation);
			opacityModeSelect.dispatchEvent(new Event("change"));
			updateTexturePreview();
		});
	});
	
	let materialListLanguageSelector = selectEl("#materialListLanguageSelector");
	defaultResourcePackStackPromise.then(rps => rps.fetchResource("texts/language_names.json")).then(res => res.json()).then(languages => {
		materialListLanguageSelector.firstElementChild.remove();
		languages.forEach(([languageCode, languageName]) => {
			materialListLanguageSelector.appendChild(new Option(languageName, languageCode, false, languageCode.replace("_", "-") == navigator.language));
		});
	}).catch(e => {
		console.warn("Couldn't load language_names.json:", e);
	});
	
	languageSelector = selectEl("#languageSelector");
	fetch("translations/languages.json").then(res => res.jsonc()).then(languagesAndNames => {
		languagesAndNames = Object.fromEntries(Object.entries(languagesAndNames).sort((a, b) => a[1] > b[1])); // sort alphabeticallly
		let availableLanguages = Object.keys(languagesAndNames);
		if(availableLanguages.length == 1) {
			selectEl("#languageSelectorCont").remove();
			return;
		}
		let defaultLanguage = navigator.languages.find(navigatorLanguage => {
			let navigatorBaseLanguage = navigatorLanguage.split("-")[0];
			return availableLanguages.find(availableLanguage => availableLanguage == navigatorLanguage) ?? availableLanguages.find(availableLanguage => availableLanguage == navigatorBaseLanguage) ?? availableLanguages.find(availableLanguage => availableLanguage.split(/-|_/)[0] == navigatorBaseLanguage);
		})?.split("-")?.[0] ?? "en";
		languageSelector.textContent = "";
		for(let language in languagesAndNames) {
			languageSelector.appendChild(new Option(languagesAndNames[language], language, false, language == defaultLanguage));
		}
		languageSelector.onEventAndNow("change", () => {
			translatePage(languageSelector.value);
		});
		
		let retranslating = false;
		let bodyObserver = new MutationObserver(mutations => {
			if(retranslating) {
				console.log("mutations observed when retranslating:", mutations); // should never happen!
				return;
			}
			let shouldRetranslate = mutations.find(mutation => mutation.type == "childList" && [...mutation.addedNodes].some(node => node instanceof Element && ([...node.attributes].some(attr => attr.name.startsWith("data-translate")) || node.getAllChildren().some(el => [...el.attributes].some(attr => attr.name.startsWith("data-translate"))))) || mutation.type == "attributes" && mutation.attributeName.startsWith("data-translate") && mutation.target.getAttribute(mutation.attributeName) != mutation.oldValue); // retranslate when an element with a translate dataset attribute or a child with a translate dataset attribute is added, or when a translate dataset attribute is changed
			if(shouldRetranslate) {
				retranslating = true;
				translatePage(languageSelector.value);
				retranslating = false;
			}
		});
		let observerConfig = {
			childList: true,
			subtree: true,
			attributes: true,
			attributeOldValue: true
		};
		bodyObserver.observe(document.body, observerConfig);
		document.body.getAllChildren().filter(el => el.shadowRoot).forEach(el => {
			bodyObserver.observe(el.shadowRoot, observerConfig);
		});
	});
});
window.onEvent("load", () => { // shadow DOMs aren't populated in the DOMContentLoaded event yet
	if(location.search == "?generateEnglishTranslations") {
		translatePage("en", true);
	}
});

async function handleInputFiles(files) {
	let structureFiles = files.filter(file => file.name.endsWith(".mcstructure"));
	let resourcePacks = files.filter(file => file.name.endsWith(".mcpack") || file.name.endsWith(".zip"));
	
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
async function updateTexturePreview() {
	texturePreviewImage ??= await defaultResourcePackStackPromise.then(rps => rps.fetchResource(`textures/blocks/${random(["crafting_table_front", "diamond_ore", "blast_furnace_front_off", "brick", "cherry_planks", "chiseled_copper", "cobblestone", "wool_colored_white", "stonebrick", "stone_granite_smooth"])}.png`)).then(res => res.toImage());
	let can = new OffscreenCanvas(texturePreviewImage.width, texturePreviewImage.height);
	let ctx = can.getContext("2d");
	ctx.drawImage(texturePreviewImage, 0, 0);
	let textureOutlineWidth = +generatePackForm.elements.namedItem("textureOutlineWidth").value;
	let outlinedCan = textureOutlineWidth > 0? TextureAtlas.addTextureOutlines(can, [{
		x: 0,
		y: 0,
		w: can.width,
		h: can.height
	}], HoloPrint.addDefaultConfig({
		TEXTURE_OUTLINE_COLOR: generatePackForm.elements.namedItem("textureOutlineColor").value,
		TEXTURE_OUTLINE_OPACITY: generatePackForm.elements.namedItem("textureOutlineOpacity").value / 100,
		TEXTURE_OUTLINE_WIDTH: textureOutlineWidth
	})) : can;
	let tintlessImage = await outlinedCan.convertToBlob().then(blob => blob.toImage());
	let outlinedCanCtx = outlinedCan.getContext("2d");
	outlinedCanCtx.fillStyle = generatePackForm.elements.namedItem("tintColor").value;
	outlinedCanCtx.globalAlpha = generatePackForm.elements.namedItem("tintOpacity").value / 100;
	outlinedCanCtx.fillRect(0, 0, outlinedCan.width, outlinedCan.height);
	let tintedImage = await outlinedCan.convertToBlob().then(blob => blob.toImage());
	texturePreviewImageCont.textContent = "";
	texturePreviewImageCont.appendChild(tintlessImage);
	texturePreviewImageCont.appendChild(tintedImage);
}
async function translatePage(language, generateTranslations = false) {
	let translatableEls = document.documentElement.getAllChildren().filter(el => [...el.attributes].some(attr => attr.name.startsWith("data-translate")));
	await loadTranslationLanguage(language);
	let translations = generateTranslations? await fetch(`translations/${language}.json`).then(res => res.jsonc()) : {};
	await Promise.all(translatableEls.map(async el => {
		if("translate" in el.dataset) {
			let translationKey = el.dataset["translate"];
			if(generateTranslations) {
				translations[translationKey] = el.innerHTML.replaceAll("<code>", "`").replaceAll("</code>", "`").replaceAll(/<a href="([^"]+)"[^>]*>([^<]+)<\/a>/g, "[$2]($1)");
			} else {
				let translation = translate(translationKey, language);
				if(translation != undefined) {
					el.innerHTML = performTranslationSubstitutions(el, translation);
				} else {
					console.warn(`Couldn't find translation for ${translationKey} for language ${language}!`);
					if(el.innerHTML == "") {
						let englishTranslation = translate(translationKey, "en");
						if(englishTranslation) {
							el.innerHTML = performTranslationSubstitutions(el, englishTranslation);
						} else {
							el.innerHTML = translationKey;
						}
					}
				}
			}
		}
		[...el.attributes].filter(attr => attr.name.startsWith("data-translate-")).forEach(async attr => {
			let targetAttrName = attr.name.replace(/^data-translate-/, "");
			let translationKey = attr.value;
			if(generateTranslations) {
				translations[translationKey] = el.getAttribute(targetAttrName);
			} else {
				let translation = translate(translationKey, language);
				if(translation != undefined) {
					el.setAttribute(targetAttrName, performTranslationSubstitutions(el, translation));
				} else {
					console.warn(`Couldn't find translation for ${translationKey} for language ${language}!`);
					if(!el.hasAttribute(targetAttrName)) {
						let englishTranslation = translate(translationKey, "en");
						if(englishTranslation) {
							el.setAttribute(targetAttrName, performTranslationSubstitutions(el, englishTranslation));
						} else {
							el.setAttribute(targetAttrName, translationKey);
						}
					}
				}
			}
		});
	}));
	if(generateTranslations) {
		translations = Object.fromEntries(Object.entries(translations).sort((a, b) => a[0] > b[0]));
		downloadBlob(new File([JSON.stringify(translations, null, "\t")], `${language}.json`));
	}
}
function performTranslationSubstitutions(el, translation) {
	if("translationSubstitutions" in el.dataset) {
		Object.entries(JSON.parse(el.dataset["translationSubstitutions"])).forEach(([original, substitution]) => {
			translation = translation.replaceAll(original, substitution);
		});
	}
	return translation;
}
function translateCurrentLanguage(translationKey) {
	let translation = translate(translationKey, languageSelector.value);
	if(!translation) {
		translation = translate(translationKey, "en");
		if(translation) {
			console.warn(`Couldn't find translation for ${translationKey} for language ${languageSelector.value}!`);
		} else {
			console.warn(`Couldn't find translation for ${translationKey} for language ${languageSelector.value} or English!`);
			translation = translationKey;
		}
	}
	return translation;
}

async function temporarilyChangeText(el, translationKey, duration = 2000) {
	let originalTranslationKey = el.dataset.translate;
	el.dataset.translate = translationKey;
	el.setAttribute("disabled", "");
	await sleep(duration);
	el.dataset.translate = originalTranslationKey;
	el.removeAttribute("disabled");
}

async function makePack(structureFiles, localResourcePacks) {
	// this is a mess. all it does is get the settings, call HoloPrint.makePack(), and show the download button.
	generatePackFormSubmitButton.disabled = true;
	
	if(IN_PRODUCTION) {
		console.debug("User agent:", navigator.userAgent);
	}
	
	let formData = new FormData(generatePackForm);
	let authors = formData.get("author").split(",").map(x => x.trim()).removeFalsies();
	/** @type {import("./HoloPrint.js").HoloPrintConfig} */
	let config = {
		IGNORED_BLOCKS: formData.get("ignoredBlocks").split(/\W/).removeFalsies(),
		SCALE: formData.get("scale") / 100,
		OPACITY: formData.get("opacity") / 100,
		MULTIPLE_OPACITIES: formData.get("opacityMode") == "multiple",
		TINT_COLOR: formData.get("tintColor"),
		TINT_OPACITY: formData.get("tintOpacity") / 100,
		TEXTURE_OUTLINE_WIDTH: +formData.get("textureOutlineWidth"),
		TEXTURE_OUTLINE_COLOR: formData.get("textureOutlineColor"),
		TEXTURE_OUTLINE_OPACITY: formData.get("textureOutlineOpacity") / 100,
		DO_SPAWN_ANIMATION: formData.get("spawnAnimationEnabled"),
		CONTROLS: Object.fromEntries([...formData].filter(([key]) => key.startsWith("control.")).map(([key, value]) => [key.replace(/^control./, ""), JSON.parse(value)])),
		BACKUP_SLOT_COUNT: +formData.get("backupSlotCount"),
		MATERIAL_LIST_LANGUAGE: formData.get("materialListLanguage"),
		PACK_NAME: formData.get("packName") || undefined,
		PACK_ICON_BLOB: formData.get("packIcon").size? formData.get("packIcon") : undefined,
		AUTHORS: authors,
		DESCRIPTION: formData.get("description") || undefined,
		COMPRESSION_LEVEL: +formData.get("compressionLevel")
	};
	
	let previewCont = document.createElement("div");
	previewCont.classList.add("previewCont");
	completedPacksCont.prepend(previewCont);
	let infoButton = document.createElement("button");
	infoButton.classList.add("packInfoButton"); // my class naming is terrible
	infoButton.dataset.translate = "progress.generating";
	completedPacksCont.prepend(infoButton);
	
	let resourcePackStack = await new ResourcePackStack(localResourcePacks);
	
	let pack;
	logger?.setOriginTime(performance.now());
	
	let generationFailedError;
	if(ACTUAL_CONSOLE_LOG) {
		pack = await HoloPrint.makePack(structureFiles, config, resourcePackStack, previewCont);
	} else {
		try {
			pack = await HoloPrint.makePack(structureFiles, config, resourcePackStack, previewCont);
		} catch(e) {
			console.error(`Pack creation failed!\n${e}`);
			if(!(e instanceof UserError)) {
				generationFailedError = e;
			}
			if(!(e instanceof DOMException)) { // DOMExceptions can also be thrown, which don't have stack traces and hence can't be tracked if caught. HOWEVER they extend Error...
				console.debug(getStackTrace(e).join("\n"));
			}
		}
	}
	
	infoButton.classList.add("finished");
	if(pack) {
		infoButton.dataset.translate = "download";
		infoButton.classList.add("completed");
		let hasLoggedPackCreation = false;
		infoButton.onclick = () => {
			if(!hasLoggedPackCreation && IN_PRODUCTION) {
				supabaseLogger ??= new SupabaseLogger(supabaseProjectUrl, supabaseApiKey);
				supabaseLogger.recordPackCreation(structureFiles);
				hasLoggedPackCreation = true;
			}
			downloadBlob(pack, pack.name);
		};
	} else {
		if(generationFailedError) {
			let bugReportAnchor = document.createElement("a");
			bugReportAnchor.classList.add("buttonlike", "packInfoButton", "reportIssue");
			bugReportAnchor.href = `https://github.com/SuperLlama88888/holoprint/issues/new?template=1-pack-creation-error.yml&title=Pack creation error: ${encodeURIComponent(generationFailedError.toString().replaceAll("\n", " "))}&version=${HoloPrint.VERSION}`;
			bugReportAnchor.target = "_blank";
			bugReportAnchor.dataset.translate = "pack_generation_failed.report_github_issue";
			infoButton.parentNode.replaceChild(bugReportAnchor, infoButton);
		} else {
			infoButton.classList.add("failed");
			infoButton.dataset.translate = "pack_generation_failed";
		}
	}
	
	generatePackFormSubmitButton.disabled = false;
	
	return pack;
}

let itemsDatalistPromise = (new VanillaDataFetcher()).then(async fetcher => {
	let mojangItems = await fetcher.fetch("metadata/vanilladata_modules/mojang-items.json").then(res => res.json());
	let itemNames = mojangItems["data_items"].map(item => item["name"].replace(/^minecraft:/, ""))
	let datalist = document.createElement("datalist");
	datalist.id = "itemNamesDatalist";
	datalist.append(...itemNames.map(itemName => new Option(itemName)));
	return datalist;
});
let itemTagsDatalistPromise = (new CachingFetcher("BedrockData@3.0.0+bedrock-1.21.60", "https://raw.githubusercontent.com/pmmp/BedrockData/refs/tags/3.0.0+bedrock-1.21.60/")).then(async fetcher => {
	let data = await fetcher.fetch("item_tags.json").then(res => res.json());
	let itemTags = Object.keys(data).map(tag => tag.replace(/^minecraft:/, ""));
	let datalist = document.createElement("datalist");
	datalist.id = "itemTagsDatalist";
	datalist.append(...itemTags.map(tag => new Option(tag)));
	return datalist;
});

customElements.define("item-criteria-input", class extends HTMLElement {
	static formAssociated = true;
	static observedAttributes = ["value-items", "value-tags"];
	
	shadowRoot;
	internals;
	
	#connected;
	#tasksPendingConnection;
	
	#criteriaInputsCont;
	
	constructor() {
		super();
		this.shadowRoot = this.attachShadow({
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
			<label for="latestInput" data-translate="item_criteria_input.matching">Matching:</label>
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
			}, translateCurrentLanguage("item_criteria_input.error.empty"));
		} else if(allInputs.some(el => !el.validity.valid)) {
			this.internals.setValidity({
				patternMismatch: true
			}, translateCurrentLanguage("item_criteria_input.error.invalid"));
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
});