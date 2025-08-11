import { extractStructureFilesFromMcworld } from "mcbe-leveldb-reader";
import { selectEl, downloadFile, sleep, selectEls, loadTranslationLanguage, translate, getStackTrace, random, UserError, joinOr, conditionallyGroup, groupByFileExtension, addFilesToFileInput, setFileInputFiles, dispatchInputEvents, getAllChildren, jsonc, toImage, removeFalsies, clearCacheStorage, onEvent, onEventAndNow, cast, clearFileInput, html, removeFileExtension } from "./utils.js";
import * as HoloPrint from "./HoloPrint.js";
import SupabaseLogger from "./SupabaseLogger.js";

import ResourcePackStack from "./ResourcePackStack.js";
import LocalResourcePack from "./LocalResourcePack.js";
import TextureAtlas from "./TextureAtlas.js";
import ItemCriteriaInput from "./components/ItemCriteriaInput.js";
import FileInputTable from "./components/FileInputTable.js";
import Vec3Input from "./components/Vec3Input.js";
import SimpleLogger from "./components/SimpleLogger.js";
import LilGui from "./components/LilGui.js";
import ResizingInput from "./components/ResizingInput.js";

const IN_PRODUCTION = false;
const ACTUAL_CONSOLE_LOG = false;

const supabaseProjectUrl = "https://gnzyfffwvulwxbczqpgl.supabase.co";
const supabaseApiKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImduenlmZmZ3dnVsd3hiY3pxcGdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjMwMjE3NzgsImV4cCI6MjAzODU5Nzc3OH0.AWMhFcP3PiMD3dMC_SeIVuPx128KVpgfkZ5qBStDuVw";

let dropFileNotice;

/** @type {HTMLFormElement} */
let generatePackForm;
let generatePackFormSubmitButton;
/** @type {HTMLInputElement} */
let structureFilesInput;
/** @type {HTMLInputElement} */
let worldFileInput;
/** @type {HTMLInputElement} */
let oldPackInput;
/** @type {HTMLInputElement} */
let structureFilesList;
let packNameInput;
/** @type {Element} */
let coordinateLockStructureCoordsCont;
/** @type {WeakMap<File, Vec3>} */
let coordinateLockStructureCoords = new WeakMap();
let completedPacksCont;
/** @type {SimpleLogger} */
let logger;
let languageSelector;
let defaultResourcePackStackPromise;

let supabaseLogger;

let texturePreviewImageCont;
let texturePreviewImage;

