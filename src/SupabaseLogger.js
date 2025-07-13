import { addOrdinalSuffix, AsyncFactory, concatenateFiles, sha256, toHexadecimalString } from "./utils.js";

export default class SupabaseLogger extends AsyncFactory {
	projectUrl;
	apiKey;
	supabase;
	
	constructor(projectUrl, apiKey) {
		super();
		this.projectUrl = projectUrl;
		this.apiKey = apiKey;
	}
	async init() {
		let supabaseLib = await import("@supabase/supabase-js");
		this.supabase = supabaseLib.createClient(this.projectUrl, this.apiKey);
	}
	/**
	 * Records the creation of a pack from structure files in a Supabase server, based on file hashes.
	 * @param {File[]} structureFiles
	 */
	async recordPackCreation(structureFiles) {
		console.info("Hashing structure files...");
		let fullFileHashes = await Promise.all(structureFiles.map(async structureFile => toHexadecimalString(await sha256(structureFile))));
		let shortFileHashes = fullFileHashes.map(fullFileHash => fullFileHash.slice(0, 8));
		// console.log(`Full file hashes: ${fullFileHashes}`);
		let combinedFileHash = toHexadecimalString(await sha256(concatenateFiles(structureFiles))).slice(0, 8);
		console.debug(`Finished hashing structure files! Together: ${combinedFileHash}, individually:`, shortFileHashes);
		
		let res = await this.supabase.rpc("record_structure_usage_v2", {
			"file_hashes": shortFileHashes,
			"combined_file_hash": combinedFileHash
		});
		if(res["status"] == 200) {
			console.info(`Successfully logged structure hash to database!\nThis is the ${addOrdinalSuffix(res["data"])} time this structure has been used.`);
		} else {
			throw new Error(`SupabaseLogger error ${res["error"]["code"]}: ${res["error"]["message"]}`);
		}
	}
}