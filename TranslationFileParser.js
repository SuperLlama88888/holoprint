export default class TranslationFileParser {
	static TRANSLATION_KEY_REMAPPINGS = { // Often when the block is different from the item
		"tile.powered_repeater.name": "item.repeater.name",
		"tile.unpowered_repeater.name": "item.repeater.name",
		"tile.powered_comparator.name": "item.comparator.name",
		"tile.unpowered_comparator.name": "item.comparator.name",
		"tile.grass_block.name": "tile.grass.name"
	};
	
	translations;
	vanillaBlockData;
	vanillaItemData;
	
	/**
	 * Creates a translation file parser.
	 * @param {ResourcePackStack} resourcePackStack
	 * @param {String} translationFile
	 */
	constructor(resourcePackStack, translationFile) {
		return (async () => {
			// 1.21.30.21 added serialisation IDs to these metadata files, so we can use them to get the block names. I didn't notice them being added and assumed they were always in there!
			let blockMetadataPromise = resourcePackStack.fetchData("metadata/vanilladata_modules/mojang-blocks.json").then(res => res.json());
			let itemMetadataPromise = resourcePackStack.fetchData("metadata/vanilladata_modules/mojang-items.json").then(res => res.json());
			this.translations = {};
			translationFile.replaceAll(/\t*#.*/g, "").split("\n").filter(line => line).forEach(line => { // this is probably super slow and memory intensive
				let eq = line.indexOf("=");
				this.translations[line.slice(0, eq)] = line.slice(eq + 1);
			});
			this.vanillaBlockData = {};
			(await blockMetadataPromise)["data_items"].forEach(block => { // yes, it's also data_items here
				this.vanillaBlockData[block["name"]] = block;
			});
			this.vanillaItemData = {};
			(await itemMetadataPromise)["data_items"].forEach(item => {
				this.vanillaItemData[item["name"]] = item;
			});
			
			return this;
		})();
	}
	getBlockName(blockName) {
		let blockSerialisationId = this.vanillaBlockData[`minecraft:${blockName}`]?.["serialization_id"];
		let itemSerialisationId = this.vanillaItemData[`minecraft:${blockName}`]?.["serialization_id"];
		if(!blockSerialisationId && !itemSerialisationId) {
			console.warn(`Couldn't find serialisation ID for block ${blockName}!`);
			return blockName;
		}
		let blockTranslation = blockSerialisationId && this.#getTranslation(`${blockSerialisationId}.name`);
		if(blockTranslation) {
			return blockTranslation;
		} else {
			let itemTranslationKey = itemSerialisationId && (itemSerialisationId.endsWith(".name")? itemSerialisationId : `${itemSerialisationId}.name`); // apple, breeze rod, trial keys, warped fungus on a stick, and wind charges end with .name already smh :/
			let itemTranslation = itemSerialisationId && this.#getTranslation(itemTranslationKey);
			if(itemTranslation) {
				return itemTranslation;
			} else {
				console.warn(`Couldn't retrieve translation from serialisation ID ${[blockSerialisationId, itemSerialisationId].filter(x => x).join(" or ")} for block ${blockName}`);
				return blockName;
			}
		}
	}
	#getTranslation(translationKey) {
		if(translationKey in TranslationFileParser.TRANSLATION_KEY_REMAPPINGS) {
			translationKey = TranslationFileParser.TRANSLATION_KEY_REMAPPINGS[translationKey];
		}
		return this.translations[translationKey];
	}
}