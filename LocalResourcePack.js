export default class LocalResourcePack {
	#files;
	
	/**
	 * Creates a local resource pack from a folder input's file list.
	 * @param {FileList} fileList
	 */
	constructor(fileList = []) {
		this.#files = new Map();
		[...fileList].forEach(file => {
			this.#files.set(file.webkitRelativePath.slice(file.webkitRelativePath.indexOf("/") + 1), file); // the relative path starts with rootFolder/...
		});
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