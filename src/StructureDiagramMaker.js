import { areArraysEqual, average, ceil, fnv1a, getOffscreenCanvasContext, HashMap, max, min, sqrt, stringToImageData, toBlob, tuple, vec2 } from "./utils.js";
import WebGL2QuadRenderer from "./WebGL2QuadRenderer.js"; // dependency injection coming soon^tm

/** Padding in pixels to be added around the edges of isometric diagrams. */
const ISOMETRIC_DIAGRAM_PADDING = 8;
/** The maximum width and height, in pixels, of any diagram. Anything bigger than this is scaled down to fit. */
const MAX_DIAGRAM_SIZE = 512;
/** The resolution, in pixels, of a block's textures in the texture atlas. Layer-by-layer diagrams are drawn at exactly this resolution, such that 1 block pixel is 1 diagram pixel. This intentionally loses detail for blocks which are angled or in some other way don't conform to the block grid (e.g. side torches), because keeping them at full detail inflates the pack size beyond what I am willing to accept. */
const LAYER_DIAGRAM_BLOCK_RESOLUTION = 16;

export default class StructureDiagramMaker {
	/** @readonly @type {number} */
	size;
	/** @readonly @type {TexImageSource} */
	#texture;
	/** @readonly @type {WebGL2QuadRenderer | null} */
	#birdsEyeViewRenderer = null;
	/** @readonly @type {WebGL2QuadRenderer | null} */
	#isometricRenderer = null;
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
	 * @param {TexImageSource} texture The texture atlas to make block icons out of. Must not have texture outlines, as they look bad on diagrams.
	 */
	constructor(config, texture) {
		this.size = config.LAYER_BY_LAYER_DIAGRAM_BLOCK_RESOLUTION;
		this.#texture = texture;
		
		this.#isoXStep = this.size * 0.5;
		this.#isoXYZStep = this.size * 0.5 / sqrt(3);
		this.#isoYYStep = this.size / sqrt(3);
		this.#isoBlockIconOffset = this.size * 1.5;
		
		// Isometric diagrams get scaled down to fit `MAX_DIAGRAM_SIZE` and then scaled up again by the UI, so it's worth rendering them (and the layer diagrams) at a higher resolution than the atlas so the diagonals don't alias.
		if(WebGL2QuadRenderer.isSupported()) {
			this.#birdsEyeViewRenderer = this.#makeRenderer(LAYER_DIAGRAM_BLOCK_RESOLUTION * 3);
			this.#isometricRenderer = this.#makeRenderer(this.size * 3);
		} else {
			console.error("Cannot make structure diagrams - WebGL2 is not supported!");
		}
	}
	/**
	 * Makes a `WebGL2QuadRenderer` for block icons at a given block resolution, returning null if it couldn't be made.
	 * @param {number} blockResolution
	 * @returns {WebGL2QuadRenderer | null}
	 */
	#makeRenderer(blockResolution) {
		try {
			return new WebGL2QuadRenderer(blockResolution, this.#texture);
		} catch(e) {
			console.error(`Failed to initialise WebGL2QuadRenderer despite being 'supported' - ${e}`);
			return null;
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
	 * @param {IStructure[]} structures
	 * @returns {Promise<{ diagrams: Blob[], indices: number[][] }>}
	 */
	async makeDiagramsForStructures(polyMeshTemplatePalette, structures) {
		if(!this.#birdsEyeViewRenderer || !this.#isometricRenderer) {
			let errorImage = await toBlob(stringToImageData("Couldn't create diagrams"));
			let indices = structures.map(structure => (new Array(structure.height + 1)).fill(0));
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
		structures.forEach(structure => {
			/** @type {number[]} */
			let diagramBlobIndicesForStructure = [];
			
			diagramBlobIndicesForStructure.push(diagramBlobPromises.length);
			diagramBlobPromises.push(this.#makeIsometricDiagramForStructure(isometricBlockIconPalette, structure));
			
			// layer-by-layer diagrams are cached based on the hash of the palette indices on each layer. (Can't believe I had to implement a hash map myself in the big 26)
			for(let y = 0; y < structure.height; y++) {
				/** @type {number[]} */
				let indices = [];
				for(let x = 0; x < structure.width; x++) {
					for(let z = 0; z < structure.depth; z++) {
						indices.push(...structure.getPaletteIndicesForBothLayers([x, y, z]));
					}
				}
				let layerKey = [structure.width, structure.depth, ...indices];
				let index = diagramIndicesHashMap.get(layerKey);
				if(index == undefined) {
					index = diagramBlobPromises.length;
					diagramIndicesHashMap.set(layerKey, index);
					diagramBlobPromises.push(this.#makeDiagramForLayer(blockIconPalette, indices, structure));
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
		this.#birdsEyeViewRenderer?.dispose();
		this.#isometricRenderer?.dispose();
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
		
		return (isometric? this.#isometricRenderer : this.#birdsEyeViewRenderer).render(quadRenderData);
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
	 * Works out the canvas size for a diagram of the given unscaled size, scaling it down if it exceeds `MAX_DIAGRAM_SIZE` in either dimension.
	 * @param {number} unscaledWidth
	 * @param {number} unscaledHeight
	 * @returns {[OffscreenCanvas, OffscreenCanvasRenderingContext2D]}
	 */
	#createScaledCanvas(unscaledWidth, unscaledHeight) {
		// diagrams are drawn at their natural size and the whole thing is scaled down by the context transform, so no drawing maths needs changing.
		let scale = min(1, MAX_DIAGRAM_SIZE / max(unscaledWidth, unscaledHeight));
		let width = max(1, ceil(unscaledWidth * scale));
		let height = max(1, ceil(unscaledHeight * scale));
		
		let can = new OffscreenCanvas(width, height);
		let ctx = getOffscreenCanvasContext(can, "2d");
		ctx.scale(scale, scale);
		return [can, ctx];
	}
	/**
	 * Stitches block icons together using the standard 2d canvas.
	 * @param {ImageBitmap[]} blockIconPalette
	 * @param {number[]} blockIndices
	 * @param {IStructure} structure
	 * @returns {Promise<Blob>}
	 */
	async #makeDiagramForLayer(blockIconPalette, blockIndices, structure) {
		let [can, ctx] = this.#createScaledCanvas(LAYER_DIAGRAM_BLOCK_RESOLUTION * structure.width, LAYER_DIAGRAM_BLOCK_RESOLUTION * structure.depth);
		
		try {
			for(let x = 0; x < structure.width; x++) {
				for(let z = 0; z < structure.depth; z++) {
					// draw second layer first, so the first layer (the main layer) draws on top
					for(let layer = 1; layer >= 0; layer--) {
						let indexIndex = (x * structure.depth + z) * 2 + layer;
						let blockIconIndex = blockIndices[indexIndex];
						if(blockIconIndex in blockIconPalette) {
							// Offset by -1 * size so the 3x3 block icon (size * 3) is centered over grid cell (x, z)
							ctx.drawImage(blockIconPalette[blockIconIndex], (x - 1) * LAYER_DIAGRAM_BLOCK_RESOLUTION, (z - 1) * LAYER_DIAGRAM_BLOCK_RESOLUTION);
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
	 * @param {IStructure} structure
	 * @returns {Promise<Blob>}
	 */
	async #makeIsometricDiagramForStructure(isometricBlockIconPalette, structure) {
		let { width, height, depth } = structure;
		// Canvas bounds fitting tightly around projected isometric structure bounds plus `ISOMETRIC_DIAGRAM_PADDING`:
		let [can, ctx] = this.#createScaledCanvas(
			ceil((width + depth) * this.#isoXStep + 2 * ISOMETRIC_DIAGRAM_PADDING),
			ceil((width + depth - 2) * this.#isoXYZStep + (height + 1) * this.#isoYYStep + 2 * ISOMETRIC_DIAGRAM_PADDING)
		);
		
		// Grid origin offsets to align minimum projected X and Y boundaries at `ISOMETRIC_DIAGRAM_PADDING`
		let offsetX = depth * this.#isoXStep + ISOMETRIC_DIAGRAM_PADDING;
		let offsetY = height * this.#isoYYStep + ISOMETRIC_DIAGRAM_PADDING;
		
		let blockDrawList = [];
		for(let y = 0; y < height; y++) {
			for(let x = 0; x < width; x++) {
				for(let z = 0; z < depth; z++) {
					let coords = tuple([x, y, z]);
					for(let layerI = 1; layerI >= 0; layerI--) {
						let blockIconIndex = structure.getPaletteIndex(coords, layerI);
						if(blockIconIndex in isometricBlockIconPalette) {
							// goofy maths for calculating depth and isometric coordinates (it works, trust trust)
							let diagramDepth = ((x + z) * height + y) * 2 - layerI;
							let isometricX = (x - z) * this.#isoXStep + offsetX;
							let isometricY = (x + z) * this.#isoXYZStep - y * this.#isoYYStep + offsetY;
							let blockIcon = isometricBlockIconPalette[blockIconIndex];
							blockDrawList.push({
								pos: tuple([isometricX, isometricY]),
								blockIcon,
								depth: diagramDepth
							});
						}
					}
				}
			}
		}
		
		blockDrawList.sort((a, b) => a.depth - b.depth);
		try {
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

/** @import { HoloPrintConfig } from "./common.types.ts" */
/** @import { PolyMeshTemplateFaceWithUvs, PolyMeshTemplateVertexWithUv } from "./PolyMeshMaker.types.ts" */
/** @import IStructure from "./structure/IStructure.ts" */