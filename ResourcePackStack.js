// Allows us to stack multiple resource packs on top of each other and get a singular resource, much like Minecraft would do.
// Currently this just grabs the vanilla resources.

import { all as mergeObjects } from "deepmerge";

import "./essential.js";

import LocalResourcePack from "./LocalResourcePack.js";
import { CachingFetcher, sha256text } from "./essential.js";

const defaultVanillaDataVersion = "v1.21.70.26-preview";

export default class ResourcePackStack {
	static #JSON_FILES_TO_MERGE = ["blocks.json", "textures/terrain_texture.json", "textures/flipbook_textures.json"];
	
	cacheEnabled;
	hash;
	cacheName;
	/** Whether or not there are any resource packs attached (apart from vanilla ofc) @type {Boolean} */
	hasResourcePacks;
	/** @type {Array<LocalResourcePack>} */
	#localResourcePacks;
	 /** @type {VanillaDataFetcher} */
	#vanillaDataFetcher;
	#cache;
	
	/**
	 * Creates a resource pack stack to get resources.
	 * @param {Array<LocalResourcePack>} [localResourcePacks] Local resource packs to apply. Front of the list is on top (i.e. applied first.)
	 * @param {Boolean} [enableCache] Whether or not to cache files
	 * @param {String} [vanillaDataVersion] The Minecraft version to get vanilla data from
	 */
	constructor(localResourcePacks = [], enableCache = true, vanillaDataVersion = defaultVanillaDataVersion) {
		return (async () => {
			this.hash = (await sha256text([vanillaDataVersion, ...localResourcePacks.map(lrp => lrp.hash)].join("\n"))).toHexadecimalString();
			this.cacheName = `ResourcePackStack_${this.hash}`;
			this.hasResourcePacks = localResourcePacks.length > 0;
			this.#localResourcePacks = localResourcePacks;
			this.#vanillaDataFetcher = await new VanillaDataFetcher(vanillaDataVersion);
			this.cacheEnabled = enableCache;
			if(enableCache) {
				console.log("Using cache:", this.cacheName, [vanillaDataVersion, ...localResourcePacks.map(lrp => lrp.hash)])
				this.#cache = await caches.open(this.cacheName);
			}
			
			return this;
		})();
	}
	
	/**
	 * Fetches data from the root directory of Mojang/bedrock-samples.
	 * @param {String} filePath 
	 * @returns {Promise<Response>}
	 */
	async fetchData(filePath) {
		return this.#vanillaDataFetcher.fetch(filePath);
	}
	/**
	 * Fetches a resource pack file.
	 * @param {String} resourcePath
	 * @returns {Promise<Response>}
	 */
	async fetchResource(resourcePath) {
		let filePath = `resource_pack/${resourcePath}`;
		let cacheLink = `https://holoprint-cache/${filePath}`;
		let res = this.cacheEnabled && await this.#cache.match(cacheLink);
		if(CachingFetcher.BAD_STATUS_CODES.includes(res?.status)) {
			await this.#cache.delete(cacheLink);
			res = undefined;
		}
		if(!res) {
			if(ResourcePackStack.#JSON_FILES_TO_MERGE.includes(resourcePath)) {
				let vanillaRes = await this.fetchData(filePath);
				let vanillaFile = await vanillaRes.clone().jsonc(); // clone it so it can be read later if need be (responses can only be read once)
				let resourcePackFiles = await Promise.all(this.#localResourcePacks.map(resourcePack => resourcePack.getFile(resourcePath)?.jsonc()));
				resourcePackFiles.reverse(); // start with the lowest priority pack, so that they get overwritten by higher priority packs
				let allFiles = [vanillaFile, ...resourcePackFiles.removeFalsies()];
				if(allFiles.length == 1) { // if only the vanilla resources had this file, use that response
					res = vanillaRes;
				} else {
					let mergedFile = mergeObjects(allFiles);
					console.debug(`Merged JSON file ${resourcePath}:`, mergedFile, "From:", allFiles);
					res = new Response(JSON.stringify(mergedFile));
				}
			} else {
				for(let localResourcePack of this.#localResourcePacks) {
					let resource = localResourcePack.getFile(resourcePath);
					if(resource) {
						res = new Response(resource);
						break;
					}
				}
				res ??= await this.fetchData(filePath);
			}
			if(this.cacheEnabled) {
				await this.#cache.put(cacheLink, res.clone());
			}
		}
		return res;
	}
}

export class VanillaDataFetcher extends CachingFetcher {
	static #VANILLA_RESOURCES_LINK = "https://cdn.jsdelivr.net/gh/Mojang/bedrock-samples"; // No / at the end
	
	/**
	 * Creates a vanilla data fetcher to fetch data from the Mojang/bedrock-samples repository.
	 * @param {String} [version] The name of the GitHub tag for a specific Minecraft version.
	 */
	constructor(version = defaultVanillaDataVersion) {
		return (async () => {
			await super(`VanillaDataFetcher_${version}`, `${VanillaDataFetcher.#VANILLA_RESOURCES_LINK}@${version}/`);
			this.version = version;
			
			return this;
		})();
	}
}