import { sha256, sha256text } from "./essential.js";

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
			for(let file of [...fileList]) {
				let filePath = file.webkitRelativePath.slice(file.webkitRelativePath.indexOf("/") + 1); // the relative path starts with rootFolder/...
				this.#files.set(filePath, file);
				if(aggressiveHashing) {
					folderSummary.push(filePath, await sha256(file));
				} else if(filePath == "manifest.json") {
					this.hash = (await sha256(file)).toHexadecimalString();
				}
			}
			if(aggressiveHashing) {
				this.hash = (await sha256text(folderSummary.join("\n"))).toHexadecimalString();
			} else if(!this.hash) {
				this.hash = (await sha256text([...fileList].map(file => file.webkitRelativePath)).join("\n")).toHexadecimalString();
				console.warn(`Couldn't find manifest.json in local resource pack for hash; using hash ${this.hash}`);
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