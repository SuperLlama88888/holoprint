// Allows us to stack multiple resource packs on top of each other and get a singular resource, much like Minecraft would do.
// Currently this just grabs the vanilla resources.

import { all as mergeObjects } from "https://esm.run/deepmerge@4.3.1";

import "./essential.js";

import LocalResourcePack from "./LocalResourcePack.js";
import { sha256text } from "./essential.js";

export default class ResourcePackStack {
	static #JSON_FILES_TO_MERGE = ["blocks.json", "textures/terrain_texture.json", "textures/flipbook_textures.json"];
	
	cacheEnabled;
	hash;
	cacheName;
	#localResourcePacks;
	#vanillaDataFetcher;
	#cache;
	
	/**
	 * Creates a resource pack stack to get resources.
	 * @param {Array<LocalResourcePack>} [localResourcePacks] Local resource packs to apply. Front of the list is on top (i.e. applied first.)
	 * @param {Boolean} [enableCache] Whether or not to cache files
	 * @param {String} [vanillaDataVersion] The Minecraft version to get vanilla data from
	 */
	constructor(localResourcePacks = [], enableCache = true, vanillaDataVersion = "v1.21.40.25-preview") {
		return (async () => {
			this.hash = (await sha256text([vanillaDataVersion, ...localResourcePacks.map(lrp => lrp.hash)].join("\n"))).toHexadecimalString();
			this.cacheName = `ResourcePackStack_${this.hash}`;
			this.#localResourcePacks = localResourcePacks;
			this.#vanillaDataFetcher = new VanillaDataFetcher(vanillaDataVersion);
			this.cacheEnabled = enableCache;
			if(enableCache) {
				console.log("Using cache:", this.cacheName, [vanillaDataVersion, ...localResourcePacks.map(lrp => lrp.hash)])
				this.#cache = await caches.open(this.cacheName);
			}
			
			return this;
		})();
	}
	
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
		if(!res) {
			if(ResourcePackStack.#JSON_FILES_TO_MERGE.includes(resourcePath)) {
				let vanillaFile = await this.fetchData(filePath).then(res => res.jsonc());
				let resourcePackFiles = await Promise.all(this.#localResourcePacks.map(resourcePack => resourcePack.getFile(resourcePath)?.jsonc()));
				resourcePackFiles.reverse(); // start with the lowest priority pack, so that they get overwritten by higher priority packs
				let allFiles = [vanillaFile, ...resourcePackFiles.removeFalsies()];
				if(allFiles.length == 1) {
					res = new Response(JSON.stringify(vanillaFile)); // aahhh it goes back and forth between an object and json so much.
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
				this.#cache.put(cacheLink, res.clone()).catch(e => console.warn(`Failed to save resource to cache ${this.cacheName}:`, e));
			}
		}
		return res;
	}
}

export class VanillaDataFetcher {
	static #VANILLA_RESOURCES_LINK = "https://raw.githubusercontent.com/Mojang/bedrock-samples"; // No / at the end
	
	version;
	cacheName;
	#cache;
	/**
	 * Creates a vanilla data fetch to fetch data from the Mojang/bedrock-samples repository.
	 * @param {String} version The name of the GitHub tag for a specific Minecraft version.
	 */
	constructor(version) {
		this.version = version;
		this.cacheName = `VanillaDataFetcher_${this.version}`;
		this.#cache = caches.open(this.cacheName);
	}
	/**
	 * Fetches vanilla data files from the Mojang/bedrock-samples repository on GitHub.
	 * @param {String} filePath
	 * @returns {Promise<Response>}
	 */
	async fetch(filePath) {
		if(this.#cache instanceof Promise) {
			this.#cache = await this.#cache;
		}
		let cacheLink = `https://holoprint-cache/${filePath}`;
		let res = await this.#cache.match(cacheLink);
		if(!res) {
			res = await fetch(`${VanillaDataFetcher.#VANILLA_RESOURCES_LINK}/${this.version}/${filePath}`);
			this.#cache.put(cacheLink, res.clone()).catch(e => console.warn(`Failed to save vanilla data to cache ${this.cacheName}:`, e));
		}
		return res;
	}
}