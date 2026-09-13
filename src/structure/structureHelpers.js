import * as NBT from "nbtify-readonly-typeless";
import { clonePromise, JSONSet, UserError, weaklyCacheUnaryFunc } from "../utils.js";
import Mcstructure from "./Mcstructure.js";

/**
 * @param {File} structureFile
 * @param {string[]} [ignoredBlocks]
 * @returns {Promise<IStructure>}
 */
export async function createStructure(structureFile, ignoredBlocks = []) {
	// assume that it is .mcstructure
	let nbt = await readNbtFromFile(structureFile);
	return await Mcstructure.new(structureFile, nbt, ignoredBlocks);
}

export const readNbtFromFile = weaklyCacheUnaryFunc(
	/**
	 * Reads the NBT of a structure file, returning a JSON object.
	 * @param {File} structureFile `*.mcstructure`
	 * @returns {Promise<NBT.RootTag>}
	 */
	async structureFile => {
		let arrayBuffer = await readFileContents(structureFile);
		
		try {
			return await readNbt(structureFile, arrayBuffer, {
				endian: "little", // true .mcstructure files are little-endian
				strict: false // some files have duplicated sections, which makes strict mode throw an error: #68
			});
		} catch(e) {
			console.warn(`Structure file ${structureFile.name} couldn't be read with its preferred NBT read settings. Trying generic settings...`);
			console.debug(e);
			return await readNbt(structureFile, arrayBuffer); // if the file was generated from an external source, it's best to try with generic NBT read settings
		}
	},
	clonePromise
);

/**
 * Reads the contents of the structure file as bytes.
 * @param {File} file
 * @returns {Promise<ArrayBuffer>}
 */
async function readFileContents(file) {
	let arrayBuffer = await file.arrayBuffer().catch(e => {
		if(String(e).includes("NotFoundError")) {
			throw new UserError("Unknown error when reading structure file! Please restart your browser and try again.\nIf this issue persists, please take a screen recording and create an issue on GitHub.");
		}
		throw new Error(`Could not read contents of structure file "${file.name}"!\n${e}`);
	});
	if(file.size == 0) { // this check must happen after reading the bytes, otherwise Google Drive files can't be read on Android Chrome: https://issues.chromium.org/issues/40123366#comment104
		throw new UserError(`"${file.name}" is an empty file! Please try exporting your structure again.\nIf you play on a version below 1.20.50, exporting to OneDrive will cause your structure file to be empty.`);
	}
	return arrayBuffer;
}
/**
 * Reads the NBT of a structure file, returning a JSON object.
 * @param {File} structureFile `*.mcstructure`
 * @param {ArrayBuffer} arrayBuffer
 * @param {Partial<NBT.ReadOptions>} [options]
 * @returns {Promise<NBT.RootTag>}
 */
async function readNbt(structureFile, arrayBuffer, options = {}) {
	let nbtRes = await NBT.read(arrayBuffer, options).catch(e => {
		if(e instanceof NBT.InvalidTagError) {
			throw new UserError(`"${structureFile.name}" is not a .mcstructure file! Please look at the tutorial on the wiki: https://holoprint-mc.github.io/wiki/creating-packs`);
		}
		throw new Error(`Invalid NBT in structure file "${structureFile.name}"!\n${e}`);
	});
	return nbtRes.data;
}

/**
 * Combines multiple block palettes into one, and updates indices for each. Returns the shared palette.
 * @param {IStructure[]} structures
 * @returns {Block[]}
 */
export function mergeStructurePalettes(structures) {
	/** @type {JSONSet<Block>} */
	let mergedPaletteSet = new JSONSet();
	/** @type {([Int32Array] | [Int32Array, Int32Array])[]} */
	let remappedIndices = [];
	structures.forEach(structure => {
		/** @type {number[]} */
		let indexRemappings = [];
		structure.getPalette().forEach((block, i) => {
			mergedPaletteSet.add(block);
			indexRemappings[i] = mergedPaletteSet.indexOf(block);
		});
		remappedIndices.push(structure.getBlockIndices().map(layer => layer.map(i => indexRemappings[i] ?? -1)));
	});
	// all structures will use this one palette array!
	let mergedPalette = Array.from(mergedPaletteSet);
	structures.forEach((structure, i) => structure.setPaletteAndIndices(mergedPalette, remappedIndices[i]));
	
	console.log("combined palette: ", mergedPalette);
	console.log("remapped indices: ", remappedIndices);
	
	return mergedPalette;
}

/** @import IStructure from "./IStructure.ts" */
/** @import { Block } from "../common.types.ts" */