document[onEvent]("DOMContentLoaded", () => {
	document.body.appendChild = selectEl("main").appendChild.bind(selectEl("main"));
	
	selectEls(`input[type="file"][accept]:not([multiple])`).forEach(input => {
		input[onEventAndNow]("input", e => {
			if(!validateFileInputFileTypes(cast(input, HTMLInputElement))) {
				e?.stopImmediatePropagation();
			}
		});
	});
	
	generatePackForm = cast(selectEl("#generatePackForm"), HTMLFormElement);
	dropFileNotice = selectEl("#dropFileNotice");
	structureFilesInput = cast(selectEl("#structureFilesInput"), HTMLInputElement);
	let notStructureFileError = selectEl("#notStructureFileError");
	worldFileInput = cast(selectEl("#worldFileInput"), HTMLInputElement);
	let worldExtractionMessage = selectEl("#worldExtractionMessage");
	let worldExtractionSuccess = cast(selectEl("#worldExtractionSuccess"), HTMLSpanElement);
	let worldExtractionError = selectEl("#worldExtractionError");
	let worldExtractionWorldError = cast(selectEl("#worldExtractionWorldError"), HTMLSpanElement);
	oldPackInput = cast(selectEl("#oldPackInput"), HTMLInputElement);
	let oldPackExtractionMessage = selectEl("#oldPackExtractionMessage");
	let oldPackExtractionSuccess = selectEl("#oldPackExtractionSuccess");
	let oldPackExtractionError = selectEl("#oldPackExtractionError");
	structureFilesList = cast(selectEl("#structureFilesList"), HTMLInputElement);
	packNameInput = generatePackForm.elements.namedItem("packName");
	packNameInput[onEvent]("invalid", () => {
		packNameInput.setCustomValidity(translateCurrentLanguage("metadata.pack_name.error"));
	});
	packNameInput[onEvent]("input", () => {
		packNameInput.setCustomValidity("");
	});
	structureFilesInput[onEventAndNow]("input", () => {
		if(!structureFilesInput.files.length) {
			return;
		}
		let files = Array.from(structureFilesInput.files);
		let filesToAdd = files.filter(file => file.name.endsWith(".mcstructure"));
		if(files.length == filesToAdd.length) {
			notStructureFileError.classList.add("hidden");
			structureFilesInput.setCustomValidity("");
		} else {
			if(files.length == 1) { // the other input methods can't handle multiple files
				if(files[0].name.endsWith(".mcworld") || files[0].name.endsWith(".zip")) {
					clearFileInput(structureFilesInput);
					setFileInputFiles(worldFileInput, files);
					return;
				} else if(files[0].name.endsWith(".mcpack")) {
					clearFileInput(structureFilesInput);
					setFileInputFiles(oldPackInput, files);
					return;
				}
			}
			notStructureFileError.classList.remove("hidden");
			structureFilesInput.setCustomValidity(notStructureFileError.textContent);
		}
		addFilesToFileInput(structureFilesList, filesToAdd);
	});
	worldFileInput[onEvent]("input", async () => {
		worldExtractionMessage.classList.add("hidden");
		worldExtractionSuccess.classList.add("hidden");
		worldExtractionError.classList.add("hidden");
		worldExtractionWorldError.classList.add("hidden");
		oldPackInput.setCustomValidity("");
		let worldFile = worldFileInput.files[0];
		if(!worldFile) {
			return;
		}
		cast(selectEl("#extractFromWorldTab"), HTMLInputElement).checked = true;
		worldExtractionMessage.classList.remove("hidden");
		worldExtractionMessage.scrollIntoView({
			block: "center"
		});
		let structureFiles;
		try {
			structureFiles = await extractStructureFilesFromMcworld(worldFile);
			structureFiles.forEach(file => file[FileInputTable.SHOW_DOWNLOAD_BUTTON] = true);
		} catch(e) {
			worldExtractionMessage.classList.add("hidden");
			worldExtractionWorldError.dataset.translationSubError = e;
			worldExtractionWorldError.classList.remove("hidden");
			worldFileInput.setCustomValidity(worldExtractionWorldError.textContent);
			return;
		}
		worldExtractionMessage.classList.add("hidden");
		if(structureFiles.size) {
			addFilesToFileInput(structureFilesList, Array.from(structureFiles.values()));
			worldExtractionSuccess.dataset.translationSubCount = structureFiles.size.toString();
			worldExtractionSuccess.classList.remove("hidden");
		} else {
			worldExtractionError.classList.remove("hidden");
			worldFileInput.setCustomValidity(worldExtractionError.textContent);
		}
	});
	oldPackInput[onEvent]("input", async () => {
		oldPackExtractionMessage.classList.add("hidden");
		oldPackExtractionSuccess.classList.add("hidden");
		oldPackExtractionError.classList.add("hidden");
		oldPackInput.setCustomValidity("");
		let oldPack = oldPackInput.files[0];
		if(!oldPack) {
			return;
		}
		cast(selectEl("#updatePackTab"), HTMLInputElement).checked = true;
		oldPackExtractionMessage.classList.remove("hidden");
		oldPackExtractionMessage.scrollIntoView({
			block: "center"
		});
		let extractedStructureFiles = await HoloPrint.extractStructureFilesFromPack(oldPack);
		extractedStructureFiles.forEach(file => file[FileInputTable.SHOW_DOWNLOAD_BUTTON] = true);
		oldPackExtractionMessage.classList.add("hidden");
		if(extractedStructureFiles.length) {
			addFilesToFileInput(structureFilesList, extractedStructureFiles);
			oldPackExtractionSuccess.classList.remove("hidden");
		} else {
			oldPackExtractionError.classList.remove("hidden");
			oldPackInput.setCustomValidity(oldPackExtractionError.textContent);
		}
	});
	structureFilesList[onEventAndNow]("input", updatePackNameInputPlaceholder);
	completedPacksCont = selectEl("#completedPacksCont");
	texturePreviewImageCont = selectEl("#texturePreviewImageCont");
	defaultResourcePackStackPromise = ResourcePackStack.new();
	
	if(location.search == "?loadFile") {
		window.launchQueue?.setConsumer(async launchParams => {
			let launchFiles = await Promise.all(launchParams.files.map(fileHandle => fileHandle.getFile()));
			handleInputFiles(launchFiles);
		});
	}
	
	let dragCounter = 0;
	document.documentElement[onEvent]("dragenter", () => {
		dragCounter++;
	});
	document.documentElement[onEvent]("dragover", e => {
		if(e.dataTransfer?.types?.includes("Files")) { // https://html.spec.whatwg.org/multipage/dnd.html#dom-datatransfer-types-dev
			e.preventDefault();
			dropFileNotice.classList.remove("hidden");
		}
	});
	document.documentElement[onEvent]("dragleave", () => {
		dragCounter--;
		if(dragCounter == 0) {
			dropFileNotice.classList.add("hidden");
		}
	});
	document.documentElement[onEvent]("drop", async e => {
		e.preventDefault();
		dragCounter = 0;
		dropFileNotice.classList.add("hidden");
		let files = Array.from(e.dataTransfer.files); // apparently this is a "historical accident": https://stackoverflow.com/a/74641156
		handleInputFiles(files);
	});
	
	customElements.define("item-criteria-input", class extends ItemCriteriaInput {
		constructor() {
			super(translateCurrentLanguage);
		}
	});
	customElements.define("file-input-table", FileInputTable);
	customElements.define("resizing-input", ResizingInput, {
		extends: "input"
	});
	customElements.define("vec-3-input", Vec3Input);
	customElements.define("simple-logger", SimpleLogger);
	customElements.define("lil-gui", LilGui);
	if(!ACTUAL_CONSOLE_LOG) {
		logger = cast(selectEl("#log"), SimpleLogger);
		logger.patchConsoleMethods();
	}
	
	generatePackForm[onEvent]("submit", async e => {
		e.preventDefault();
		
		let formData = new FormData(generatePackForm);
		let resourcePacks = [];
		let localResourcePackFiles = cast(generatePackForm.elements.namedItem("localResourcePack"), HTMLInputElement).files;
		if(localResourcePackFiles.length) {
			resourcePacks.push(await LocalResourcePack.new(localResourcePackFiles));
		}
		makePack(cast(formData.getAll("structureFiles"), [File]), resourcePacks);
	});
	generatePackForm[onEvent]("input", e => {
		let target = cast(e.target, HTMLElement);
		if(target.closest("fieldset")?.classList?.contains("textureSettings") && target.hasAttribute("name")) {
			updateTexturePreview();
		}
	});
	updateTexturePreview();
	generatePackFormSubmitButton = generatePackForm.elements.namedItem("submit");
	
	let coordinateLockToggle = cast(generatePackForm.elements.namedItem("coordinateLockEnabled"), HTMLInputElement);
	let coordinateLockCoordsCont = selectEl("#coordinateLockCoordsCont");
	coordinateLockToggle[onEvent]("input", async () => {
		cast(generatePackForm.elements.namedItem("initialOffset"), Element).parentElement.classList.toggle("hidden", coordinateLockToggle.checked);
		coordinateLockCoordsCont.classList.toggle("hidden", !coordinateLockToggle.checked);
	});
	Array.from(coordinateLockCoordsCont[selectEls]("button")).forEach((button, i) => {
		button[onEvent]("click", async () => {
			if(i == 0) { // get global coordinates button
				let structureFiles = Array.from(structureFilesList.files);
				let mcstructures = await Promise.all(structureFiles.map(HoloPrint.readStructureNBT));
				let worldOrigins = mcstructures.map(mcstructure => mcstructure["structure_world_origin"]);
				let inputs = coordinateLockCoordsCont[selectEls]("vec-3-input");
				worldOrigins.forEach((worldOrigin, i) => {
					inputs[i].xyz = worldOrigin;
				});
			} else {
				let axis = cast(generatePackForm.elements.namedItem("axis"), RadioNodeList).value.toLowerCase();
				coordinateLockCoordsCont[selectEls]("vec-3-input").forEach(vec3input => {
					vec3input[axis] = vec3input[axis] + parseInt(button.innerText);
				});
			}
		});
	});
	coordinateLockStructureCoordsCont = selectEl("#coordinateLockStructureCoords");
	structureFilesList[onEventAndNow]("input", () => {
		coordinateLockStructureCoordsCont.innerHTML = Array.from(structureFilesList.files).map(file => {
			let pos = coordinateLockStructureCoords.get(file) ?? [0, 0, 0];
			let randomId = Math.random();
			return html`
				<label for="${randomId}">${removeFileExtension(file.name)}:</label>
				<vec-3-input id="${randomId}">
					<input is="resizing-input" type="number" min="-10000000" max="10000000" step="1" value="${pos[0]}" placeholder="0" slot="x"/>
					<input is="resizing-input" type="number" min="-10000000" max="10000000" step="1" value="${pos[1]}" placeholder="0" slot="y"/>
					<input is="resizing-input" type="number" min="-10000000" max="10000000" step="1" value="${pos[2]}" placeholder="0" slot="z"/>
				</vec-3-input>
			`;
		}).join("");
		Array.from(coordinateLockStructureCoordsCont[selectEls]("vec-3-input")).forEach((input, i) => {
			input[onEvent]("input", () => {
				let file = structureFilesList.files[i];
				if(!file) return;
				coordinateLockStructureCoords.set(file, input.xyz);
			});
		});
	});
	
	let opacityModeSelect = cast(generatePackForm.elements.namedItem("opacityMode"), HTMLSelectElement);
	opacityModeSelect[onEventAndNow]("change", () => {
		cast(generatePackForm.elements.namedItem("opacity"), Element).parentElement.classList.toggle("hidden", opacityModeSelect.value == "multiple");
	});
	
	let descriptionTextArea = cast(generatePackForm.elements.namedItem("description"), HTMLTextAreaElement);
	let descriptionLinksCont = selectEl("#descriptionLinksCont");
	descriptionTextArea[onEventAndNow]("input", () => {
		let links = HoloPrint.findLinksInDescription(descriptionTextArea.value);
		descriptionLinksCont.textContent = "";
		links.forEach(([_, link], i) => {
			if(i) {
				descriptionLinksCont.appendChild(document.createElement("br"));
			}
			descriptionLinksCont.insertAdjacentHTML("beforeend", `<span data-translate="metadata.description.link_found">Link found:</span>`);
			descriptionLinksCont.insertAdjacentText("beforeend", " " + link);
		});
	});
	
	let playerControlsInputCont = selectEl("#playerControlsInputCont");
	Object.entries(HoloPrint.DEFAULT_PLAYER_CONTROLS).forEach(([control, itemCriteria]) => {
		let label = document.createElement("label");
		let playerControlTranslationKey = HoloPrint.PLAYER_CONTROL_NAMES[control];
		label.innerHTML = `<span data-translate="${playerControlTranslationKey}">...</span>:`;
		let input = cast(document.createElement("item-criteria-input"), ItemCriteriaInput);
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
	
	let clearResourcePackCacheButton = cast(selectEl("#clearResourcePackCacheButton"), HTMLButtonElement);
	clearResourcePackCacheButton[onEvent]("click", async () => {
		clearCacheStorage(caches);
		temporarilyChangeText(clearResourcePackCacheButton, clearResourcePackCacheButton.dataset.resetTranslation);
	});
	
	selectEls(".resetButton").forEach(el => {
		el[onEvent]("click", () => {
			let fieldset = el.parentElement;
			let allEls = cast(Array.from(generatePackForm.elements), [HTMLInputElement]);
			let [elementsBeingReset, elementsToSave] = conditionallyGroup(allEls, el => el.localName != "fieldset" && el.localName != "button" && (!fieldset.contains(el) || !el.hasAttribute("name")));
			let oldFiles = elementsToSave.map(el => {
				if(el.type == "file") {
					let dataTransfer = new DataTransfer(); // Simply copying el.files wouldn't work since that's a FormData object, and resetting the form will reset the files in there as well. To work around this, we just copy all files to a DataTransfer, which is the only other thing that uses FormData. (Using structuredClone() is laggy on Chrome.)
					Array.from(el.files).forEach(file => dataTransfer.items.add(file));
					return dataTransfer.files;
				}
			});
			let oldChecks = elementsToSave.map(el => {
				if(el.type == "checkbox") {
					return el.checked;
				}
			});
			let oldValues = elementsToSave.map(el => {
				if(el.type != "file" && el.type != "checkbox") {
					return el.value;
				}
			});
			generatePackForm.reset(); // this resets the entire form, which is why the old values must be saved
			elementsToSave.forEach((el, i) => {
				switch(el.type) {
					case "file": {
						el.files = oldFiles[i];
					} break;
					case "checkbox": {
						el.checked = oldChecks[i];
					} break;
					default: {
						el.value = oldValues[i];
					}
				}
			});
			elementsBeingReset.forEach(el => {
				dispatchInputEvents(el);
			});
			temporarilyChangeText(el, cast(el, HTMLButtonElement).dataset.resetTranslation);
		});
	});
	
	languageSelector = selectEl("#languageSelector");
	fetch("translations/languages.json").then(res => jsonc(res)).then(languagesAndNames => {
		languagesAndNames = Object.fromEntries(Object.entries(languagesAndNames).sort((a, b) => +(a[1] > b[1]))); // sort alphabeticallly
		let availableLanguages = Object.keys(languagesAndNames);
		if(availableLanguages.length == 1) {
			selectEl("#languageSelectorCont").remove();
			return;
		}
		let defaultLanguage = navigator.languages.find(navigatorLanguage => {
			let navigatorBaseLanguage = navigatorLanguage.split("-")[0];
			return availableLanguages.find(availableLanguage => availableLanguage == navigatorLanguage) ?? availableLanguages.find(availableLanguage => availableLanguage == navigatorBaseLanguage) ?? availableLanguages.find(availableLanguage => availableLanguage.split(/-|_/)[0] == navigatorBaseLanguage);
		}) ?? "en_US";
		languageSelector.textContent = "";
		for(let language in languagesAndNames) {
			languageSelector.appendChild(new Option(languagesAndNames[language], language, false, language == defaultLanguage));
		}
		languageSelector[onEventAndNow]("change", () => {
			translatePage(languageSelector.value);
		});
		
		let retranslating = false;
		let bodyObserver = new MutationObserver(mutations => {
			if(retranslating) {
				console.log("mutations observed when retranslating:", mutations); // should never happen!
				return;
			}
			let allAddedChildren = mutations.flatMap(mutation => Array.from(mutation.addedNodes)).filter(node => node instanceof Element);
			// @ts-ignore
			let shouldRetranslate = allAddedChildren.some(node => Array.from(node.attributes).some(attr => attr.name.startsWith("data-translate") || attr.name.startsWith("data-translation-sub-")) || getAllChildren(node).some(el => Array.from(el.attributes).some(attr => attr.name.startsWith("data-translate") || attr.name.startsWith("data-translation-sub-")))) || mutations.find(mutation => mutation.type == "attributes" && (mutation.attributeName.startsWith("data-translate") || mutation.attributeName.startsWith("data-translation-sub-")) && mutation.target.getAttribute(mutation.attributeName) != mutation.oldValue); // retranslate when an element with a translate dataset attribute or a child with a translate dataset attribute is added, or when a translate dataset attribute is changed
			if(shouldRetranslate) {
				retranslating = true;
				translatePage(languageSelector.value);
				retranslating = false;
			}
			let newShadowRoots = removeFalsies(allAddedChildren.map(node => node.shadowRoot));
			newShadowRoots.forEach(shadowRoot => {
				bodyObserver.observe(shadowRoot, observerConfig);
			});
		});
		let observerConfig = {
			childList: true,
			subtree: true,
			attributes: true,
			attributeOldValue: true
		};
		bodyObserver.observe(document.body, observerConfig);
		getAllChildren(document.body).filter(el => el.shadowRoot).forEach(el => {
			bodyObserver.observe(el.shadowRoot, observerConfig);
		});
	});
});
window[onEvent]("load", () => { // shadow DOMs aren't populated in the DOMContentLoaded event yet
	if(location.search == "?generateEnglishTranslations") {
		translatePage("en_US", true);
	}
});

/**
 * Handles files that are dropped on the webpage or opened with the PWA.
 * @param {File[]} files
 */
async function handleInputFiles(files) {
	let {
		"mcstructure": structureFiles = [],
		"mcworld": worldFiles = [],
		"zip": zipFiles = [],
		"mcpack": resourcePackFiles = []
	} = groupByFileExtension(files);
	let allWorldFiles = [...worldFiles, ...zipFiles];
	
	addFilesToFileInput(structureFilesList, structureFiles);
	setFileInputFiles(worldFileInput, allWorldFiles.slice(0, 1)); // yes I could make it do all of them, but seriously, how many people are drag-and-dropping more than 1 world file onto the page?
	setFileInputFiles(oldPackInput, resourcePackFiles.slice(0, 1));
}
function updatePackNameInputPlaceholder() {
	packNameInput.setAttribute("placeholder", HoloPrint.getDefaultPackName(Array.from(structureFilesList.files)));
}
async function updateTexturePreview() {
	texturePreviewImage ??= await defaultResourcePackStackPromise.then(rps => rps.fetchResource(`textures/blocks/${random(["crafting_table_front", "diamond_ore", "blast_furnace_front_off", "brick", "cherry_planks", "chiseled_copper", "cobblestone", "wool_colored_white", "stonebrick", "stone_granite_smooth"])}.png`)).then(res => toImage(res));
	let can = new OffscreenCanvas(texturePreviewImage.width, texturePreviewImage.height);
	let ctx = can.getContext("2d");
	ctx.drawImage(texturePreviewImage, 0, 0);
	let textureOutlineWidth = +cast(generatePackForm.elements.namedItem("textureOutlineWidth"), HTMLInputElement).value;
	let outlinedCan = textureOutlineWidth > 0? TextureAtlas.addTextureOutlines(can, [{
		x: 0,
		y: 0,
		w: can.width,
		h: can.height
	}], HoloPrint.addDefaultConfig({
		TEXTURE_OUTLINE_COLOR: cast(generatePackForm.elements.namedItem("textureOutlineColor"), HTMLInputElement).value,
		TEXTURE_OUTLINE_OPACITY: +cast(generatePackForm.elements.namedItem("textureOutlineOpacity"), HTMLInputElement).value / 100,
		TEXTURE_OUTLINE_WIDTH: textureOutlineWidth
	})) : can;
	let tintlessImage = await outlinedCan.convertToBlob().then(blob => toImage(blob));
	let outlinedCanCtx = outlinedCan.getContext("2d");
	outlinedCanCtx.fillStyle = cast(generatePackForm.elements.namedItem("tintColor"), HTMLInputElement).value;
	outlinedCanCtx.globalAlpha = +cast(generatePackForm.elements.namedItem("tintOpacity"), HTMLInputElement).value / 100;
	outlinedCanCtx.fillRect(0, 0, outlinedCan.width, outlinedCan.height);
	let tintedImage = await outlinedCan.convertToBlob().then(blob => toImage(blob));
	texturePreviewImageCont.textContent = "";
	texturePreviewImageCont.appendChild(tintlessImage);
	texturePreviewImageCont.appendChild(tintedImage);
}
async function translatePage(language, generateTranslations = false) {
	let translatableEls = getAllChildren(document.documentElement).filter(el => Array.from(el.attributes).some(attr => attr.name.startsWith("data-translate")));
	await loadTranslationLanguage(language);
	let translations = generateTranslations? await fetch(`translations/${language}.json`).then(res => jsonc(res)) : {};
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
						let englishTranslation = translate(translationKey, "en_US");
						if(englishTranslation) {
							el.innerHTML = performTranslationSubstitutions(el, englishTranslation);
						} else {
							el.innerHTML = translationKey;
						}
					}
				}
			}
		}
		Array.from(el.attributes).filter(attr => attr.name.startsWith("data-translate-")).forEach(async attr => {
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
						let englishTranslation = translate(translationKey, "en_US");
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
		translations = Object.fromEntries(Object.entries(translations).sort((a, b) => +(a[0] > b[0])));
		downloadFile(new File([JSON.stringify(translations, null, "\t")], `${language}.json`));
	}
}
/**
 * @param {Element} el
 * @param {string} translation
 * @returns {string}
 */
