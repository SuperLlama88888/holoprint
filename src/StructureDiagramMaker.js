import { areArraysEqual, average, ceil, fnv1a, getOffscreenCanvasContext, getStructureIndexFromCoordinates, HashMap, sqrt, stringToImageData, toBlob, tuple, vec2 } from "./utils.js";
import WebGL2QuadRenderer from "./WebGL2QuadRenderer.js"; // dependency injection coming soon^tm

/** Padding in pixels to be added around the edges of isometric diagrams. */
const ISOMETRIC_DIAGRAM_PADDING = 8;

export default class StructureDiagramMaker {
	/** @readonly @type {number} */
	size;
	/** @readonly @type {WebGL2QuadRenderer | null} */
	#renderer = null;
	/** @readonly @type {number} */
	#isoXStep;
	/** @readonly @type {number} */
	#isoXYZStep;
	/** @readonly @type {number} */
	#isoYYStep;
	/** @readonly @type {number} */
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
		
		if(WebGL2QuadRenderer.isSupported()) {
			try {
				// multiply by 3 because a 2d icon has the surrounding 3x3 blocks in case the block takes up multiple block spaces (i.e. beds, horizontal pistons)
				this.#renderer = new WebGL2QuadRenderer(this.size * 3, texture);
			} catch(e) {
				console.error(`Failed to initialise WebGL2QuadRenderer despite being 'supported' - ${e}`);
			}
		} else {
			console.error("Cannot make structure diagrams - WebGL2 is not supported!");
		}
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
	 * @param {PolyMeshTemplateFaceWithUvs[][]} polyMeshTemplatePalette
	 * @param {[Int32Array, Int32Array][]} structureIndicesByLayerByStructure
	 * @param {I32Vec3[]} structureSizes
	 * @returns {Promise<{ diagrams: Blob[], indices: number[][] }>}
	 */
	async makeDiagramsForStructures(polyMeshTemplatePalette, structureIndicesByLayerByStructure, structureSizes) {
		if(!this.#renderer) {
			let errorImage = await toBlob(stringToImageData("Couldn't create diagrams"));
			let indices = structureSizes.map(structureSize => (new Array(structureSize[1] + 1)).fill(0));
			return {
				diagrams: [errorImage],
				indices
			};
		}
		
		let blockIconPalette = this.makeBirdsEyeViewBlockIconPalette(polyMeshTemplatePalette);
		let isometricBlockIconPalette = this.makeIsometricViewBlockIconPalette(polyMeshTemplatePalette);
		
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
			
			// layer-by-layer diagrams are cached based on the hash of the palette indices on each layer. (Can't believe I had to implement a hash map myself in the big 26)
			for(let y = 0; y < structureSize[1]; y++) {
				/** @type {number[]} */
				let indices = [];
				for(let x = 0; x < structureSize[0]; x++) {
					for(let z = 0; z < structureSize[2]; z++) {
						let blockI = getStructureIndexFromCoordinates([x, y, z], structureSize);
						indices.push(structureIndicesByLayer[0][blockI], structureIndicesByLayer[1][blockI]);
					}
				}
				let layerKey = [structureSize[0], structureSize[2], ...indices];
				let index = diagramIndicesHashMap.get(layerKey);
				if(index == undefined) {
					index = diagramBlobPromises.length;
					diagramIndicesHashMap.set(layerKey, index);
					diagramBlobPromises.push(this.#makeDiagramForLayer(blockIconPalette, indices, structureSize));
				}
				diagramBlobIndicesForStructure.push(index);
			}
			diagramBlobIndices.push(diagramBlobIndicesForStructure);
		});
		
		// The new "using" statement is not yet widely supported, so I need to manually write this. esbuild can transpile it but it's soooo bloated. Maybe in 5 years...
		this.#disposeBlockIconPalette(blockIconPalette);
		this.#disposeBlockIconPalette(isometricBlockIconPalette);
		
