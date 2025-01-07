import { floor, nanToUndefined } from "./essential.js";

export default class MaterialList {
	static #ignoredBlocks = ["flowing_water", "flowing_lava"]; // these don't appear to be used anymore
	/** Blocks that have a different item or item ID. */
	static #blockToItemIDS = {
		"unpowered_repeater": "repeater",
		"powered_repeater": "repeater",
		"unpowered_comparator": "comparator",
		"powered_comparator": "comparator",
		"redstone_wire": "redstone",
		"unlit_redstone_torch": "redstone_torch",
		"water": "water_bucket",
		"lava": "lava_bucket",
		"powder_snow": "powder_snow_bucket",
		"lit_furnace": "furnace",
		"lit_blast_furnace": "blast_furnace",
		"lit_smoker": "smoker",
		"lit_redstone_ore": "redstone_ore",
		"lit_deepslate_redstone_ore": "deepslate_redstone_ore",
		"lit_redstone_lamp": "redstone_lamp",
		"melon_stem": "melon_seeds",
		"pumpkin_stem": "pumpkin_seeds", // this one actually exists in the translation files as "Pumpkin Stem"; however, leaving it would break consistency with everything else
		"pitcher_crop": "pitcher_pod",
		"torchflower_crop": "torchflower_seeds",
		"wheat": "wheat_seeds",
		"potatoes": "potato",
		"carrots": "carrot",
		"wall_sign": "oak_sign",
		"spruce_wall_sign": "spruce_sign",
		"birch_wall_sign": "birch_sign",
		"jungle_wall_sign": "jungle_sign",
		"acacia_wall_sign": "acacia_sign",
		"darkoak_wall_sign": "dark_oak_sign",
		"mangrove_wall_sign": "mangrove_sign",
		"mangrove_standing_sign": "mangrove_sign",
		"bamboo_wall_sign": "bamboo_sign",
		"bamboo_standing_sign": "bamboo_sign",
		"cherry_wall_sign": "cherry_sign",
		"cherry_standing_sign": "cherry_sign",
		"pale_oak_wall_sign": "pale_oak_sign",
		"pale_oak_standing_sign": "pale_oak_sign",
		"bamboo_sapling": "bamboo",
		"trip_wire": "string",
		"cocoa": "cocoa_beans",
		"wall_banner": "standing_banner",
		"cave_vines": "glow_berries",
		"cave_vines_body_with_berries": "glow_berries",
		"cave_vines_head_with_berries": "glow_berries"
	};
	/** @type {Array<[String|RegExp, Number, [String]]>} If item names match, item counts will be multiplied (and optionally, parts of the item name will be removed). */
	static #itemCountMultipliers = [
		[/double_.*slab$/, 2, "double_"],
		[/_door$/, 0.5],
		["peony,rose_bush,sunflower,lilac,large_fern,tall_grass", 0.5]
	];
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
		"item.powder_snow_bucket": "item.bucketPowderSnow",
		"tile.wall_banner": "tile.standing_banner",
		"tile.daylight_detector_inverted": "tile.daylight_detector",
		"tile.tube_coral_wall_fan": "tile.coral_fan.blue_fan.name",
		"tile.brain_coral_wall_fan": "tile.coral_fan.pink_fan.name",
		"tile.bubble_coral_wall_fan": "tile.coral_fan.purple_fan.name",
		"tile.fire_coral_wall_fan": "tile.coral_fan.red_fan.name",
		"tile.horn_coral_wall_fan": "tile.coral_fan.yellow_fan.name",
		"tile.dead_tube_coral_wall_fan": "tile.coral_fan_dead.blue_fan.name",
		"tile.dead_brain_coral_wall_fan": "tile.coral_fan_dead.pink_fan.name",
		"tile.dead_bubble_coral_wall_fan": "tile.coral_fan_dead.purple_fan.name",
		"tile.dead_fire_coral_wall_fan": "tile.coral_fan_dead.red_fan.name",
		"tile.dead_horn_coral_wall_fan": "tile.coral_fan_dead.yellow_fan.name",
		"tile.seagrass": "tile.seagrass.seagrass", // least surprising bugrock moment
		"item.creeper_head": "item.skull.creeper",
		"item.dragon_head": "item.skull.dragon",
		"item.piglin_head": "item.skull.piglin",
		"item.player_head": "item.skull.player",
		"item.skeleton_skull": "item.skull.skeleton",
		"item.wither_skeleton_skull": "item.skull.wither",
		"item.zombie_head": "item.skull.zombie",
		"item.cocoa_beans": "item.dye.brown"
	};
	static #blockSerializationIdPatches = {
		"end_gateway": "tile.end_gateway" // despite still existing, end gateways were removed from mojang-blocks.json in 1.21.50...
	};
	/** Translations that JUST DON'T EXIST because Bugrock :/ */
	static #translationPatches = {
		"tile.end_portal.name": "End Portal",
		"tile.end_gateway.name": "End Gateway"
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
			line = line.trim();
			if(line == "") {
				return;
			}
			let eqI = line.indexOf("=");
			this.#translations.set(line.slice(0, eqI), line.slice(eqI + 1));
		});
	}
	/**
	 * Adds a block to the material list.
	 * @param {String} blockName
	 * @param {Number} [count]
	 */
	add(blockName, count = 1) {
		if(MaterialList.#ignoredBlocks.includes(blockName)) {
			return;
		}
		let itemName = MaterialList.#blockToItemIDS[blockName] ?? blockName;
		MaterialList.#itemCountMultipliers.forEach(([pattern, multiplier, replacement]) => {
			if(pattern instanceof RegExp && pattern.test(itemName) || typeof pattern == "string" && pattern.split(",").includes(itemName)) {
				count *= multiplier;
				if(replacement) {
					itemName = itemName.replaceAll(replacement, "");
				}
			}
		});
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
		return [...this.materials].sort((a, b) => b[1] - a[1]).map(([itemName, count]) => {
			// try item translation key; if that doesn't work, try block translation key
			let serializationId = MaterialList.#blockSerializationIdPatches[itemName] ?? this.#findItemSerializationId(itemName);
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
		return MaterialList.#translationPatches[translationKey] ?? this.#translations.get(translationKey);
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

/**
 * @typedef {import("./HoloPrint.js").MaterialListEntry} MaterialListEntry
 */