import { selectEl, downloadBlob, sleep, selectEls } from "./essential.js";
import * as HoloPrint from "./HoloPrint.js";
import SimpleLogger from "./SimpleLogger.js";
import SupabaseLogger from "./SupabaseLogger.js";

import ResourcePackStack from "./ResourcePackStack.js";
import LocalResourcePack from "./LocalResourcePack.js";

const IN_PRODUCTION = location.host.includes(".github.io"); // hosted on GitHub Pages
const ACTUAL_CONSOLE_LOG = false;

const supabaseProjectUrl = "https://gnzyfffwvulwxbczqpgl.supabase.co";
const supabaseApiKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImduenlmZmZ3dnVsd3hiY3pxcGdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjMwMjE3NzgsImV4cCI6MjAzODU5Nzc3OH0.AWMhFcP3PiMD3dMC_SeIVuPx128KVpgfkZ5qBStDuVw";

window.OffscreenCanvas ?? class OffscreenCanvas {
	constructor(w, h) {
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
		let structureFile = await HoloPrint.extractStructureFileFromPack(resourcePack);
		if(structureFile) {
			structureFiles.push(structureFile);
		}
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

	let downloadButton = document.createElement("button");
	downloadButton.classList.add("importantButton");
	downloadButton.innerText = `Download ${pack.name}`;
	downloadButton.onclick = () => downloadBlob(pack, pack.name);
	downloadButton.click();
	document.body.appendChild(downloadButton);
	
	generatePackFormSubmitButton.disabled = false;
	
	return pack;
}