		let diagramBlobs = await Promise.all(diagramBlobPromises);
		return {
			diagrams: diagramBlobs,
			indices: diagramBlobIndices
		};
	}
	dispose() {
		this.#renderer?.dispose();
	}
	/**
	 * Disposes all the `ImageBitmap`s in a block icon palette.
	 * @param {ImageBitmap[]} blockIconPalette
	 */
	#disposeBlockIconPalette(blockIconPalette) {
		blockIconPalette.forEach(imageBitmap => imageBitmap.close());
	}
	
	/**
	 * Gets the icon for a single block from an array of faces.
	 * @param {PolyMeshTemplateFaceWithUvs[]} faces
	 * @param {boolean} isometric
	 * @returns {ImageBitmap}
	 */
	#getIconForBlockFromFaces(faces, isometric) {
		let faceVertices = faces.map(face => face.vertices);
		if(!isometric) {
			// check if the faces won't be visible when viewed from a bird's-eye view (e.g. cross_texture blocks). if this happens, we swizzle the y and z axes so it's effectively looking from the side.
			if(faceVertices.every(vertices => this.#isFaceInvisibleFromAbove(vertices))) {
				faceVertices = structuredClone(faceVertices);
				faceVertices.forEach(vertices => vertices.forEach(v => {
					v.pos = [v.pos[0], v.pos[2], 16 - v.pos[1]];
				}));
			}
		}
		let depthSortedFaceVertices = faceVertices.map(vertices => {
			if(isometric) {
				return {
					vertices,
					depth: average(vertices.map(({ pos: p }) => (16 - p[0]) + p[2] + p[1] * 2 * sqrt(3))) // it works
				};
			} else {
				return {
					vertices,
					depth: average(vertices.map(({ pos: [, y] }) => y))
				};
			}
		}).sort((a, b) => a.depth - b.depth);
		
		// Convert face vertex data into flat inputs acceptable by the WebGL engine
		let quadRenderData = depthSortedFaceVertices.map(({ vertices }) => {
			let positions = new Float32Array(8);
			let i = 0;
			if(isometric) {
				vertices.forEach(({ pos: p }) => {
					// idk how this works, I got chatgpt to do it. but I know it works
					positions[i++] = (64 - p[0] - p[2]) / 96;
					positions[i++] = (48 + (16 + p[2] - p[0] - 2 * p[1]) / sqrt(3)) / 96;
				});
			} else {
				vertices.forEach(({ pos: p }) => {
					positions[i++] = (32 - p[0]) / 48;
					positions[i++] = (p[2] + 16) / 48;
				});
			}
			let uvs = new Float32Array(8);
			i = 0;
			vertices.forEach(({ uv }) => {
				uvs[i++] = uv[0];
				uvs[i++] = 1 - uv[1];
			});
			return { positions, uvs };
		});
		
		return this.#renderer.render(quadRenderData);
	}
	/**
	 * @param {[PolyMeshTemplateVertexWithUv, PolyMeshTemplateVertexWithUv, PolyMeshTemplateVertexWithUv, PolyMeshTemplateVertexWithUv]} vertices
	 * @returns {boolean}
	 */
	#isFaceInvisibleFromAbove(vertices) {
		// coordinates from a bird's-eye view
		let coords = vertices.map(({ pos: p }) => [p[0], p[2]]);
		return vec2.equals(coords[0], coords[1]) || vec2.equals(coords[0], coords[2]) || vec2.equals(coords[0], coords[3]) || vec2.equals(coords[1], coords[2]) || vec2.equals(coords[1], coords[3]) || vec2.equals(coords[2], coords[3]);
	}
	/**
	 * Stitches block icons together using the standard 2d canvas.
	 * @param {ImageBitmap[]} blockIconPalette
	 * @param {number[]} blockIndices
	 * @param {I32Vec3} structureSize
	 * @returns {Promise<Blob>}
	 */
	async #makeDiagramForLayer(blockIconPalette, blockIndices, structureSize) {
		let can = new OffscreenCanvas(this.size * structureSize[0], this.size * structureSize[2]);
		let ctx = getOffscreenCanvasContext(can, "2d");
		
		try {
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
		} catch(e) {
			let errorMessage = `Failed to draw image: ${e}`;
			console.error(errorMessage, e.stack);
			return await toBlob(stringToImageData(errorMessage));
		}
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
		let ctx = getOffscreenCanvasContext(can, "2d");
		
		// Grid origin offsets to align minimum projected X and Y boundaries at `ISOMETRIC_DIAGRAM_PADDING`
		let offsetX = structureSize[2] * this.#isoXStep + ISOMETRIC_DIAGRAM_PADDING;
		let offsetY = structureSize[1] * this.#isoYYStep + ISOMETRIC_DIAGRAM_PADDING;
		
		let blockDrawList = [];
		for(let y = 0; y < structureSize[1]; y++) {
			for(let x = 0; x < structureSize[0]; x++) {
				for(let z = 0; z < structureSize[2]; z++) {
					let blockI = getStructureIndexFromCoordinates([x, y, z], structureSize);
					for(let layer = 1; layer >= 0; layer--) {
						let blockIconIndex = structureIndicesByLayer[layer][blockI];
						if(blockIconIndex in isometricBlockIconPalette) {
							// goofy maths for calculating depth and isometric coordinates (it works, trust trust)
							let depth = ((x + z) * structureSize[1] + y) * 2 - layer;
							let isometricX = (x - z) * this.#isoXStep + offsetX;
							let isometricY = (x + z) * this.#isoXYZStep - y * this.#isoYYStep + offsetY;
							let blockIcon = isometricBlockIconPalette[blockIconIndex];
							blockDrawList.push({
								pos: tuple([isometricX, isometricY]),
								blockIcon,
								depth
							});
						}
					}
				}
			}
		}
		
		blockDrawList.sort((a, b) => a.depth - b.depth);
		try {
			// TODO: fix insane performance issue on Chrome here!
			blockDrawList.forEach(({ pos, blockIcon }) => {
				ctx.drawImage(blockIcon, pos[0] - this.#isoBlockIconOffset, pos[1] - this.#isoBlockIconOffset);
			});
			return await can.convertToBlob();
		} catch(e) {
			let errorMessage = `Failed to draw image: ${e}`;
			console.error(errorMessage);
			return await toBlob(stringToImageData(errorMessage));
		}
	}
}

/** @import { HoloPrintConfig, I32Vec3 } from "./common.types.ts" */
/** @import { PolyMeshTemplateFaceWithUvs, PolyMeshTemplateVertexWithUv } from "./PolyMeshMaker.types.ts" */