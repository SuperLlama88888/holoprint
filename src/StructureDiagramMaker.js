import { areArraysEqual, average, ceil, fnv1a, getOffscreenCanvasContext, getStructureIndexFromCoordinates, HashMap, sqrt } from "./utils.js";
import WebGL2QuadRenderer from "./WebGL2QuadRenderer.js"; // dependency injection coming soon^tm

/** Padding in pixels to be added around the edges of isometric diagrams. */
const ISOMETRIC_DIAGRAM_PADDING = 8;

export default class StructureDiagramMaker {
	/** @readonly */
	size;
	/** @readonly */
	#renderer;
	/** @readonly */
	#isoXStep;
	/** @readonly */
	#isoXYZStep;
	/** @readonly */
	#isoYYStep;
	/** @readonly */
	#isoBlockIconOffset;
	
	/**
	 * @param {HoloPrintConfig} config 
	 * @param {HTMLImageElement} texture
	 */
	constructor(config, texture) {
		this.size = config.LAYER_BY_LAYER_DIAGRAM_BLOCK_RESOLUTION;
		
		this.#isoXStep = this.size * 0.5;
		this.#isoXYZStep = this.size * 0.5 / sqrt(3);
		this.#isoYYStep = this.size / sqrt(3);
		this.#isoBlockIconOffset = this.size * 1.5;
		
		// multiply by 3 because a 2d icon has the surrounding 3x3 blocks in case the block takes up multiple block spaces (i.e. beds, horizontal pistons)
		this.#renderer = new WebGL2QuadRenderer(this.size * 3, texture);
	}
	
