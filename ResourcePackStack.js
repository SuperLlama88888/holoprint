// Allows us to stack multiple resource packs on top of each other and get a singular resource, much like Minecraft would do.
// Currently this just grabs the vanilla resources.

import { all as mergeObjects } from "https://esm.run/deepmerge@4.3.1";

import "./essential.js";

import LocalResourcePack from "./LocalResourcePack.js";

export default class ResourcePackStack {
	static #JSON_FILES_TO_MERGE = ["blocks.json", "textures/terrain_texture.json", "textures/flipbook_textures.json"];
	
	#localResourcePacks;
	#mergedFiles;
	
	/**
	 * Creates a resource pack stack to get resources.
	 * @param {Array<LocalResourcePack>} localResourcePacks Local resource packs to apply. Front of the list is on top (i.e. applied first.)
	 */
	constructor(localResourcePacks = []) {
		this.#localResourcePacks = localResourcePacks;
		this.#mergedFiles = new Map();
	}
	
	fetchData(link) {
		return VanillaDataFetcher.fetch(link);
	}
	/**
	 * Fetches a resource pack file.
	 * @param {String} filePath 
	 * @returns {Promise<Response>}
	 */
	async fetchResource(filePath) {
		if(ResourcePackStack.#JSON_FILES_TO_MERGE.includes(filePath)) {
			let vanillaFile = await VanillaDataFetcher.fetch(`resource_pack/${filePath}`).then(res => res.jsonc());
			let resourcePackFiles = await Promise.all(this.#localResourcePacks.map(resourcePack => resourcePack.getFile(filePath)?.jsonc()));
			resourcePackFiles.reverse();
			let allFiles = [vanillaFile, ...resourcePackFiles.filter(file => file)];
			if(allFiles.length == 1) {
				return new Response(JSON.stringify(vanillaFile)); // aahhh it goes back and forth between an object and json so much.
			}
			let mergedFile = mergeObjects(allFiles);
			console.debug(`Merged JSON file ${filePath}:`, mergedFile, "From:", allFiles);
			return new Response(JSON.stringify(mergedFile));
		} else {
			for(let localResourcePack of this.#localResourcePacks) {
				let resource = localResourcePack.getFile(filePath);
				if(resource) {
					return new Response(resource);
				}
			}
			return await VanillaDataFetcher.fetch(`resource_pack/${filePath}`);
		};
	}
}

export class VanillaDataFetcher {
	static #VANILLA_RESOURCES_LINK = "https://raw.githubusercontent.com/Mojang/bedrock-samples/v1.21.40.25-preview"; // No / at the end
	
	/**
	 * Fetches vanilla data files from the Mojang/bedrock-samples repository on GitHub.
	 * @param {String} filePath
	 * @returns {Promise<Response>}
	 */
	static fetch(filePath) {
		return fetch(`${VanillaDataFetcher.#VANILLA_RESOURCES_LINK}/${filePath}`);
	}
}