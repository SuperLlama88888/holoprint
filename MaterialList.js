/**
 * The entry of a material list
 * @typedef {Object} MaterialListEntry
 * @property {String} itemName
 * @property {String} translationKey
 * @property {String} translatedName
 * @property {Number} count How many of this item is required
 * @property {String} partitionedCount A formatted string representing partitions of the total count
 * @property {Number} auxId The item's aux ID
 */

import { floor, nanToUndefined } from "./essential.js";

export default class MaterialList {
	/** Blocks that have a different item or item ID. */
	static #blockToItemIDS = {
		"unpowered_repeater": "repeater",
		"powered_repeater": "repeater",
		"unpowered_comparator": "comparator",
		"powered_comparator": "comparator",
		"redstone_wire": "redstone",
		"unlit_redstone_torch": "redstone_torch",
		"water": "water_bucket",
		"flowing_water": "water_bucket",
		"lava": "lava_bucket",
		"flowing_lava": "lava_bucket",
		"powder_snow": "powder_snow_bucket",
		"lit_furnace": "furnace",
		"lit_blast_furnace": "blast_furnace",
		"lit_smoker": "smoker",
		"lit_redstone_ore": "redstone_ore",
		"lit_deepslate_redstone_ore": "deepslate_redstone_ore",
		"lit_redstone_lamp": "redstone_lamp",
		"melon_stem": "melon_seeds",
		"wall_sign": "oak_sign"
	};
	/** Remappings for serialization_ids mapping to the wrong things in .lang files */
	static #serializationIdPatches = {
		"tile.oak_planks": "tile.planks.oak",
		"tile.spruce_planks": "tile.planks.spruce",
		"tile.birch_planks": "tile.planks.birch",
		"tile.jungle_planks": "tile.planks.jungle",
		"tile.acacia_planks": "tile.planks.acacia",
		"tile.dark_oak_planks": "tile.planks.big_oak",
		"tile.oak_fence": "tile.fence",
		"tile.spruce_fence": "tile.spruceFence",
		"tile.birch_fence": "tile.birchFence",
		"tile.jungle_fence": "tile.jungleFence",
		"tile.acacia_fence": "tile.acaciaFence",
		"tile.dark_oak_fence": "tile.darkOakFence",
		"item.water_bucket": "item.bucketWater",
		"item.lava_bucket": "item.bucketLava",
		"tile.wall_banner": "tile.standing_banner",
		"tile.daylight_detector_inverted": "tile.daylight_detector"
	};
	
	materials;
	totalMaterialCount;
	
	#blockMetadata;
	#itemMetadata;
	#translations;
	
	/**
	 * Creates a material list manager to count a list of items.
	 * @param {Object} blockMetadata `Mojang/bedrock-samples/metadata/vanilladata_modules/mojang-blocks.json`
	 * @param {Object} itemMetadata `Mojang/bedrock-samples/metadata/vanilladata_modules/mojang-items.json`
	 * @param {String} translations The text contents of a `.lang` file
	 */
	constructor(blockMetadata, itemMetadata, translations) {
		this.materials = new Map();
		
		this.totalMaterialCount = 0;
		
		this.#blockMetadata = new Map(blockMetadata["data_items"].map(block => [block["name"], block]));
		this.#itemMetadata = new Map(itemMetadata["data_items"].map(item => [item["name"], item]));
		this.#translations = new Map();
		translations.split("\n").forEach(line => {
			let hashI = line.indexOf("#");
			if(hashI > -1) {
				line = line.slice(0, hashI);
			}
			if(line.trim() == "") {
				return;
			}
			let eqI = line.indexOf("=");
			this.#translations.set(line.slice(0, eqI), line.slice(eqI + 1));
		});
	}
	/**
	 * Adds a material to the material list.
	 * @param {String} blockName
	 * @param {Number} count
	 */
	add(blockName, count = 1) {
		let itemName = MaterialList.#blockToItemIDS[blockName] ?? blockName;
		if(/double_.*slab$/.test(itemName)) {
			itemName = itemName.replace("double_", "");
			count *= 2;
		}
		this.materials.set(itemName, (this.materials.get(itemName) ?? 0) + count);
		this.totalMaterialCount += count;
	}
	/**
	 * Exports the material list for proper usage.
	 * @returns {Array<MaterialListEntry>}
	 */
	export() {
		return [...this.materials].sort((a, b) => b[1] - a[1]).map(([itemName, count]) => {
			// try item translation key; if that doesn't work, try block translation key
			let serializationId = this.#findItemSerializationId(itemName);
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
						console.warn(`Cannot translate ${[serializationId, blockSerializationId].filter(x => x).join(" or ")} for item "${itemName}"!`);
					}
					serializationId ??= blockSerializationId ?? itemName;
					translatedName = serializationId;
				}
			}
			return {
				itemName,
				translationKey: this.#serializationIdToTranslationKey(serializationId),
				translatedName,
				count: count,
				partitionedCount: this.#partitionCount(count),
				auxId: this.#findItemAuxId(itemName) ?? this.#findBlockAuxId(itemName) // this is used in the material list UI, so we prefer the item id
			};
		});
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
	 * Converts a serialisation id into a translation key.
	 * @param {String} serializationId
	 * @returns {String}
	 */
	#serializationIdToTranslationKey(serializationId) {
		if(serializationId in MaterialList.#serializationIdPatches) {
			serializationId = MaterialList.#serializationIdPatches[serializationId];
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
		return this.#translations.get(translationKey);
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
			let parts = [[floor(count / 1728), "b"], [floor(count / 64) % 27, "s"], [count % 64, ""]].filter(([n]) => n).map(x => x.join(""));
			return `${count} = ${parts.join(" + ")}`;
		}
	}
	#findItemAuxId(itemName) {
		return nanToUndefined(this.#itemMetadata.get(`minecraft:${itemName}`)?.["raw_id"] * 65536); // undefined * 65536 = NaN, which breaks optional chaining
	}
	#findBlockAuxId(blockName) {
		return nanToUndefined(this.#blockMetadata.get(`minecraft:${blockName}`)?.["raw_id"] * 65536);
	}
}