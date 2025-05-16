import { extractStructureFilesFromMcworld } from "mcbe-leveldb-reader";
import { selectEl, downloadBlob, sleep, selectEls, loadTranslationLanguage, translate, getStackTrace, random, UserError, joinOr, conditionallyGroup, groupByFileExtension, addFilesToFileInput, setFileInputFiles, dispatchInputEvents } from "./essential.js";
import * as HoloPrint from "./HoloPrint.js";
import SupabaseLogger from "./SupabaseLogger.js";

import ResourcePackStack from "./ResourcePackStack.js";
import LocalResourcePack from "./LocalResourcePack.js";
import TextureAtlas from "./TextureAtlas.js";
import ItemCriteriaInput from "./components/ItemCriteriaInput.js";
import FileInputTable from "./components/FileInputTable.js";
import SimpleLogger from "./components/SimpleLogger.js";

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
let completedPacksCont;
let logger;
let languageSelector;
let defaultResourcePackStackPromise;

let supabaseLogger;

let texturePreviewImageCont;
let texturePreviewImage;

document.onEvent("DOMContentLoaded", () => {
	document.body.appendChild = selectEl("main").appendChild.bind(selectEl("main"));
	
	selectEls(`input[type="file"][accept]:not([multiple])`).forEach(input => {
		input.onEventAndNow("input", e => {
			if(!validateFileInputFileTypes(input)) {
				e?.stopImmediatePropagation();
			}
		});
	});
	
	generatePackForm = selectEl("#generatePackForm");
	dropFileNotice = selectEl("#dropFileNotice");
	structureFilesInput = selectEl("#structureFilesInput");
	let notStructureFileError = selectEl("#notStructureFileError");
	worldFileInput = selectEl("#worldFileInput");
	let worldExtractionMessage = selectEl("#worldExtractionMessage");
	let worldExtractionSuccess = selectEl("#worldExtractionSuccess");
	let worldExtractionError = selectEl("#worldExtractionError");
	let worldExtractionWorldError = selectEl("#worldExtractionWorldError");
	oldPackInput = selectEl("#oldPackInput");
	let oldPackExtractionMessage = selectEl("#oldPackExtractionMessage");
	let oldPackExtractionSuccess = selectEl("#oldPackExtractionSuccess");
	let oldPackExtractionError = selectEl("#oldPackExtractionError");
	structureFilesList = selectEl("#structureFilesList");
	packNameInput = generatePackForm.elements.namedItem("packName");
	packNameInput.onEvent("invalid", () => {
		packNameInput.setCustomValidity(translateCurrentLanguage("metadata.pack_name.error"));
	});
	packNameInput.onEvent("input", () => {
		packNameInput.setCustomValidity("");
	});
	structureFilesInput.onEvent("input", () => {
		if(!structureFilesInput.files.length) {
			return;
		}
		let files = Array.from(structureFilesInput.files);
		let filesToAdd = files.filter(file => file.name.endsWith(".mcstructure"));
		if(files.length == filesToAdd.length) {
			notStructureFileError.classList.add("hidden");
			structureFilesInput.setCustomValidity("");
		} else {
			notStructureFileError.classList.remove("hidden");
			structureFilesInput.setCustomValidity(notStructureFileError.textContent);
		}
		addFilesToFileInput(structureFilesList, filesToAdd);
	});
	worldFileInput.onEvent("input", async () => {
		worldExtractionMessage.classList.add("hidden");
		worldExtractionSuccess.classList.add("hidden");
		worldExtractionError.classList.add("hidden");
		worldExtractionWorldError.classList.add("hidden");
		oldPackInput.setCustomValidity("");
		let worldFile = worldFileInput.files[0];
		if(!worldFile) {
			return;
		}
		selectEl("#extractFromWorldTab").checked = true;
		worldExtractionMessage.classList.remove("hidden");
		worldExtractionMessage.scrollIntoView({
			block: "center"
		});
		let structureFiles;
		try {
			structureFiles = await extractStructureFilesFromMcworld(worldFile);
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
			worldExtractionSuccess.dataset.translationSubCount = structureFiles.size;
			worldExtractionSuccess.classList.remove("hidden");
		} else {
			worldExtractionError.classList.remove("hidden");
			worldFileInput.setCustomValidity(worldExtractionError.textContent);
		}
	});
	oldPackInput.onEvent("input", async () => {
		oldPackExtractionMessage.classList.add("hidden");
		oldPackExtractionSuccess.classList.add("hidden");
		oldPackExtractionError.classList.add("hidden");
		oldPackInput.setCustomValidity("");
		let oldPack = oldPackInput.files[0];
		if(!oldPack) {
			return;
		}
		selectEl("#updatePackTab").checked = true;
		oldPackExtractionMessage.classList.remove("hidden");
		oldPackExtractionMessage.scrollIntoView({
			block: "center"
		});
		let extractedStructureFiles = await HoloPrint.extractStructureFilesFromPack(oldPack);
		oldPackExtractionMessage.classList.add("hidden");
		if(extractedStructureFiles.length) {
			addFilesToFileInput(structureFilesList, extractedStructureFiles);
			oldPackExtractionSuccess.classList.remove("hidden");
		} else {
			oldPackExtractionError.classList.remove("hidden");
			oldPackInput.setCustomValidity(oldPackExtractionError.textContent);
		}
	});
	structureFilesList.onEventAndNow("input", updatePackNameInputPlaceholder);
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
	
	customElements.define("item-criteria-input", class extends ItemCriteriaInput {
		constructor() {
			super(translateCurrentLanguage);
		}
	});
	customElements.define("file-input-table", FileInputTable);
	customElements.define("simple-logger", SimpleLogger);
	if(!ACTUAL_CONSOLE_LOG) {
		logger = selectEl("#log");
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
	
	let descriptionTextArea = generatePackForm.elements.namedItem("description");
	let descriptionLinksCont = selectEl("#descriptionLinksCont");
	descriptionTextArea.onEventAndNow("input", () => {
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
			let [elementsBeingReset, elementsToSave] = conditionallyGroup(Array.from(generatePackForm.elements), el => el.localName != "fieldset" && el.localName != "button" && (!fieldset.contains(el) || !el.hasAttribute("name")));
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
			elementsBeingReset.forEach(el => {
				dispatchInputEvents(el);
			});
			temporarilyChangeText(el, el.dataset.resetTranslation);
		});
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
		}) ?? "en_US";
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
			let shouldRetranslate = mutations.find(mutation => mutation.type == "childList" && [...mutation.addedNodes].some(node => node instanceof Element && ([...node.attributes].some(attr => attr.name.startsWith("data-translate") || attr.name.startsWith("data-translation-sub-")) || node.getAllChildren().some(el => [...el.attributes].some(attr => attr.name.startsWith("data-translate") || attr.name.startsWith("data-translation-sub-"))))) || mutation.type == "attributes" && (mutation.attributeName.startsWith("data-translate") || mutation.attributeName.startsWith("data-translation-sub-")) && mutation.target.getAttribute(mutation.attributeName) != mutation.oldValue); // retranslate when an element with a translate dataset attribute or a child with a translate dataset attribute is added, or when a translate dataset attribute is changed
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
		translatePage("en_US", true);
	}
});

