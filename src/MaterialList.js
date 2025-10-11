import { floor, nanToUndefined, PatternMap, removeFalsies, ReplacingPatternMap, tuple } from "./utils.js";

export default class MaterialList {
	/** @type {Map<string, number>} */
	materials = new Map();
	totalMaterialCount = 0;
	
	#blockMetadata;
	#itemMetadata;
	#translations;
	
	// I wish I could use import...with to import these from materialListMappings.json, which would have worked with esbuild, but it doesn't let me load JSONC... sad...
	#ignoredBlocks;
	#blockToItemMappings;
	#itemCountMultipliers;
	#specialBlockEntityProperties;
	#serializationIdPatches;
	#blocksMissingSerializationIds;
	#translationPatches;
	
	/**
	 * Creates a material list manager to count a list of items.
	 * @param {object} blockMetadata `Mojang/bedrock-samples/metadata/vanilladata_modules/mojang-blocks.json`
	 * @param {object} itemMetadata `Mojang/bedrock-samples/metadata/vanilladata_modules/mojang-items.json`
	 * @param {Data.MaterialListMappings} materialListMappings
	 * @param {string} [translations] The text contents of a `.lang` file
	 */
	constructor(blockMetadata, itemMetadata, materialListMappings, translations) {
		this.#blockMetadata = new Map(blockMetadata["data_items"].map(block => [block["name"], block]));
		this.#itemMetadata = new Map(itemMetadata["data_items"].map(item => [item["name"], item]));
		this.#ignoredBlocks = materialListMappings["ignored_blocks"];
		this.#blockToItemMappings = new ReplacingPatternMap(Object.entries(materialListMappings["block_to_item_mappings"]));
		this.#itemCountMultipliers = new PatternMap(Object.entries(materialListMappings["item_count_multipliers"]).map(([key, value]) => {
			if(typeof value == "number") {
				return [key, tuple([value, ""])];
			} else {
				return [key, tuple([value["multiplier"], value["remove"]])];
			}
		}));
		this.#specialBlockEntityProperties = materialListMappings["special_block_entity_properties"];
		let serializationIdPatches = Object.entries(materialListMappings["serialization_id_patches"]);
		this.#serializationIdPatches = new ReplacingPatternMap(serializationIdPatches);
		this.#blocksMissingSerializationIds = materialListMappings["blocks_missing_serialization_ids"];
		this.#translationPatches = materialListMappings["translation_patches"];
		
		if(translations) {
			this.setLanguage(translations);
		}
	}
	/**
	 * Adds a block to the material list.
	 * @param {string | Block} block
	 * @param {number} [count]
	 */
	add(block, count = 1) {
		let blockName = typeof block == "string"? block : block["name"];
		if(this.#ignoredBlocks.includes(blockName)) {
			return;
		}
		let itemName = this.#blockToItemMappings.get(blockName) ?? blockName;
		let multiplierMatch = this.#itemCountMultipliers.get(itemName);
		if(multiplierMatch) {
			let [multiplier, substringToRemove] = multiplierMatch;
			count *= multiplier;
			if(substringToRemove) {
				itemName = itemName.replaceAll(substringToRemove, "");
			}
		}
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
	 * @param {string} itemName
	 * @param {number} [count]
	 */
	addItem(itemName, count = 1) {
		this.materials.set(itemName, (this.materials.get(itemName) ?? 0) + count);
		this.totalMaterialCount += count;
	}
	/**
	 * Exports the material list for proper usage.
	 * @returns {MaterialListEntry[]}
	 */
	export() {
		if(this.#translations == undefined) {
			throw new Error("Cannot export a material list without providing translations! Use setLanguage()");
		}
		return Array.from(this.materials).map(([itemName, count]) => {
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
						console.warn(`Cannot translate ${removeFalsies([serializationId, blockSerializationId]).join(" or ")} for item "${itemName}"!`);
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
		}).sort((a, b) => b.count - a.count || +(a.translatedName > b.translatedName));
	}
	/**
	 * Sets the language of the material list for exporting.
	 * @param {string} translations The text contents of a `.lang` file
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
	/** Clears the material list. */
	clear() {
		this.materials.clear();
		this.totalMaterialCount = 0;
	}
	/**
	 * Finds an item serialization id.
	 * @param {string} itemName
	 * @returns {string}
	 */
	#findItemSerializationId(itemName) {
		return this.#itemMetadata.get(`minecraft:${itemName}`)?.["serialization_id"];
	}
	/**
	 * Finds a block serialization id.
	 * @param {string} blockName
	 * @returns {string}
	 */
	#findBlockSerializationId(blockName) {
		return this.#blockMetadata.get(`minecraft:${blockName}`)?.["serialization_id"];
	}
	/**
	 * Converts a serialisation id into a translation key, also applying a patch if required.
	 * @param {string} serializationId
	 * @returns {string}
	 */
	#serializationIdToTranslationKey(serializationId) {
		serializationId = this.#serializationIdPatches.get(serializationId) ?? serializationId;
		return serializationId.endsWith(".name")? serializationId : `${serializationId}.name`; // apple, breeze rod, trial keys, warped fungus on a stick, and wind charges end with .name already smh :/
	}
	/**
	 * Translates a given serialisation id.
	 * @param {string} serializationId
	 * @returns {string}
	 */
	#translate(serializationId) {
		let translationKey = this.#serializationIdToTranslationKey(serializationId);
		return this.#translationPatches[translationKey] ?? this.#translations.get(translationKey);
	}
	/**
	 * Partitions a number of items into how many boxes and stacks it is.
	 * @param {number} count E.g. 100
	 * @returns {string} E.g. 1s + 36
	 */
	#partitionCount(count) {
		if(count < 64) {
			return count.toString();
		} else {
			let parts = [[floor(count / 1728), "\uE200"], [floor(count / 64) % 27, "s"], [count % 64, ""]].filter(([n]) => n).map(x => x.join(""));
			return `${count} = ${parts.join(" + ")}`; // a custom shulker box emoji (taken from OreUI files) is defined in font/glyph_E2.png
		}
	}
	/**
	 * Finds the aux id for an item.
	 * @param {string} itemName
	 * @returns {number | undefined}
	 */
	#findItemAuxId(itemName) {
		return nanToUndefined(this.#itemMetadata.get(`minecraft:${itemName}`)?.["raw_id"] * 65536); // undefined * 65536 = NaN, which breaks optional chaining
	}
	/**
	 * Finds the aux id for a block.
	 * @param {string} blockName
	 * @returns {number | undefined}
	 */
	#findBlockAuxId(blockName) {
		return nanToUndefined(this.#blockMetadata.get(`minecraft:${blockName}`)?.["raw_id"] * 65536);
	}
}

/** @import { MaterialListEntry, Block } from "./HoloPrint.js" */
/** @import * as Data from "./data/schemas" */