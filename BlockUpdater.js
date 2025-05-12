// Updates a block from older MCBE versions, using schemas from pmmp/BedrockBlockUpgradeSchema. This code was made with reference to https://github.com/pmmp/PocketMine-MP/blob/5.21.0/src/data/bedrock/block/upgrade/BlockStateUpgrader.php and https://github.com/RaphiMC/ViaBedrock/blob/main/src/main/java/net/raphimc/viabedrock/api/chunk/blockstate/JsonBlockStateUpgradeSchema.java.

import { CachingFetcher } from "./essential.js";

export default class BlockUpdater {
	static LATEST_VERSION = 18168865; // 1.21.60.33 (1.21.61)
	static #UPGRADE_SCHEMA_URL = "https://cdn.jsdelivr.net/gh/SuperLlama88888/BedrockBlockUpgradeSchema";
	static #UPGRADE_SCHEMA_VERSION = "5.1.0+bedrock-1.21.60"; // specifically, the tag name
	
	#fetcher;
	/** @type {Record<String, Array<BlockUpdateSchemaSkeleton>>} */
	#schemaIndex;
	/** @type {Map<String, BlockUpdateSchema>} */
	#schemas;
	
	/**
	 * Creates a BlockUpdater to update older blocks to the latest MCBE version.
	 */
	constructor() {
		this.#fetcher = new CachingFetcher(`BlockUpgrader@${BlockUpdater.#UPGRADE_SCHEMA_VERSION}`, `${BlockUpdater.#UPGRADE_SCHEMA_URL}@${BlockUpdater.#UPGRADE_SCHEMA_VERSION}/`);
		this.#schemaIndex = {};
		this.#schemas = new Map();
	}
	/**
	 * Checks if a block needs updating to the latest Minecraft version.
	 * @param {NBTBlock} block
	 * @returns {Boolean}
	 */
	blockNeedsUpdating(block) {
		return block["version"] < BlockUpdater.LATEST_VERSION;
	}
	/**
	 * Upgrades a block from older Minecraft versions to the latest Minecraft version.
	 * @mutating
	 * @param {NBTBlock} block
	 * @returns {Promise<Boolean>} Whether or not the block was updated. (The version number will always be updated.)
	 */
	async update(block) {
		let oldBlockStringified = BlockUpdater.stringifyBlock(block);
		if(this.#fetcher instanceof Promise) {
			this.#fetcher = await this.#fetcher;
		}
		if(Object.keys(this.#schemaIndex).length == 0) {
			let schemaList = await this.#fetcher.fetch("schema_list.json").then(res => res.json());
			schemaList.forEach(schemaSkeleton => {
				let schemaVersion = this.#getSchemaVersion(schemaSkeleton);
				this.#schemaIndex[schemaVersion] ??= [];
				this.#schemaIndex[schemaVersion].push(schemaSkeleton);
			});
		}
		let schemasToApply = [];
		Object.entries(this.#schemaIndex).forEach(([version, schemaSkeletons]) => {
			if(block["version"] > version || schemaSkeletons.length == 1 && block["version"] == version) {
				return;
			}
			schemasToApply.push(...schemaSkeletons.map(schemaSkeleton => schemaSkeleton.filename));
		});
		await Promise.all(schemasToApply.map(async schemaFilename => {
			if(!this.#schemas.has(schemaFilename)) {
				this.#schemas.set(schemaFilename, await this.#fetcher.fetch(`nbt_upgrade_schema/${schemaFilename}`).then(res => res.json()));
			}
		}));
		let updated = false;
		schemasToApply.forEach(schemaFileName => {
			let schema = this.#schemas.get(schemaFileName);
			if(this.#applyUpdateSchema(schema, block)) {
				updated = true;
			}
		});
		block["version"] = BlockUpdater.LATEST_VERSION;
		if(updated) {
			console.debug(`Updated ${oldBlockStringified} to ${BlockUpdater.stringifyBlock(block)}`);
		}
		return updated;
	}
	/**
	 * Applies a schema to a block.
	 * @mutating
	 * @param {BlockUpdateSchema} schema
	 * @param {NBTBlock} block
	 * @returns {Boolean} Whether or not the block changed between versions. (The version number will always be updated, unless it encountered an error.)
	 */
	#applyUpdateSchema(schema, block) {
		let schemaVersion = this.#getSchemaVersion(schema);
		if(block["version"] > schemaVersion) {
			console.error(`Trying to upgrade block from ${block["version"]} to ${schemaVersion}!`);
			return;
		}
		if(block["name"] in (schema["flattenedProperties"] ?? {}) && block["name"] in (schema["renamedIds"] ?? {})) {
			console.error(`Cannot flatten and rename block ${block["name"]} at the same time: ${JSON.stringify(schema)}`);
			return;
		}
		
