import { BlobReader, BlobWriter, TextReader, ZipWriter } from "@zip.js/zip.js";
import { toBlob } from "./utils.js";

/** Manages exporting files into `.mcpack`s. */
export default class PackBuilder {
	/**
	 * This may hold either the content directly, or a Promise holding the content which will be awaited when the pack is exported.
	 * @readonly @type {Map<string, { content: any, comment?: string }>}
	 */
	#files = new Map();
	/** @readonly @type {FetchFunc} */
	#fetchPackTemplateFile;
	/** @readonly @type {GetResponseContentsFunc} */
	#getResponseContents;
	
	/**
	 * @param {FetchFunc} fetchPackTemplateFile
	 * @param {GetResponseContentsFunc} getResponseContents
	 */
	constructor(fetchPackTemplateFile, getResponseContents) {
		this.#fetchPackTemplateFile = fetchPackTemplateFile;
		this.#getResponseContents = getResponseContents;
	}
	/**
	 * @param {string} filePath
	 * @param {any} content
	 * @param {AddFileOptions} [options]
	 */
	addFile(filePath, content, { comment } = {}) {
		if(this.#files.has(filePath)) {
			throw new Error(`Cannot add ${filePath} to pack, it already exists!`);
		}
		this.#files.set(filePath, { content, comment });
	}
	/** @param {string} filePath */
	removeFile(filePath) {
		if(!this.#files.delete(filePath)) {
			throw new Error(`Cannot delete ${filePath} from pack, it does not exist!`);
		}
	}
	/**
	 * Adds a file from the pack template.
	 * @param {string} filePath
	 */
	addPackTemplateFile(filePath) {
		this.addFile(filePath, this.#getResponseContents(this.#fetchPackTemplateFile(filePath), filePath));
	}
	/**
	 * @param  {...string} filePaths
	 */
	addPackTemplateFiles(...filePaths) {
		filePaths.forEach(filePath => this.addPackTemplateFile(filePath));
	}
	/**
	 * Exports the pack as a `.mcpack` file.
	 * @param {string} packName
	 * @param {ExportOptions} [options]
	 * @returns {Promise<File>}
	 */
	async export(packName, { zipCompressionLevel } = {}) {
		let packFileWriter = new BlobWriter();
		let zipWriter = new ZipWriter(packFileWriter);
		await Promise.all(Array.from(this.#files.entries()).map(async ([filePath, { content, comment }]) => {
			/** @type {ZipWriterAddDataOptions} */
			let options = {
				comment,
				level: zipCompressionLevel
			};
			if(content instanceof Promise) {
				content = await content;
			}
			if(content instanceof HTMLImageElement) {
				content = await toBlob(content);
			}
			if(content instanceof Blob) {
				return zipWriter.add(filePath, new BlobReader(content), options);
			}
			if(typeof content == "object") {
				content = JSON.stringify(content);
			}
			return zipWriter.add(filePath, new TextReader(content), options);
		}));
		let zippedPack = await zipWriter.close();
		
		return new File([zippedPack], `${packName}.holoprint.mcpack`, {
			type: "application/mcpack"
		});
	}
}

/**
 * @typedef {(filePath: string) => Promise<Response>} FetchFunc
 */
/**
 * @typedef {(resPromise: Promise<Response>, filePath: string) => Promise<any>} GetResponseContentsFunc
 */
/**
 * @typedef AddFileOptions
 * @property {string} [comment] An optional comment to add to the file entry.
 */
/**
 * @typedef ExportOptions
 * @property {number} [zipCompressionLevel]
 */

/** @import { ZipWriterAddDataOptions } from "@zip.js/zip.js" */