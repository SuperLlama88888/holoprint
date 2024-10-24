import { createClient as createSupabaseClient } from "https://esm.run/@supabase/supabase-js@2";
import { addOrdinalSuffix, sha256 } from "./essential.js";

export default class SupabaseLogger {
	supabase;
	
	constructor(projectUrl, apiKey) {
		this.supabase = createSupabaseClient(projectUrl, apiKey);
	}
	/**
	 * Records the usage of a structure file in a Supabase server, based on its hash.
	 * @param {File} structureFile
	 */
	async recordStructureUsage(structureFile) {
		console.info("Hashing structure file...");
		let fullFileHash = (await sha256(structureFile)).toHexadecimalString();
		let shortFileHash = fullFileHash.slice(0, 8);
		// console.log(`Full file hash: ${fullFileHash}`);
		console.log(`Finished hashing structure file: ${shortFileHash}`);
		
		let res = await this.supabase.rpc("record_structure_usage", {
			"file_hash": shortFileHash
		});
		console.log(JSON.stringify(res));
		if(res["status"] == 200) {
			console.info(`Successfully logged structure hash to database!\nThis is the ${addOrdinalSuffix(res["data"])} time this structure has been used.`);
		} else {
			throw new Error(`SupabaseLogger error ${res["error"]["code"]}: ${res["error"]["message"]}`);
		}
	}
}