		// remap block states: when the values change and, in some cases, the block name
		if(schema["remappedStates"]?.[block["name"]]?.some(remappedState => {
			let statesToMatch = remappedState["oldState"];
			if(statesToMatch != null) { // if there are states to match, all states in "oldState" must be the same in the current block states
				if(Object.keys(statesToMatch).length > Object.keys(block["states"]).length) {
					return;
				}
				for(let [blockStateName, blockStateValueProperty] of Object.entries(statesToMatch)) {
					if(!(blockStateName in block["states"])) {
						return;
					}
					let blockStateValue = this.#readBlockStateProperty(blockStateValueProperty);
					if(blockStateValue != block["states"][blockStateName]) {
						return;
					}
				}
			}
			if("newName" in remappedState) {
				block["name"] = remappedState["newName"];
			} else {
				this.#applyFlattenedProperty(remappedState["newFlattenedName"], block);
			}
			let newStates = Object.fromEntries(Object.entries(remappedState["newState"] ?? {}).map(([blockStateName, blockStateValueProperty]) => [blockStateName, this.#readBlockStateProperty(blockStateValueProperty)]));
			remappedState["copiedState"]?.forEach(blockStateName => {
				if(blockStateName in block["states"]) {
					newStates[blockStateName] = block["states"][blockStateName];
				}
			});
			block["states"] = newStates;
			return true; // if states are remapped, there's no need to look at the rest of the schema
		})) {
			block["version"] = schemaVersion;
			return true;
		}
		
		let hasBeenUpdated = false;
		// added properties: add block states and values
		Object.entries(schema["addedProperties"]?.[block["name"]] ?? {}).forEach(([blockStateName, blockStateProperty]) => {
			let blockStateValue = this.#readBlockStateProperty(blockStateProperty);
			if(blockStateName in block["states"]) {
				console.debug(`Cannot add block state ${blockStateName} = ${blockStateValue} because it already exists on block ${BlockUpdater.stringifyBlock(block)}`);
				return;
			}
			block["states"][blockStateName] = blockStateValue;
			hasBeenUpdated = true;
		});
		// removed properties: remove block states
		schema["removedProperties"]?.[block["name"]]?.forEach(blockStateName => {
			if(!(blockStateName in block["states"])) {
				console.debug(`Cannot delete block state ${blockStateName} because it doesn't exist on block ${BlockUpdater.stringifyBlock(block)}`);
				return;
			}
			delete block["states"][blockStateName];
			hasBeenUpdated = true;
		});
		// remapped property values: change block state values
		Object.entries(schema["remappedPropertyValues"]?.[block["name"]] ?? {}).forEach(([blockStateName, remappingName]) => {
			if(!(blockStateName in block["states"])) {
				console.debug(`Cannot remap value for block state ${blockStateName} because the state doesn't exist: ${BlockUpdater.stringifyBlock(block)}`);
				return;
			}
			let currentBlockStateValue = block["states"][blockStateName];
			if(!(remappingName in schema["remappedPropertyValuesIndex"])) {
				console.debug(`Block state value remapping ${remappingName} not found in schema!`);
				return;
			}
			let remappings = schema["remappedPropertyValuesIndex"][remappingName];
			let remapping = remappings.find(remapping => currentBlockStateValue == this.#readBlockStateProperty(remapping["old"]));
			if(remapping == undefined) {
				console.debug(`Cannot find block state value ${currentBlockStateValue} in remappings for block state ${blockStateName}: ${JSON.stringify(remappings)}`);
				return;
			}
			block["states"][blockStateName] = this.#readBlockStateProperty(remapping["new"]);
			hasBeenUpdated = true;
		});
		// renamed properties: rename block states
		Object.entries(schema["renamedProperties"]?.[block["name"]] ?? {}).forEach(([oldStateName, newStateName]) => {
			if(!(oldStateName in block["states"])) {
				console.debug(`Cannot rename block state ${oldStateName} -> ${newStateName} because it doesn't exist on block ${BlockUpdater.stringifyBlock(block)}`);
				return;
			}
			block["states"][newStateName] = block["states"][oldStateName];
			delete block["states"][oldStateName];
			hasBeenUpdated = true;
		});
		// flattened properties: property value determines new block name
		if(block["name"] in (schema["flattenedProperties"] ?? {})) {
			if(this.#applyFlattenedProperty(schema["flattenedProperties"][block["name"]], block)) { // this actually does stuff but it returns false if there was an error
				hasBeenUpdated = true;
			}
		}
		// renamed ids: block name changes
		if(block["name"] in (schema["renamedIds"] ?? {})) {
			block["name"] = schema["renamedIds"][block["name"]];
			hasBeenUpdated = true;
		}
		block["version"] = schemaVersion;
		return hasBeenUpdated;
	}
	/**
	 * Flattens a block state to find the new block name for a block.
	 * @mutating
	 * @param {BlockUpdateSchemaFlattenRule} flattenRule
	 * @param {NBTBlock} block
	 * @returns {Boolean} If the block state was successfully flattened
	 */
	#applyFlattenedProperty(flattenRule, block) {
		let blockStateName = flattenRule["flattenedProperty"];
		if(!(blockStateName in block["states"])) {
			console.debug(`Cannot flatten block state ${blockStateName} because it doesn't exist on block ${BlockUpdater.stringifyBlock(block)}, ${JSON.stringify(flattenRule)}`);
			return;
		}
		let blockStateValue = block["states"][blockStateName];
		let embedValue = flattenRule["flattenedValueRemaps"]?.[blockStateValue] ?? blockStateValue;
		block["name"] = flattenRule["prefix"] + embedValue + flattenRule["suffix"];
		delete block["states"][blockStateName];
		return true;
	}
	/**
	 * @param {TypedBlockStateProperty} blockStateProperty 
	 * @returns {Number|String}
	 */
	#readBlockStateProperty(blockStateProperty) {
		return Object.values(blockStateProperty)[0]; // blockStateValue is an object that's either { "string": "value" }, { "int": 0 }, or { "byte": 0 } but it's all the same in JS
	}
	/**
	 * @param {BlockUpdateSchema|BlockUpdateSchemaSkeleton} schema
	 * @returns {Number}
	 */
	#getSchemaVersion(schema) {
		return (schema["maxVersionMajor"] << 24) | (schema["maxVersionMinor"] << 16) | (schema["maxVersionPatch"] << 8) | schema["maxVersionRevision"];
	}
	/**
	 * "Stringifies" a block with its name and states.
	 * @param {NBTBlock|Block} block
	 * @param {Boolean} [includeVersion]
	 * @returns {String}
	 */
	static stringifyBlock(block, includeVersion = true) {
		let blockStates = Object.entries(block["states"]).map(([name, value]) => `${name}=${value}`).join(",");
		let res = block["name"].replace(/^minecraft:/, "");
		if(blockStates.length) {
			res += `[${blockStates}]`;
		}
		if(includeVersion && "version" in block) {
			res += `@${BlockUpdater.parseBlockVersion(block["version"]).join(".")}`;
		}
		return res;
	}
	/**
	 * Expands the block version number found in structure NBT into an array.
	 * @param {Number} blockVersion Block version number as found in structure NBT
	 * @returns {Array<Number>}
	 */
	static parseBlockVersion(blockVersion) {
		return blockVersion.toString(16).padStart(8, 0).match(/.{2}/g).map(x => parseInt(x, 16));
	}
}

/**
 * @typedef {import("./HoloPrint.js").NBTBlock} NBTBlock
 */
/**
 * @typedef {import("./BlockGeoMaker.js").Block} Block
 */
/**
 * @typedef {import("./HoloPrint.js").BlockUpdateSchemaSkeleton} BlockUpdateSchemaSkeleton
 */
/**
 * @typedef {import("./HoloPrint.js").BlockUpdateSchema} BlockUpdateSchema
 */
/**
 * @typedef {import("./HoloPrint.js").TypedBlockStateProperty} TypedBlockStateProperty
 */
/**
 * @typedef {import("./HoloPrint.js").BlockUpdateSchemaFlattenRule} BlockUpdateSchemaFlattenRule
 */
/**
 * @typedef {import("./HoloPrint.js").BlockUpdateSchemaRemappedState} BlockUpdateSchemaRemappedState
 */