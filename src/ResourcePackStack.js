// Allows us to stack multiple resource packs on top of each other and get a singular resource, much like Minecraft would do.
// Currently this just grabs the vanilla resources.

import { all as mergeObjects } from "deepmerge";

import LocalResourcePack from "./LocalResourcePack.js";
import { jsonc, removeFalsies } from "./utils.js";
import fetchers from "./fetchers.js";

export default class ResourcePackStack {
	static #JSON_FILES_TO_MERGE = ["blocks.json", "textures/terrain_texture.json", "textures/flipbook_textures.json"];
	
	/** Whether or not there are any resource packs attached (apart from vanilla ofc) @type {boolean} */
	hasResourcePacks;
	/** @type {LocalResourcePack[]} */
	localResourcePacks;
	
	/**
	 * Creates a resource pack stack to get resources.
	 * @param {LocalResourcePack[]} [localResourcePacks] Local resource packs to apply. Front of the list is on top (i.e. applied first.)
	 */
	constructor(localResourcePacks = []) {
		this.localResourcePacks = localResourcePacks;
		this.hasResourcePacks = localResourcePacks.length > 0;
	}
	
	/**
	 * Fetches a resource pack file.
	 * @param {string} resourcePath
	 * @returns {Promise<Response>}
	 */
	async fetchResource(resourcePath) {
		let filePath = `resource_pack/${resourcePath}`;
		if(ResourcePackStack.#JSON_FILES_TO_MERGE.includes(resourcePath)) {
			let vanillaRes = await fetchers.vanillaData(filePath);
			let vanillaJson = await jsonc(vanillaRes.clone()); // clone it so it can be read later if need be (responses can only be read once)
			let resourcePackFiles = this.localResourcePacks.map(resourcePack => resourcePack.getFile(resourcePath));
			let resourcePackJsons = await Promise.all(removeFalsies(resourcePackFiles).map(file => jsonc(file)));
			resourcePackJsons.reverse(); // start with the lowest priority pack, so that they get overwritten by higher priority packs
			let allJsons = [vanillaJson, ...resourcePackJsons];
			if(allJsons.length == 1) { // if only the vanilla resources had this file, use that response
				return vanillaRes;
			}
			let mergedJson = mergeObjects(allJsons);
			console.debug(`Merged JSON file ${resourcePath}:`, mergedJson, "From:", allJsons);
			return new Response(JSON.stringify(mergedJson));
		}
		for(let localResourcePack of this.localResourcePacks) {
			let resource = localResourcePack.getFile(resourcePath);
			if(resource) {
				return new Response(resource);
			}
		}
		return await fetchers.vanillaData(filePath);
	}
}