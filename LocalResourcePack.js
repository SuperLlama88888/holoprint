import { dirname, sha256, sha256text } from "./essential.js";

export default class LocalResourcePack {
	/** @type {String} A unique hash for this local resource pack. */
	hash;
	#files;
	
	/**
	 * Creates a local resource pack from a folder input's file list.
	 * @param {FileList} fileList
	 */
	constructor(fileList = [], aggressiveHashing = false) {
		return (async () => {
			this.#files = new Map();
			let folderSummary = [];
			let rootFile = [...fileList].find(file => file.name == "manifest.json");
			if(!rootFile) {
				throw new Error("Couldn't find manifest.json in local resource pack; it will not be loaded!");
			}
			this.hash = (await sha256(rootFile)).toHexadecimalString();
			let rootPackPath = dirname(rootFile.webkitRelativePath);
			let packFiles = [...fileList].filter(file => file.webkitRelativePath.startsWith(rootPackPath));
			let abstractFiles = packFiles.map(file => ({
				name: file.webkitRelativePath.slice(rootPackPath.length),
				blob: file
			}));
			for(let file of abstractFiles) {
				this.#files.set(file.name, file.blob);
				if(aggressiveHashing) {
					folderSummary.push(file.name, await sha256(file.blob));
				}
			}
			if(aggressiveHashing) {
				this.hash = (await sha256text(folderSummary.join("\n"))).toHexadecimalString();
			} else if(!this.hash) {
				let joinedFileNames = abstractFiles.map(file => file.name).join("\n");
				this.hash = (await sha256text(joinedFileNames)).toHexadecimalString();
				console.warn(`Couldn't find manifest.json in local resource pack for hash; using hash ${this.hash} (this should never appear)`);
			}
			
			return this;
		})();
	}
	/**
	 * Gets a file from the local resource pack, or undefined if it doesn't exist.
	 * @param {String} filePath
	 * @returns {File|undefined}
	 */
	getFile(filePath) {
		return this.#files.get(filePath);
	}
}