	/**
	 * Makes a palette of birds-eye view block icons from a palette of poly mesh templates.
	 * @param {PolyMeshTemplateFaceWithUvs[][]} polyMeshTemplatePalette
	 * @returns {ImageBitmap[]}
	 */
	makeBirdsEyeViewBlockIconPalette(polyMeshTemplatePalette) {
		return polyMeshTemplatePalette.map(faces => this.#getIconForBlockFromFaces(faces, false));
	}
	/**
	 * Makes a palette of isometric block icons from a palette of poly mesh templates.
	 * @param {PolyMeshTemplateFaceWithUvs[][]} polyMeshTemplatePalette
	 * @returns {ImageBitmap[]}
	 */
	makeIsometricViewBlockIconPalette(polyMeshTemplatePalette) {
		return polyMeshTemplatePalette.map(faces => this.#getIconForBlockFromFaces(faces, true));
	}
	/**
	 * Makes all the diagrams (3D isometric at index 0, 2D layers at index 1+) for an array of structures.
	 * @param {ImageBitmap[]} blockIconPalette
	 * @param {ImageBitmap[]} isometricBlockIconPalette
	 * @param {[Int32Array, Int32Array][]} structureIndicesByLayerByStructure
	 * @param {I32Vec3[]} structureSizes
	 * @returns {Promise<{ diagrams: Blob[], indices: number[][] }>}
	 */
	async makeDiagramsForStructures(blockIconPalette, isometricBlockIconPalette, structureIndicesByLayerByStructure, structureSizes) {
		/** @type {Promise<Blob>[]} */
		let diagramBlobPromises = [];
		/** @type {HashMap<number[], number, number>} */
		let diagramIndicesHashMap = new HashMap(indices => fnv1a(indices), areArraysEqual);
		/** @type {number[][]} */
		let diagramBlobIndices = [];
		structureSizes.forEach((structureSize, structureI) => {
			let structureIndicesByLayer = structureIndicesByLayerByStructure[structureI];
			/** @type {number[]} */
			let diagramBlobIndicesForStructure = [];
			
			diagramBlobIndicesForStructure.push(diagramBlobPromises.length);
			diagramBlobPromises.push(this.#makeIsometricDiagramForStructure(isometricBlockIconPalette, structureIndicesByLayer, structureSize));
			
			// layer-by-layer diagrams  are cached based on the hash of the palette indices on each layer. (Can't believe I had to implement a hash map myself in the big 26)
			for(let y = 0; y < structureSize[1]; y++) {
				/** @type {number[]} */
				let indices = [];
				for(let x = 0; x < structureSize[0]; x++) {
					for(let z = 0; z < structureSize[2]; z++) {
						let blockI = getStructureIndexFromCoordinates([x, y, z], structureSize);
						indices.push(structureIndicesByLayer[0][blockI], structureIndicesByLayer[1][blockI]);
					}
				}
				let index = diagramIndicesHashMap.get(indices);
				if(index == undefined) {
					index = diagramBlobPromises.length;
					diagramIndicesHashMap.set(indices, index);
					diagramBlobPromises.push(this.#makeDiagramForLayer(blockIconPalette, indices, structureSize));
				}
				diagramBlobIndicesForStructure.push(index);
			}
			diagramBlobIndices.push(diagramBlobIndicesForStructure);
		});
		let diagramBlobs = await Promise.all(diagramBlobPromises);
		return {
			diagrams: diagramBlobs,
			indices: diagramBlobIndices
		};
	}
	/**
	 * Disposes all the `ImageBitmap`s in a block icon palette.
	 * @param {ImageBitmap[]} blockIconPalette
	 */
	disposeBlockIconPalette(blockIconPalette) {
		blockIconPalette.forEach(imageBitmap => imageBitmap.close());
	}
	
	/**
	 * Gets the icon for a single block from an array of faces.
	 * @param {PolyMeshTemplateFaceWithUvs[]} faces
	 * @param {boolean} isometric
	 * @returns {ImageBitmap}
	 */
	#getIconForBlockFromFaces(faces, isometric) {
		let sortedFaces = faces.map(face => {
			if(isometric) {
				return {
					face,
					depth: average(face.vertices.map(({ pos: v }) => (16 - v[0]) + v[2] + v[1] * 2 * sqrt(3))) // it works
				};
			} else {
				return {
					face,
					depth: average(face.vertices.map(({ pos: [, y] }) => y))
				};
			}
		}).sort((a, b) => a.depth - b.depth);
		
		// Convert face vertex data into flat inputs acceptable by the WebGL engine
		let quadRenderData = sortedFaces.map(({ face }) => {
			let positions = new Float32Array(8);
			let i = 0;
			if(isometric) {
				face.vertices.forEach(({ pos: v }) => {
					// idk how this works, I got chatgpt to do it. but I know it works
					positions[i++] = (64 - v[0] - v[2]) / 96;
					positions[i++] = (48 + (16 + v[2] - v[0] - 2 * v[1]) / sqrt(3)) / 96;
				});
			} else {
				face.vertices.forEach(({ pos: v }) => {
					positions[i++] = (32 - v[0]) / 48;
					positions[i++] = (v[2] + 16) / 48;
				});
			}
			let uvs = new Float32Array(8);
			i = 0;
			face.vertices.forEach(({ uv }) => {
				uvs[i++] = uv[0];
				uvs[i++] = 1 - uv[1];
			});
			return { positions, uvs };
		});
		
		return this.#renderer.render(quadRenderData);
	}
	/**
	 * Stitches standard `ImageBitmap` icons together using the standard 2d canvas.
	 * @param {ImageBitmap[]} blockIconPalette
	 * @param {number[]} blockIndices
	 * @param {I32Vec3} structureSize
	 * @returns {Promise<Blob>}
	 */
	async #makeDiagramForLayer(blockIconPalette, blockIndices, structureSize) {
		let can = new OffscreenCanvas(this.size * structureSize[0], this.size * structureSize[2]);
		let ctx = getOffscreenCanvasContext(can, "2d", {
			willReadFrequently: true
		});
		
		for(let x = 0; x < structureSize[0]; x++) {
			for(let z = 0; z < structureSize[2]; z++) {
				// draw second layer first, so the first layer (the main layer) draws on top
				for(let layer = 1; layer >= 0; layer--) {
					let indexIndex = (x * structureSize[2] + z) * 2 + layer;
					let blockIconIndex = blockIndices[indexIndex];
					if(blockIconIndex in blockIconPalette) {
						// Offset by -1 * size so the 3x3 block icon (size * 3) is centered over grid cell (x, z)
						ctx.drawImage(blockIconPalette[blockIconIndex], (x - 1) * this.size, (z - 1) * this.size);
					}
					// not in blockIconPalette means it's an excluded block, e.g. air
				}
			}
		}
		return await can.convertToBlob();
	}
	/**
	 * Stitches 3D isometric block icons together with depth sorting to make a 3D isometric diagram for the full structure.
	 * @param {ImageBitmap[]} isometricBlockIconPalette
	 * @param {[Int32Array, Int32Array]} structureIndicesByLayer
	 * @param {I32Vec3} structureSize
	 * @returns {Promise<Blob>}
	 */
	async #makeIsometricDiagramForStructure(isometricBlockIconPalette, structureIndicesByLayer, structureSize) {
		// Canvas bounds fitting tightly around projected isometric structure bounds plus `ISOMETRIC_DIAGRAM_PADDING`:
		let canWidth = ceil((structureSize[0] + structureSize[2]) * this.#isoXStep + 2 * ISOMETRIC_DIAGRAM_PADDING);
		let canHeight = ceil((structureSize[0] + structureSize[2] - 2) * this.#isoXYZStep + (structureSize[1] + 1) * this.#isoYYStep + 2 * ISOMETRIC_DIAGRAM_PADDING);

		let can = new OffscreenCanvas(canWidth, canHeight);
		let ctx = getOffscreenCanvasContext(can, "2d", {
			willReadFrequently: true
		});
		
		// Grid origin offsets to align minimum projected X and Y boundaries at `ISOMETRIC_DIAGRAM_PADDING`
		let offsetX = structureSize[2] * this.#isoXStep + ISOMETRIC_DIAGRAM_PADDING;
		let offsetY = structureSize[1] * this.#isoYYStep + ISOMETRIC_DIAGRAM_PADDING;
		
		/** @type {{ x: number, y: number, z: number, blockIconIndex: number, depth: number }[]} */
		let blockDrawList = [];
		for(let y = 0; y < structureSize[1]; y++) {
			for(let x = 0; x < structureSize[0]; x++) {
				for(let z = 0; z < structureSize[2]; z++) {
					let blockI = getStructureIndexFromCoordinates([x, y, z], structureSize);
					for(let layer = 1; layer >= 0; layer--) {
						let blockIconIndex = structureIndicesByLayer[layer][blockI];
						if(blockIconIndex in isometricBlockIconPalette) {
							// goofy maths for calculating depth (it works, trust trust)
							let depth = ((x + z) * structureSize[1] + y) * 2 - layer;
							blockDrawList.push({ x, y, z, blockIconIndex, depth });
						}
					}
				}
			}
		}
		
		blockDrawList.sort((a, b) => a.depth - b.depth);
		blockDrawList.forEach(({ x, y, z, blockIconIndex }) => {
			// Projected 2D screen coordinates of grid cell (x, y, z) in true 30° isometric projection
			let isometricX = (x - z) * this.#isoXStep + offsetX;
			let isometricY = (x + z) * this.#isoXYZStep - y * this.#isoYYStep + offsetY;
			ctx.drawImage(isometricBlockIconPalette[blockIconIndex], isometricX - this.#isoBlockIconOffset, isometricY - this.#isoBlockIconOffset);
		});
		
		return await can.convertToBlob();
	}
}

/** @import { HoloPrintConfig, I32Vec3, PolyMeshTemplateFaceWithUvs } from "./HoloPrint.js" */