function performTranslationSubstitutions(el, translation) {
	const prefix = "data-translation-sub-";
	Array.from(el.attributes).forEach(({ name, value }) => {
		if(name.startsWith(prefix)) {
			let subName = name.slice(prefix.length).toUpperCase().replaceAll("-", "_");
			translation = translation.replaceAll(`{${subName}}`, value);
			if(parseInt(value) == +value) {
				translation = +value > 1? translation.replace(/\[|\]/g, "") : translation.replaceAll(/\[.+\]/g, "");
			}
		}
	});
	return translation;
}
function translateCurrentLanguage(translationKey) {
	if(!languageSelector) {
		return undefined;
	}
	let translation = translate(translationKey, languageSelector.value);
	if(!translation) {
		translation = translate(translationKey, "en_US");
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
/**
 * Validates a file input based on the value of the `accept` attribute. Only works when `accept` is a comma-separated list of file extensions, not for MIME types.
 * @param {HTMLInputElement} fileInput
 * @returns {boolean}
 */
function validateFileInputFileTypes(fileInput) {
	let acceptableFileExtensions = fileInput.accept.split(",");
	let valid = Array.from(fileInput.files).every(file => acceptableFileExtensions.some(fileExtension => file.name.endsWith(fileExtension)));
	if(valid) {
		fileInput.setCustomValidity("");
	} else {
		if(languageSelector) {
			fileInput.setCustomValidity(translateCurrentLanguage("upload.error.wrong_file_type").replace("{FILE_TYPE}", joinOr(acceptableFileExtensions, languageSelector.value)));
		} else {
			fileInput.setCustomValidity(`Please upload only ${joinOr(acceptableFileExtensions)} files.`);
		}
	}
	return valid;
}

/**
 * @param {File[]} structureFiles
 * @param {LocalResourcePack[]} localResourcePacks
 * @returns {Promise<void>}
 */
async function makePack(structureFiles, localResourcePacks) {
	// this is a mess. all it does is get the settings, call HoloPrint.makePack(), and show the download button.
	generatePackFormSubmitButton.disabled = true;
	
	if(IN_PRODUCTION) {
		console.debug("User agent:", navigator.userAgent);
	}
	
	let formData = new FormData(generatePackForm);
	let authors = removeFalsies(formData.get("author").toString().split(",").map(x => x.trim()));
	let packIconEntry = formData.get("packIcon");
	/** @type {HoloPrintConfig} */
	let config = {
		IGNORED_BLOCKS: removeFalsies(formData.get("ignoredBlocks").toString().split(/\W/)),
		SCALE: +formData.get("scale") / 100,
		OPACITY: +formData.get("opacity") / 100,
		MULTIPLE_OPACITIES: formData.get("opacityMode") == "multiple",
		TINT_COLOR: formData.get("tintColor").toString(),
		TINT_OPACITY: +formData.get("tintOpacity") / 100,
		MINI_SCALE: +formData.get("miniSize"),
		TEXTURE_OUTLINE_WIDTH: +formData.get("textureOutlineWidth"),
		TEXTURE_OUTLINE_COLOR: formData.get("textureOutlineColor").toString(),
		TEXTURE_OUTLINE_OPACITY: +formData.get("textureOutlineOpacity") / 100,
		SPAWN_ANIMATION_ENABLED: !!formData.get("spawnAnimationEnabled"),
		PLAYER_CONTROLS_ENABLED: !!formData.get("playerControlsEnabled"),
		MATERIAL_LIST_ENABLED: !!formData.get("materialListEnabled"),
		RETEXTURE_CONTROL_ITEMS: !!formData.get("retextureControlItems"),
		CONTROL_ITEM_TEXTURE_SCALE: +formData.get("controlItemTextureScale"),
		RENAME_CONTROL_ITEMS: !!formData.get("renameControlItems"),
		// @ts-ignore
		CONTROLS: Object.fromEntries(Array.from(formData).filter(([key]) => key.startsWith("control.")).map(([key, value]) => [key.replace(/^control./, ""), JSON.parse(value)])),
		// @ts-expect-error
		INITIAL_OFFSET: formData.get("initialOffset").toString().split(",").map(x => +x),
		COORDINATE_LOCK: formData.get("coordinateLockEnabled")? Array.from(coordinateLockStructureCoordsCont[selectEls]("vec-3-input")).map(input => input.xyz) : undefined,
		BACKUP_SLOT_COUNT: +formData.get("backupSlotCount"),
		PACK_NAME: formData.get("packName").toString() || undefined,
		PACK_ICON_BLOB: packIconEntry instanceof File && packIconEntry.size? packIconEntry : undefined,
		AUTHORS: authors,
		DESCRIPTION: formData.get("description").toString() || undefined,
		COMPRESSION_LEVEL: +formData.get("compressionLevel")
	};
	
	let previewCont = document.createElement("div");
	previewCont.classList.add("previewCont");
	completedPacksCont.prepend(previewCont);
	let infoButton = document.createElement("button");
	infoButton.classList.add("packInfoButton"); // my class naming is terrible
	infoButton.dataset.translate = "progress.generating";
	completedPacksCont.prepend(infoButton);
	
	let resourcePackStack = await ResourcePackStack.new(localResourcePacks);
	
	let pack;
	logger?.setOriginTime(performance.now());
	
	let generationFailedError; // generation failed or generational failure?
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
				hasLoggedPackCreation = true;
				void async function() {
					supabaseLogger ??= await SupabaseLogger.new(supabaseProjectUrl, supabaseApiKey);
					try {
						await supabaseLogger.recordPackCreation(structureFiles);
					} catch(e) {
						console.error(e);
					}
				}();
			}
			downloadFile(pack, pack.name);
		};
	} else {
		if(generationFailedError) {
			let bugReportAnchor = document.createElement("a");
			bugReportAnchor.classList.add("buttonlike", "packInfoButton", "reportIssue");
			bugReportAnchor.href = `https://github.com/SuperLlama88888/holoprint/issues/new?template=1-pack-creation-error.yml&title=Pack creation error: ${encodeURIComponent(generationFailedError.toString().replaceAll("\n", " "))}&version=${HoloPrint.VERSION}&logs=${encodeURIComponent(JSON.stringify(logger.allLogs))}`;
			bugReportAnchor.target = "_blank";
			bugReportAnchor.dataset.translate = "pack_generation_failed.report_github_issue";
			infoButton.parentNode.replaceChild(bugReportAnchor, infoButton);
		} else {
			infoButton.classList.add("failed");
			infoButton.dataset.translate = "pack_generation_failed";
		}
	}
	
	generatePackFormSubmitButton.disabled = false;
}

/** @import { HoloPrintConfig, Vec3 } from "./HoloPrint.js" */