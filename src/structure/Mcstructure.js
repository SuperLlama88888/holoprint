import BlockUpdater from "../BlockUpdater.js";
import { AsyncFactory, JSONMap, removeFileExtension, tuple, UserError } from "../utils.js";

const IGNORED_BLOCK_ENTITIES = new Set(["Beacon", "Beehive", "Bell", "BrewingStand", "ChiseledBookshelf", "CommandBlock", "Comparator", "Conduit", "CreakingHeart", "EnchantTable", "EndGateway", "JigsawBlock", "Lodestone", "SculkCatalyst", "SculkShrieker", "SculkSensor", "CalibratedSculkSensor", "StructureBlock", "BrushableBlock", "TrialSpawner", "Vault"]);

/**
 * An IStructure loaded from a .mcstructure file (exported from Minecraft Bedrock's structure blocks).
 * @implements {IStructure}
 */
export default class Mcstructure extends AsyncFactory {
	/** @readonly @type {NBTBlock[]} */
	#rawPalette;
	/** @type {Block[]} */
	#palette = [];
	/** @type {[Int32Array] | [Int32Array, Int32Array]} */
	#blockIndices;
	/** @readonly @type {Record<number, BlockPositionData>} */
	#blockPositionData;
	/** @readonly @type {string[]} */
	#ignoredBlocks;
	/** @readonly @type {Vec3} */
	worldOrigin;
	
