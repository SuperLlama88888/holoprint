// Allows us to stack multiple resource packs on top of each other and get a singular resource, much like Minecraft would do.
// Currently this just grabs the vanilla resources.

import { all as mergeObjects } from "deepmerge";

import "./utils.js";

import LocalResourcePack from "./LocalResourcePack.js";
import { CachingFetcher, jsonc, removeFalsies } from "./utils.js";

const defaultVanillaDataVersion = "v1.21.70.26-preview";

export default class ResourcePackStack {
	static #JSON_FILES_TO_MERGE = ["blocks.json", "textures/terrain_texture.json", "textures/flipbook_textures.json"];
	
	vanillaDataVersion;
	/** Whether or not there are any resource packs attached (apart from vanilla ofc) @type {boolean} */
	hasResourcePacks;
	/** @type {LocalResourcePack[]} */
	localResourcePacks;
	
	/**
	 * Creates a resource pack stack to get resources.
	 * @param {LocalResourcePack[]} [localResourcePacks] Local resource packs to apply. Front of the list is on top (i.e. applied first.)
	 * @param {string} [vanillaDataVersion] The Minecraft version to get vanilla data from
	 */
	constructor(localResourcePacks = [], vanillaDataVersion = defaultVanillaDataVersion) {
		this.localResourcePacks = localResourcePacks;
		this.vanillaDataVersion = vanillaDataVersion;
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
			let vanillaRes = await VanillaDataFetcher.fetch(filePath);
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
		return await VanillaDataFetcher.fetch(filePath);
	}
}

export class VanillaDataFetcher extends CachingFetcher {
	static #VANILLA_RESOURCES_LINK = "https://cdn.jsdelivr.net/gh/Mojang/bedrock-samples"; // No / at the end
	/** @type {Promise<VanillaDataFetcher>} */
	static #instance;
	
	/**
	 * Creates a vanilla data fetcher to fetch data from the Mojang/bedrock-samples repository.
	 * @param {string} [version] The name of the GitHub tag for a specific Minecraft version.
	 */
	constructor(version = defaultVanillaDataVersion) {
		super(`VanillaDataFetcher_${version}`, `${VanillaDataFetcher.#VANILLA_RESOURCES_LINK}@${version}/`);
		this.version = version;
	}
	static async fetch(url) {
		this.#instance ??= VanillaDataFetcher.new();
		return (await this.#instance).fetch(url);
	}
}