import { createClient as createSupabaseClient } from "https://esm.run/@supabase/supabase-js@2";
import { addOrdinalSuffix, concatenateFiles, sha256 } from "./essential.js";

export default class SupabaseLogger {
	supabase;
	
	constructor(projectUrl, apiKey) {
		this.supabase = createSupabaseClient(projectUrl, apiKey);
	}
	/**
	 * Records the creation of a pack from structure files in a Supabase server, based on file hashes.
	 * @param {Array<File>} structureFiles
	 */
	async recordPackCreation(structureFiles) {
		console.info("Hashing structure files...");
		let fullFileHashes = await Promise.all(structureFiles.map(async structureFile => (await sha256(structureFile)).toHexadecimalString()));
		let shortFileHashes = fullFileHashes.map(fullFileHash => fullFileHash.slice(0, 8));
		// console.log(`Full file hashes: ${fullFileHashes}`);
		let combinedFileHash = (await sha256(concatenateFiles(structureFiles))).toHexadecimalString().slice(0, 8);
		console.log(`Finished hashing structure files! Together: ${combinedFileHash}, individually:`, shortFileHashes);
		
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