	/**
	 * @param {File} structureFile
	 * @param {NBT.RootTag} nbt
	 * @param {string[]} ignoredBlocks
	 */
	constructor(structureFile, nbt, ignoredBlocks) {
		super();
		if(!this.#isValidMcstructureNbt(nbt)) {
			throw new UserError(this.#getInvalidMcstructureErrorMessage(structureFile.name, nbt));
		}
		
		this.size = Array.from(nbt.size);
		// no, these can't be on a single line, typescript hates it
		this.width = this.size[0];
		this.height = this.size[1];
		this.depth = this.size[2];
		
		this.worldOrigin = Array.from(nbt.structure_world_origin);
		this.#rawPalette = nbt.structure.palette.default.block_palette;
		this.#blockIndices = nbt.structure.block_indices;
		this.#blockPositionData = nbt.structure.palette.default.block_position_data;
		
		this.#ignoredBlocks = ignoredBlocks;
	}
	async init() {
		await this.#tweakBlockPalette();
	}
	/**
	 * @param {Vec3} coords
	 * @param {number} layer
	 * @returns {Block | undefined}
	 */
	getBlock(coords, layer) {
		let paletteIndex = this.getPaletteIndex(coords, layer);
		if(paletteIndex == -1) {
			return undefined;
		}
		return this.#palette[paletteIndex];
	}
	/**
	 * @param {Vec3} coords
	 * @param {number} layer
	 * @returns {[Block | undefined, number]}
	 */
	getBlockAndIndex(coords, layer) {
		let paletteIndex = this.getPaletteIndex(coords, layer);
		if(paletteIndex == -1) {
			return [undefined, -1];
		}
		return [this.#palette[paletteIndex], paletteIndex];
	}
	/**
	 * @param {Vec3} coords
	 * @param {number} layer
	 * @returns {number}
	 */
	getPaletteIndex(coords, layer) {
		if(layer >= this.#blockIndices.length) {
			// format_version 2 structures can omit the second block indices array when it is empty
			// https://feedback.minecraft.net/hc/en-us/articles/47907593889677-Minecraft-Beta-Preview-26-50-24
			return -1;
		}
		let index = this.#getStructureIndexFromCoordinates(coords);
		return this.#blockIndices[layer][index];
	}
	/**
	 * @param {Vec3} coords
	 * @returns {Vec2}
	 */
	getPaletteIndicesForBothLayers(coords) {
		return tuple([this.getPaletteIndex(coords, 0), this.getPaletteIndex(coords, 1)]);
	}
	getPalette() {
		return this.#palette;
	}
	getBlockIndices() {
		return this.#blockIndices;
	}
	/**
	 * @param {Block[]} palette
	 * @param {[Int32Array] | [Int32Array, Int32Array]} blockIndices
	 */
	setPaletteAndIndices(palette, blockIndices) {
		this.#palette = palette;
		this.#blockIndices = blockIndices;
	}
	
	/**
	 * Checks if a NBT object is valid .mcstructure NBT.
	 * @param {NBT.RootTag} nbt
	 * @returns {nbt is McstructureNbt<1 | 2>}
	 */
	#isValidMcstructureNbt(nbt) {
		return (nbt["format_version"] == 1 || nbt["format_version"] == 2) && nbt["size"] instanceof Int32Array && nbt["size"].length == 3 && "structure" in nbt && nbt["structure_world_origin"] instanceof Int32Array && nbt["structure_world_origin"].length == 3;
	}
	/**
	 * Gets the error message for a NBT file that isn't `.mcstructure`.
	 * @param {string} structureFileName
	 * @param {NBT.RootTag} nbt
	 * @returns {string}
	 */
	#getInvalidMcstructureErrorMessage(structureFileName, nbt) {
		let offendingStructureName = removeFileExtension(structureFileName);
		let errorMessage = `Structure ${offendingStructureName} is not a valid .mcstructure file!`;
		const otherNBTFileTypes = {
			MinecraftDataVersion: "litematic",
			TileEntities: "schematic",
			Metadata: "schem", // Sponge format
			DataVersion: "nbt"
		};
		let probableSourceFileExtension = Object.entries(otherNBTFileTypes).find(([key]) => key in nbt)?.[1];
		if(probableSourceFileExtension) {
			errorMessage += `\nNote: Renaming .${probableSourceFileExtension} to .mcstructure doesn't work, you must create the structure file from inside Minecraft Bedrock! Minecraft Java structures aren't the same as Minecraft Bedrock structures!`;
		}
		return errorMessage;
	}
	/**
	 * Gets the index of a block position in the structure data from its coordinates.
	 * @param {Vec3} coords
	 * @returns {number}
	 */
	#getStructureIndexFromCoordinates([x, y, z]) {
		return (x * this.height + y) * this.depth + z;
	}
	/**
	 * Removes ignored blocks from the block palette, updates old blocks, and adds block entities as separate entries.
	 */
	async #tweakBlockPalette() {
		let blockVersions = new Set(); // version should be constant for all blocks. just wanted to test this
		let blockUpdater = new BlockUpdater();
		let updatedBlocks = 0;
		for(let [i, block] of Object.entries(this.#rawPalette)) {
			blockVersions.add(block.version);
			if(blockUpdater.blockNeedsUpdating(block)) {
				if(await blockUpdater.update(block)) {
					updatedBlocks++;
				}
			}
			block.name = block.name.replace(/^minecraft:/, ""); // remove namespace here, right at the start
			if(this.#ignoredBlocks.includes(block.name)) {
				continue;
			}
			delete block.version;
			if(!Object.keys(block.states).length) {
				delete block.states; // easier viewing in the console
			}
			this.#palette[i] = block;
		}
		
		if(this.#palette.length == 0) {
			throw new UserError(`Structure is empty! No blocks are inside the structure.`);
		}
		
		let blockVersionsStringified = Array.from(blockVersions).map(v => BlockUpdater.parseBlockVersion(v).join("."));
		if(updatedBlocks > 0) {
			console.info(`Updated ${updatedBlocks} block${updatedBlocks > 1? "s" : ""} from ${blockVersionsStringified.join(", ")} to ${BlockUpdater.parseBlockVersion(BlockUpdater.LATEST_VERSION).join(".")}!`);
			console.info(`Note: Updated blocks may not be 100% accurate! If there are some errors, try loading the structure in the latest version of Minecraft then saving it again, so all blocks are up to date.`);
		}
		console.log("Block versions:", Array.from(blockVersions), blockVersionsStringified);
		
		// add block entities into the block palette (on layer 0)
		/** @type {JSONMap<Block, number>} */
		let newIndexCache = new JSONMap();
		let entitylessBlockEntityIndices = new Set(); // contains all the block palette indices for blocks with block entities. since they don't have block entity data yet, and all block entities well be cloned and added to the end of the palette, we can remove all the entries in here from the palette.
		for(let i in this.#blockPositionData) {
			let oldPaletteI = this.#blockIndices[0][i];
			if(!(oldPaletteI in this.#palette)) { // if the block is ignored, it will be deleted already, so there's no need to touch its block entities
				continue;
			}
			if(!("block_entity_data" in this.#blockPositionData[i])) { // observers have tick_queue_data
				continue;
			}
			
			let blockEntityData = structuredClone(this.#blockPositionData[i].block_entity_data);
			if(IGNORED_BLOCK_ENTITIES.has(blockEntityData["id"])) {
				continue;
			}
			delete blockEntityData["x"];
			delete blockEntityData["y"];
			delete blockEntityData["z"];
			
			// clone the old block and add the block entity data
			/** @type {Block} */
			let newBlock = structuredClone(this.#palette[oldPaletteI]);
			newBlock.blockEntityData = blockEntityData;
			
			// check that we haven't seen this block entity before. since in JS objects are compared by reference we have to stringify it first then check the cache.
			if(newIndexCache.has(newBlock)) {
				this.#blockIndices[0][i] = newIndexCache.get(newBlock);
			} else {
				let paletteI = this.#palette.length;
				this.#palette[paletteI] = newBlock;
				this.#blockIndices[0][i] = paletteI;
				newIndexCache.set(newBlock, paletteI);
				entitylessBlockEntityIndices.add(oldPaletteI); // we can schedule to delete the original block palette entry later, as it doesn't have any block entity data and all block entities clone it.
			}
		}
		for(let paletteI of entitylessBlockEntityIndices) {
			// console.log(`deleting entityless block entity ${paletteI} = ${JSON.stringify(blockPalette[paletteI])}`);
			delete this.#palette[paletteI]; // this makes the blockPalette array discontinuous; when using native array methods, they skip over the empty slots.
		}
	}
}

/** @import { BlockPositionData, McstructureNbt } from "./Mcstructure.types.ts" */
/** @import IStructure from "./IStructure.ts" */
/** @import { NBTBlock } from "../minecraft.types.ts" */
/** @import { Block, Vec2, Vec3 } from "../common.types.ts" */
/** @import * as NBT from "nbtify-readonly-typeless" */