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
	
	async fetchData(link) {
		let cacheLink = `https://holoprint-cache/${link}`;
		let res = this.cacheEnabled && await this.#cache.match(cacheLink);
		if(!res) {
			res = await this.#vanillaDataFetcher.fetch(link);
			if(this.cacheEnabled) {
				this.#cache.put(cacheLink, res.clone());
			}
		}
		return res;
	}
	/**
	 * Fetches a resource pack file.
	 * @param {String} filePath 
	 * @returns {Promise<Response>}
	 */
	async fetchResource(filePath) {
		let dataPath = `resource_pack/${filePath}`;
		let cacheLink = `https://holoprint-cache/${dataPath}`;
		let res = this.cacheEnabled && await this.#cache.match(cacheLink);
		if(!res) {
			if(ResourcePackStack.#JSON_FILES_TO_MERGE.includes(filePath)) {
				let vanillaFile = await this.fetchData(dataPath).then(res => res.jsonc());
				let resourcePackFiles = await Promise.all(this.#localResourcePacks.map(resourcePack => resourcePack.getFile(filePath)?.jsonc()));
				resourcePackFiles.reverse();
				let allFiles = [vanillaFile, ...resourcePackFiles.filter(file => file)];
				if(allFiles.length == 1) {
					return new Response(JSON.stringify(vanillaFile)); // aahhh it goes back and forth between an object and json so much.
				}
				let mergedFile = mergeObjects(allFiles);
				console.debug(`Merged JSON file ${filePath}:`, mergedFile, "From:", allFiles);
				res = new Response(JSON.stringify(mergedFile));
			} else {
				for(let localResourcePack of this.#localResourcePacks) {
					let resource = localResourcePack.getFile(filePath);
					if(resource) {
						return new Response(resource);
					}
				}
				res = await this.#vanillaDataFetcher.fetch(dataPath);
			}
			if(this.cacheEnabled) {
				await this.#cache.put(cacheLink, res.clone());
			}
		}
		return res;
	}
}

export class VanillaDataFetcher {
	static #VANILLA_RESOURCES_LINK = "https://raw.githubusercontent.com/Mojang/bedrock-samples"; // No / at the end
	/**
	 * Creates a vanilla data fetch to fetch data from the Mojang/bedrock-samples repository.
	 * @param {String} version The name of the GitHub tag for a specific Minecraft version.
	 */
	constructor(version) {
		this.version = version;
	}
	/**
	 * Fetches vanilla data files from the Mojang/bedrock-samples repository on GitHub.
	 * @param {String} filePath
	 * @returns {Promise<Response>}
	 */
	fetch(filePath) {
		return fetch(`${VanillaDataFetcher.#VANILLA_RESOURCES_LINK}/${this.version}/${filePath}`);
	}
}