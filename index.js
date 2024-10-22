import { selectEl, downloadBlob } from "./essential.js";
import HoloPrint from "./HoloPrint.js";
import SimpleLogger from "./SimpleLogger.js";
import SupabaseLogger from "./SupabaseLogger.js";

import ResourcePackStack from "./ResourcePackStack.js";
import LocalResourcePack from "./LocalResourcePack.js";

const IN_PRODUCTION = location.host.includes(".github.io"); // hosted on GitHub Pages

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
let logger;

let supabaseLogger;

document.onEvent("DOMContentLoaded", () => {
	document.body.appendChild = selectEl("main").appendChild.bind(selectEl("main"));
	
	dropFileNotice = selectEl("#dropFileNotice");
	
	if(location.search == "?loadFile") {
		window.launchQueue?.setConsumer(async launchParams => {
			let files = await Promise.all(launchParams.files.map(fileHandle => fileHandle.getFile()));
			files.forEach(handleLaunchFile);
		});
	}
	
	let dragCounter = 0;
	document.documentElement.onEvent("dragenter", () => {
		dragCounter++;
	});
	document.documentElement.onEvent("dragover", e => {
		if(true || e.dataTransfer?.types?.includes("Files")) { // https://html.spec.whatwg.org/multipage/dnd.html#dom-datatransfer-types-dev
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
		let structureFiles = files.filter(file => file.name.endsWith(".mcstructure"));
		let resourcePacks = files.filter(file => file.name.endsWith(".mcpack"));
		
		let structureFilesInput = generatePackForm.elements.namedItem("structureFiles");
		if(structureFiles.length) {
			let dataTransfer = new DataTransfer();
			// [...structureFilesInput.files, ...structureFiles].forEach(file => dataTransfer.items.add(file));
			dataTransfer.items.add(structureFiles[0]);
			structureFilesInput.files = dataTransfer.files;
		}
		for(let resourcePack of resourcePacks) {
			let structureFile = await HoloPrint.extractStructureFileFromPack(resourcePack);
			if(structureFile) {
				let dataTransfer = new DataTransfer();
				dataTransfer.items.add(structureFile);
				structureFilesInput.files = dataTransfer.files;
				break;
			}
		}
	});
	
	let logCont = selectEl("#log");
	logger = new SimpleLogger(logCont);
	logger.patchConsoleMethods();
	
	generatePackForm = selectEl("#generatePackForm");
	generatePackForm.onEvent("submit", e => {
		e.preventDefault();
		
		let formData = new FormData(generatePackForm);
		let localResourcePack = new LocalResourcePack(generatePackForm.elements.namedItem("localResourcePack").files);
		makePack(formData.get("structureFiles"), [localResourcePack]);
	});
	generatePackFormSubmitButton = generatePackForm.elements.namedItem("submit");
	
	let opacityModeSelect = generatePackForm.elements.namedItem("opacityMode");
	opacityModeSelect.onEventAndNow("change", () => {
		generatePackForm.elements.namedItem("opacity").parentElement.classList.toggle("hidden", opacityModeSelect.value == "multiple");
	});
	
	let materialListLanguageSelector = selectEl("#materialListLanguageSelector");
	(new ResourcePackStack()).fetchResource("texts/language_names.json").then(res => res.json()).then(languages => {
		materialListLanguageSelector.firstElementChild.remove();
		languages.forEach(([languageCode, languageName]) => {
			materialListLanguageSelector.appendChild(new Option(languageName, languageCode, false, languageCode.replace("_", "-") == navigator.language));
		});
	}).catch(e => {
		console.warn(`Couldn't load language_names.json: ${e}`);
	});
});

async function handleLaunchFile(file) {
	if(!file.name.endsWith(".mcstructure")) {
		console.error(`File is not a structure file: ${file.name}`);
		return;
	}
	let pack = await makePack(file);
	return pack;
}

async function makePack(structureFile, localResourcePacks) {
	generatePackFormSubmitButton.disabled = true;
	
	let formData = new FormData(generatePackForm);
	let config = {
		SCALE: formData.get("scale") / 100,
		OPACITY: formData.get("opacity") / 100,
		MULTIPLE_OPACITIES: formData.get("opacityMode") == "multiple",
		LAYER_MODE: formData.get("layerMode"),
		TEXTURE_OUTLINE_WIDTH: +formData.get("textureOutlineWidth"),
		TEXTURE_OUTLINE_COLOR: formData.get("textureOutlineColor"),
		TEXTURE_OUTLINE_ALPHA_THRESHOLD: +formData.get("textureOutlineAlphaThreshold"),
		TEXTURE_OUTLINE_ALPHA_DIFFERENCE_MODE: formData.get("textureOutlineAlphaDifferenceMode"),
		MATERIAL_LIST_LANGUAGE: formData.get("materialListLanguage")
	};
	
	let previewCont = selectEl("#previewCont");
	
	let resourcePackStack = new ResourcePackStack(localResourcePacks);
	logger.setOriginTime(performance.now());
	window.logger = logger;
	
	let pack;
	try {
		let hp = new HoloPrint(config, resourcePackStack, previewCont);
		pack = await hp.makePack(structureFile);
	} catch(e) {
		console.error(`Pack creation failed: ${e}`);
	}
	
	if(IN_PRODUCTION) {
		supabaseLogger ??= new SupabaseLogger(supabaseProjectUrl, supabaseApiKey);
		supabaseLogger.recordStructureUsage(structureFile);
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