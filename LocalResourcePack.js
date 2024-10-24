import { sha256, sha256text } from "./essential.js";

export default class LocalResourcePack {
	/** @type {String} A unique hash for this local resource pack. */
	hash;
	#files;
	
	/**
	 * Creates a local resource pack from a folder input's file list.
	 * @param {FileList} fileList
	 */
	constructor(fileList = []) {
		return (async () => {
			this.#files = new Map();
			let folderSummary = [];
			for(let file of [...fileList]) {
				let filePath = file.webkitRelativePath.slice(file.webkitRelativePath.indexOf("/") + 1); // the relative path starts with rootFolder/...
				this.#files.set(filePath, file);
				folderSummary.push(filePath, await sha256(file));
			}
			this.hash = (await sha256text(folderSummary.join("\n"))).toHexadecimalString();
			
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