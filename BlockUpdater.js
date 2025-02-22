// Updates a block from older MCBE versions, using schemas from pmmp/BedrockBlockUpgradeSchema. This code was made with reference to https://github.com/pmmp/PocketMine-MP/blob/5.21.0/src/data/bedrock/block/upgrade/BlockStateUpgrader.php and https://github.com/RaphiMC/ViaBedrock/blob/main/src/main/java/net/raphimc/viabedrock/api/chunk/blockstate/JsonBlockStateUpgradeSchema.java.

import { CachingFetcher } from "./essential.js";

export default class BlockUpdater {
	static LATEST_VERSION = 18168865; // 1.21.60.33 (1.21.61)
	static #UPGRADE_SCHEMA_URL = "https://raw.githubusercontent.com/SuperLlama88888/BedrockBlockUpgradeSchema";
	static #UPGRADE_SCHEMA_VERSION = "5.1.0+bedrock-1.21.60"; // specifically, the tag name
	
	suppressErrors;
	
	#fetcher;
	/** @type {Object.<String, Array<BlockUpdateSchemaSkeleton>>} */
	#schemaIndex;
	/** @type {Map<String, BlockUpdateSchema>} */
	#schemas;
	
	/**
	 * Creates a BlockUpdater to update older blocks to the latest MCBE version.
	 * @param {Boolean} [suppressErrors] Whether to suppress errors and continue on as best as possible
	 */
	constructor(suppressErrors = false) {
		this.#fetcher = new CachingFetcher(`BlockUpgrader@${BlockUpdater.#UPGRADE_SCHEMA_VERSION}`, `${BlockUpdater.#UPGRADE_SCHEMA_URL}/refs/tags/${BlockUpdater.#UPGRADE_SCHEMA_VERSION}/`);
		this.suppressErrors = suppressErrors;
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
	 * @impure
	 * @param {NBTBlock} block
	 */
	async update(block) {
		let oldBlockStringified = this.#stringifyBlock(block);
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
			console.debug(`Updated ${oldBlockStringified} to ${this.#stringifyBlock(block)}`);
		}
		return updated;
	}
	/**
	 * Applies a schema to a block.
	 * @impure
	 * @param {BlockUpdateSchema} schema
	 * @param {NBTBlock} block
	 * @returns {Boolean} Whether or not the block changed between versions. (The version number will always be updated.)
	 */
	#applyUpdateSchema(schema, block) {
		let schemaVersion = this.#getSchemaVersion(schema);
		if(block["version"] > schemaVersion) {
			console.error(`Trying to upgrade block from ${block["version"]} to ${schemaVersion}!`);
			return;
		}
		if(block["name"] in (schema["flattenedProperties"] ?? {}) && block["name"] in (schema["renamedIds"] ?? {})) {
			this.#throwError(`Cannot flatten and rename block ${block["name"]} at the same time: ${JSON.stringify(schema)}`);
		}
		
