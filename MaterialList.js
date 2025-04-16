import { floor, nanToUndefined } from "./essential.js";

export default class MaterialList {
	/** @type {Map<String, Number>} */
	materials;
	totalMaterialCount;
	
	#blockMetadata;
	#itemMetadata;
	#translations;
	
	// I wish I could use import...with to import these from materialListMappings.json, which would have worked with esbuild, but it doesn't let me load JSONC... sad...
	#ignoredBlocks;
	#individualBlockToItemMappings;
	#blockToItemPatternMappings;
	#itemCountMultipliers;
	#specialBlockEntityProperties;
	#individualSerializationIdPatches;
	#serializationIdPatternPatches;
	#blocksMissingSerializationIds;
	#translationPatches;
	
	/**
	 * Creates a material list manager to count a list of items.
	 * @param {Object} blockMetadata `Mojang/bedrock-samples/metadata/vanilladata_modules/mojang-blocks.json`
	 * @param {Object} itemMetadata `Mojang/bedrock-samples/metadata/vanilladata_modules/mojang-items.json`
	 * @param {String} [translations] The text contents of a `.lang` file
	 */
	constructor(blockMetadata, itemMetadata, translations) {
		this.materials = new Map();
		this.totalMaterialCount = 0;
		
		this.#blockMetadata = new Map(blockMetadata["data_items"].map(block => [block["name"], block]));
		this.#itemMetadata = new Map(itemMetadata["data_items"].map(item => [item["name"], item]));
		if(translations) {
			this.setLanguage(translations);
		}
		
		return (async () => {
			let materialListMappings = await fetch("data/materialListMappings.json").then(res => res.jsonc());
			this.#ignoredBlocks = materialListMappings["ignored_blocks"];
			let blockToItemMappings = Object.entries(materialListMappings["block_to_item_mappings"]);
			this.#individualBlockToItemMappings = new Map(blockToItemMappings.filter(([blockName]) => !blockName.startsWith("/") && !blockName.endsWith("/")));
			this.#blockToItemPatternMappings = blockToItemMappings.filter(([pattern]) => pattern.startsWith("/") && pattern.endsWith("/")).map(([pattern, item]) => [new RegExp(pattern.slice(1, -1), "g"), item]);
			this.#itemCountMultipliers = Object.entries(materialListMappings["item_count_multipliers"]).map(([key, value]) => {
				let itemNames = [];
				let patterns = [];
				key.split(",").forEach(itemNameOrPattern => {
					if(itemNameOrPattern.startsWith("/") && itemNameOrPattern.endsWith("/")) {
						patterns.push(new RegExp(itemNameOrPattern.slice(1, -1)));
					} else {
						itemNames.push(itemNameOrPattern);
					}
				});
				if(typeof value == "number") {
					return [itemNames, patterns, value, ""];
				} else {
					return [itemNames, patterns, value["multiplier"], value["remove"]];
				}
			});
			this.#specialBlockEntityProperties = materialListMappings["special_block_entity_properties"];
			let serializationIdPatches = Object.entries(materialListMappings["serialization_id_patches"]);
			this.#individualSerializationIdPatches = new Map(serializationIdPatches.filter(([serializationId]) => !serializationId.startsWith("/") && !serializationId.endsWith("/")));
			this.#serializationIdPatternPatches = serializationIdPatches.filter(([pattern]) => pattern.startsWith("/") && pattern.endsWith("/")).map(([pattern, serializationId]) => [new RegExp(pattern.slice(1, -1), "g"), serializationId]);
			this.#blocksMissingSerializationIds = materialListMappings["blocks_missing_serialization_ids"];
			this.#translationPatches = materialListMappings["translation_patches"];
			
			return this;
		})();
	}
	/**
	 * Adds a block to the material list.
	 * @param {String|Block} block
	 * @param {Number} [count]
	 */
	add(block, count = 1) {
		let blockName = typeof block == "string"? block : block["name"];
		if(this.#ignoredBlocks.includes(blockName)) {
			return;
		}
		let itemName = this.#individualBlockToItemMappings.get(blockName);
		if(!itemName) {
			let matchingPatternAndReplacement = this.#blockToItemPatternMappings.find(([pattern]) => pattern.test(blockName));
			if(matchingPatternAndReplacement) {
				itemName = blockName.replaceAll(...matchingPatternAndReplacement);
			} else {
				itemName = blockName;
			}
		}
		this.#itemCountMultipliers.forEach(([itemNames, patterns, multiplier, substringToRemove]) => {
			if(itemNames.includes(itemName) || patterns.some(pattern => pattern.test(itemName))) {
				count *= multiplier;
				if(substringToRemove != "") {
					itemName = itemName.replaceAll(substringToRemove, "");
				}
			}
		});
		if(itemName in this.#specialBlockEntityProperties && typeof block != "string") {
			let blockEntityProperty = this.#specialBlockEntityProperties[itemName]["prop"];
			if(blockEntityProperty in (block["block_entity_data"] ?? {})) {
				itemName += `+${block["block_entity_data"][blockEntityProperty]}`;
			} else {
				console.error(`Cannot find block entity property ${blockEntityProperty} on block ${block["name"]}!`);
			}
		}
		this.materials.set(itemName, (this.materials.get(itemName) ?? 0) + count);
		this.totalMaterialCount += count;
	}
	/**
	 * Adds an item to the material list.
	 * @param {String} itemName
	 * @param {Number} [count]
	 */
	addItem(itemName, count = 1) {
		this.materials.set(itemName, (this.materials.get(itemName) ?? 0) + count);
		this.totalMaterialCount += count;
	}
	/**
	 * Exports the material list for proper usage.
	 * @returns {Array<MaterialListEntry>}
	 */
	export() {
		if(this.#translations == undefined) {
			throw new Error("Cannot export a material list without providing translations! Use setLanguage()");
		}
		return [...this.materials].map(([itemName, count]) => {
			let serializationId;
			let blockEntityPropertyValue;
			if(itemName.includes("+")) {
				let match = itemName.match(/^([^+]+)\+(\d+)$/);
				itemName = match[1];
				blockEntityPropertyValue = +match[2];
				serializationId = this.#specialBlockEntityProperties[itemName]["serialization_ids"]?.[blockEntityPropertyValue];
			}
			// try item translation key; if that doesn't work, try block translation key
			serializationId ??= this.#blocksMissingSerializationIds[itemName] ?? this.#findItemSerializationId(itemName);
			let translatedName = serializationId && this.#translate(serializationId);
			if(!translatedName) {
				let blockSerializationId = this.#findBlockSerializationId(itemName);
				translatedName = blockSerializationId && this.#translate(blockSerializationId);
				if(translatedName) {
					serializationId = blockSerializationId;
				} else {
					if(!serializationId && !blockSerializationId) {
						console.warn(`Cannot find any translation key for ${itemName}!`);
					} else {
						console.warn(`Cannot translate ${[serializationId, blockSerializationId].removeFalsies().join(" or ")} for item "${itemName}"!`);
					}
					serializationId ??= blockSerializationId ?? itemName;
					translatedName = serializationId;
				}
			}
			let auxId = this.#findItemAuxId(itemName) ?? this.#findBlockAuxId(itemName); // this is used in the material list UI, so we prefer the item id
			if(typeof auxId == "number" && typeof blockEntityPropertyValue == "number") {
				auxId += blockEntityPropertyValue;
			}
			return {
				itemName,
				translationKey: this.#serializationIdToTranslationKey(serializationId),
				translatedName,
				count,
				partitionedCount: this.#partitionCount(count),
				auxId
			};
		}).sort((a, b) => b.count - a.count || a.translatedName > b.translatedName);
	}
	/**
	 * Sets the language of the material list for exporting.
	 * @param {String} translations The text contents of a `.lang` file
	 */
	setLanguage(translations) {
		this.#translations = new Map();
		translations.split("\n").forEach(line => {
			let hashI = line.indexOf("#");
			if(hashI > -1) {
				line = line.slice(0, hashI);
			}
			line = line.trim();
			if(line == "") {
				return;
			}
			let eqI = line.indexOf("=");
			this.#translations.set(line.slice(0, eqI), line.slice(eqI + 1));
		});
	}
	/**
	 * Clears the material list.
	 */
	clear() {
		this.materials.clear();
		this.totalMaterialCount = 0;
	}
	/**
	 * Finds an item serialization id.
	 * @param {String} itemName
	 * @returns {String}
	 */
	#findItemSerializationId(itemName) {
		return this.#itemMetadata.get(`minecraft:${itemName}`)?.["serialization_id"];
	}
	/**
	 * Finds a block serialization id.
	 * @param {String} blockName
	 * @returns {String}
	 */
	#findBlockSerializationId(blockName) {
		return this.#blockMetadata.get(`minecraft:${blockName}`)?.["serialization_id"];
	}
	/**
	 * Converts a serialisation id into a translation key, also applying a patch if required.
	 * @param {String} serializationId
	 * @returns {String}
	 */
	#serializationIdToTranslationKey(serializationId) {
		if(this.#individualSerializationIdPatches.has(serializationId)) {
			serializationId = this.#individualSerializationIdPatches.get(serializationId);
		} else {
			let matchingPatternAndReplacement = this.#serializationIdPatternPatches.find(([pattern]) => pattern.test(serializationId));
			if(matchingPatternAndReplacement) {
				serializationId = serializationId.replaceAll(...matchingPatternAndReplacement);
			}
		}
		return serializationId.endsWith(".name")? serializationId : `${serializationId}.name`; // apple, breeze rod, trial keys, warped fungus on a stick, and wind charges end with .name already smh :/
	}
	/**
	 * Translates a given serialisation id.
	 * @param {String} serializationId
	 * @returns {String}
	 */
	#translate(serializationId) {
		let translationKey = this.#serializationIdToTranslationKey(serializationId);
		return this.#translationPatches[translationKey] ?? this.#translations.get(translationKey);
	}
	/**
	 * Partitions a number of items into how many boxes and stacks it is.
	 * @param {Number} count E.g. 100
	 * @returns {String} E.g. 1s + 36
	 */
	#partitionCount(count) {
		if(count < 64) {
			return String(count);
		} else {
			let parts = [[floor(count / 1728), "\uE200"], [floor(count / 64) % 27, "s"], [count % 64, ""]].filter(([n]) => n).map(x => x.join(""));
			return `${count} = ${parts.join(" + ")}`; // a custom shulker box emoji (taken from OreUI files) is defined in font/glyph_E2.png
		}
	}
	/**
	 * Finds the aux id for an item.
	 * @param {String} itemName
	 * @returns {Number|undefined}
	 */
	#findItemAuxId(itemName) {
		return nanToUndefined(this.#itemMetadata.get(`minecraft:${itemName}`)?.["raw_id"] * 65536); // undefined * 65536 = NaN, which breaks optional chaining
	}
	/**
	 * Finds the aux id for a block.
	 * @param {String} blockName
	 * @returns {Number|undefined}
	 */
	#findBlockAuxId(blockName) {
		return nanToUndefined(this.#blockMetadata.get(`minecraft:${blockName}`)?.["raw_id"] * 65536);
	}
}

/**
 * @typedef {import("./HoloPrint.js").MaterialListEntry} MaterialListEntry
 */
/**
 * @typedef {import("./BlockGeoMaker.js").Block} Block
 */