/**
 * Handles files that are dropped on the webpage or opened with the PWA.
 * @param {Array<File>} files
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
	packNameInput.setAttribute("placeholder", HoloPrint.getDefaultPackName([...structureFilesList.files]));
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
		translations = Object.fromEntries(Object.entries(translations).sort((a, b) => a[0] > b[0]));
		downloadBlob(new File([JSON.stringify(translations, null, "\t")], `${language}.json`));
	}
}
/**
 * @param {Element} el
 * @param {String} translation
 * @returns {String}
 */
function performTranslationSubstitutions(el, translation) {
	const prefix = "data-translation-sub-";
	Array.from(el.attributes).forEach(({ name, value }) => {
		if(name.startsWith(prefix)) {
			let subName = name.slice(prefix.length).toUpperCase().replaceAll("-", "_");
			translation = translation.replaceAll(`{${subName}}`, value);
			if(parseInt(value) == value) {
				translation = value > 1? translation.replace(/\[|\]/g, "") : translation.replaceAll(/\[.+\]/g, "");
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
 * @returns {Boolean}
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
 * @param {Array<File>} structureFiles
 * @param {Array<LocalResourcePack>} localResourcePacks
 * @returns {Promise<void>}
 */
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
		MINI_SCALE: +formData.get("miniSize"),
		TEXTURE_OUTLINE_WIDTH: +formData.get("textureOutlineWidth"),
		TEXTURE_OUTLINE_COLOR: formData.get("textureOutlineColor"),
		TEXTURE_OUTLINE_OPACITY: formData.get("textureOutlineOpacity") / 100,
		SPAWN_ANIMATION_ENABLED: !!formData.get("spawnAnimationEnabled"),
		PLAYER_CONTROLS_ENABLED: !!formData.get("playerControlsEnabled"),
		MATERIAL_LIST_ENABLED: !!formData.get("materialListEnabled"),
		RETEXTURE_CONTROL_ITEMS: !!formData.get("retextureControlItems"),
		RENAME_CONTROL_ITEMS: !!formData.get("renameControlItems"),
		CONTROLS: Object.fromEntries([...formData].filter(([key]) => key.startsWith("control.")).map(([key, value]) => [key.replace(/^control./, ""), JSON.parse(value)])),
		INITIAL_OFFSET: [+formData.get("initialOffsetX"), +formData.get("initialOffsetY"), +formData.get("initialOffsetZ")],
		BACKUP_SLOT_COUNT: +formData.get("backupSlotCount"),
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
			bugReportAnchor.href = `https://github.com/SuperLlama88888/holoprint/issues/new?template=1-pack-creation-error.yml&title=Pack creation error: ${encodeURIComponent(generationFailedError.toString().replaceAll("\n", " "))}&version=${HoloPrint.VERSION}&logs=${encodeURIComponent(JSON.stringify(selectEl("simple-logger").allLogs))}`;
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