		block["version"] = schemaVersion;
		// remap block states: when the values change and, in some cases, the block 
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
			return true;
		}
		
		let hasBeenUpdated = false;
		// added properties: add block states and values
		if(block["name"] in (schema["addedProperties"] ?? {})) {
			Object.entries(schema["addedProperties"][block["name"]]).forEach(([blockStateName, blockStateProperty]) => {
				let blockStateValue = this.#readBlockStateProperty(blockStateProperty);
				if(blockStateName in block["states"]) {
					this.#throwError(`Cannot add block state ${blockStateName} = ${blockStateValue} because it already exists on block ${block["name"]}: ${JSON.stringify(block)}`);
					return;
				}
				block["states"][blockStateName] = blockStateValue;
			});
			hasBeenUpdated = true;
		}
		// removed properties: remove block states
		if(block["name"] in (schema["removedProperties"] ?? {})) {
			schema["removedProperties"][block["name"]].forEach(blockStateName => {
				if(!(blockStateName in block["states"])) {
					this.#throwError(`Cannot delete block state ${blockStateName} from block ${block["name"]} because it doesn't exist: ${JSON.stringify(block)}`);
					return;
				}
				delete block["states"][blockStateName];
			});
			hasBeenUpdated = true;
		}
		// remapped property values: change block state values
		if(block["name"] in (schema["remappedPropertyValues"] ?? {})) {
			Object.entries(schema["remappedPropertyValues"][block["name"]]).forEach(([blockStateName, remappingName]) => {
				if(!(blockStateName in block["states"])) {
					this.#throwError(`Cannot remap value for block state ${blockStateName} on block ${block["name"]} because the state doesn't exist: ${JSON.stringify(block)}`);
					return;
				}
				let currentBlockStateValue = block["states"][blockStateName];
				if(!(remappingName in schema["remappedPropertyValuesIndex"])) {
					this.#throwError(`Block state value remapping ${remappingName} not found in schema!`);
					return;
				}
				let remappings = schema["remappedPropertyValuesIndex"][remappingName];
				let remapping = remappings.find(remapping => currentBlockStateValue == this.#readBlockStateProperty(remapping["old"]));
				if(remapping == undefined) {
					this.#throwError(`Cannot find block state value ${currentBlockStateValue} in remappings for block state ${blockStateName}: ${JSON.stringify(remappings)}`);
					return;
				}
				block["states"][blockStateName] = this.#readBlockStateProperty(remapping["new"]);
			});
			hasBeenUpdated = true;
		}
		// renamed properties: rename block states
		if(block["name"] in (schema["renamedProperties"] ?? {})) {
			Object.entries(schema["renamedProperties"][block["name"]]).forEach(([oldStateName, newStateName]) => {
				if(!(oldStateName in block["states"])) {
					this.#throwError(`Cannot rename block state ${oldStateName} -> ${newStateName} because it doesn't exist on block ${block["name"]}: ${JSON.stringify(block)}`);
					return;
				}
				block["states"][newStateName] = block["states"][oldStateName];
				delete block["states"][oldStateName];
			});
			hasBeenUpdated = true;
		}
		// flattened properties: property value determines new block name
		if(block["name"] in (schema["flattenedProperties"] ?? {})) {
			this.#applyFlattenedProperty(schema["flattenedProperties"][block["name"]], block);
			hasBeenUpdated = true;
		}
		// renamed ids: block name changes
		if(block["name"] in (schema["renamedIds"] ?? {})) {
			block["name"] = schema["renamedIds"][block["name"]];
			hasBeenUpdated = true;
		}
		return hasBeenUpdated;
	}
	/**
	 * Flattens a block state to find the new block name for a block.
	 * @impure
	 * @param {BlockUpdateSchemaFlattenRule} flattenRule
	 * @param {NBTBlock} block
	 */
	#applyFlattenedProperty(flattenRule, block) {
		let blockStateName = flattenRule["flattenedProperty"];
		if(!(blockStateName in block["states"])) {
			this.#throwError(`Cannot flatten block state ${blockStateName} because it doesn't exist on block ${block["name"]}: ${block}, ${flattenRule}`);
			return;
		}
		let blockStateValue = block["states"][blockStateName];
		let embedValue = flattenRule["flattenedValueRemaps"]?.[blockStateValue] ?? blockStateValue;
		block["name"] = flattenRule["prefix"] + embedValue + flattenRule["suffix"];
		delete block["states"][blockStateName];
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
	 * @param {NBTBlock} block
	 * @returns {String}
	 */
	#stringifyBlock(block) {
		let blockStates = Object.entries(block["states"]).map(([name, value]) => `${name}=${value}`).join(",");
		return block["name"].replace(/^minecraft:/, "") + (blockStates.length? `[${blockStates}]` : "");
	}
	/**
	 * Throws an error, or logs it to the console if errors are suppressed.
	 * @param {String} message
	 */
	#throwError(message) {
		if(this.suppressErrors) {
			console.error(message);
		} else {
			throw new Error(message);
		}
	}
}

/**
 * @typedef {import("./HoloPrint.js").NBTBlock} NBTBlock
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