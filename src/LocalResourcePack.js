import { AsyncFactory, dirname, sha256, sha256text, toHexadecimalString } from "./utils.js";

export default class LocalResourcePack extends AsyncFactory {
	/** @type {String} A unique hash for this local resource pack. */
	hash;
	files;
	aggressiveHashing;
	#files = new Map();
	
	/**
	 * Creates a local resource pack from a folder input's file list.
	 * @param {FileList} fileList
	 */
	constructor(fileList, aggressiveHashing = false) {
		super();
		this.files = Array.from(fileList ?? []);
		this.aggressiveHashing = aggressiveHashing;
	}
	async init() {
		let folderSummary = [];
		let rootFile = this.files.find(file => file.name == "manifest.json");
		if(!rootFile) {
			throw new Error("Couldn't find manifest.json in local resource pack; it will not be loaded!");
		}
		this.hash = toHexadecimalString(await sha256(rootFile));
		let rootPackPath = dirname(rootFile.webkitRelativePath);
		let packFiles = this.files.filter(file => file.webkitRelativePath.startsWith(rootPackPath));
		let abstractFiles = packFiles.map(file => ({
			name: file.webkitRelativePath.slice(rootPackPath.length),
			blob: file
		}));
		for(let file of abstractFiles) {
			this.#files.set(file.name, file.blob);
			if(this.aggressiveHashing) {
				folderSummary.push(file.name, toHexadecimalString(await sha256(file.blob)));
			}
		}
		if(this.aggressiveHashing) {
			this.hash = toHexadecimalString(await sha256text(folderSummary.join("\n")));
		} else if(!this.hash) {
			let joinedFileNames = abstractFiles.map(file => file.name).join("\n");
			this.hash = toHexadecimalString(await sha256text(joinedFileNames));
			console.warn(`Couldn't find manifest.json in local resource pack for hash; using hash ${this.hash} (this should never appear)`);
		}
	}
	/**
	 * Gets a file from the local resource pack, or undefined if it doesn't exist.
	 * @param {string} filePath
	 * @returns {File | undefined}
	 */
	getFile(filePath) {
		return this.#files.get(filePath);
	}
}