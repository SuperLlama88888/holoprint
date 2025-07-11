// Allows us to stack multiple resource packs on top of each other and get a singular resource, much like Minecraft would do.
// Currently this just grabs the vanilla resources.

import { all as mergeObjects } from "deepmerge";

import "./utils.js";

import LocalResourcePack from "./LocalResourcePack.js";
import { AsyncFactory, CachingFetcher, jsonc, removeFalsies, sha256text, toHexadecimalString } from "./utils.js";

const defaultVanillaDataVersion = "v1.21.70.26-preview";

export default class ResourcePackStack extends AsyncFactory {
	static #JSON_FILES_TO_MERGE = ["blocks.json", "textures/terrain_texture.json", "textures/flipbook_textures.json"];
	
	enableCache;
	vanillaDataVersion;
	hash;
	cacheName;
	/** Whether or not there are any resource packs attached (apart from vanilla ofc) @type {Boolean} */
	hasResourcePacks;
	/** @type {Array<LocalResourcePack>} */
	localResourcePacks;
	#cache;
	
	/**
	 * Creates a resource pack stack to get resources.
	 * @param {Array<LocalResourcePack>} [localResourcePacks] Local resource packs to apply. Front of the list is on top (i.e. applied first.)
	 * @param {boolean} [enableCache] Whether or not to cache files
	 * @param {string} [vanillaDataVersion] The Minecraft version to get vanilla data from
	 */
	constructor(localResourcePacks = [], enableCache = true, vanillaDataVersion = defaultVanillaDataVersion) {
		super();
		this.localResourcePacks = localResourcePacks;
		this.enableCache = enableCache;
		this.vanillaDataVersion = vanillaDataVersion;
		this.hasResourcePacks = localResourcePacks.length > 0;
	}
	async init() {
		this.hash = toHexadecimalString(await sha256text([this.vanillaDataVersion, ...this.localResourcePacks.map(lrp => lrp.hash)].join("\n")));
		this.cacheName = `ResourcePackStack_${this.hash}`;
		if(this.enableCache) {
			console.log("Using cache:", this.cacheName, [this.vanillaDataVersion, ...this.localResourcePacks.map(lrp => lrp.hash)])
			this.#cache = await caches.open(this.cacheName);
		}
	}
	
	/**
	 * Fetches a resource pack file.
	 * @param {string} resourcePath
	 * @returns {Promise<Response>}
	 */
	async fetchResource(resourcePath) {
		let filePath = `resource_pack/${resourcePath}`;
		let cacheLink = `https://holoprint-cache/${filePath}`;
		let res = this.enableCache && await this.#cache.match(cacheLink);
		if(CachingFetcher.BAD_STATUS_CODES.includes(res?.status)) {
			await this.#cache.delete(cacheLink);
			res = undefined;
		}
		if(!res) {
			if(ResourcePackStack.#JSON_FILES_TO_MERGE.includes(resourcePath)) {
				let vanillaRes = await VanillaDataFetcher.fetch(filePath);
				let vanillaJson = await jsonc(vanillaRes.clone()); // clone it so it can be read later if need be (responses can only be read once)
				let resourcePackFiles = this.localResourcePacks.map(resourcePack => resourcePack.getFile(resourcePath));
				let resourcePackJsons = await Promise.all(removeFalsies(resourcePackFiles).map(file => jsonc(file)));
				resourcePackJsons.reverse(); // start with the lowest priority pack, so that they get overwritten by higher priority packs
				let allJsons = [vanillaJson, ...resourcePackJsons];
				if(allJsons.length == 1) { // if only the vanilla resources had this file, use that response
					res = vanillaRes;
				} else {
					let mergedJson = mergeObjects(allJsons);
					console.debug(`Merged JSON file ${resourcePath}:`, mergedJson, "From:", allJsons);
					res = new Response(JSON.stringify(mergedJson));
				}
			} else {
				for(let localResourcePack of this.localResourcePacks) {
					let resource = localResourcePack.getFile(resourcePath);
					if(resource) {
						res = new Response(resource);
						break;
					}
				}
				res ??= await VanillaDataFetcher.fetch(filePath);
			}
			if(this.enableCache) {
				await this.#cache.put(cacheLink, res.clone());
			}
		}
		return res;
	}
}

export class VanillaDataFetcher extends CachingFetcher {
	static #VANILLA_RESOURCES_LINK = "https://cdn.jsdelivr.net/gh/Mojang/bedrock-samples"; // No / at the end
	/** @type {VanillaDataFetcher} */
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