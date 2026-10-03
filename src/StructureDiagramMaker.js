import { areArraysEqual, assert, average, ceil, fnv1a, getOffscreenCanvasContext, HashMap, hypot, max, min, sqrt, stringToImageData, toBlob, tuple, vec2 } from "./utils.js";
import WebGL2QuadRenderer from "./WebGL2QuadRenderer.js"; // dependency injection coming soon^tm

/** Padding in pixels to be added around the edges of isometric diagrams. */
const ISOMETRIC_DIAGRAM_PADDING = 8;
/** The highest resolution, in pixels, of a block's textures in the texture atlas. When structures are small, layer-by-layer diagrams are drawn at exactly this resolution, such that 1 block pixel is 1 diagram pixel. This intentionally loses detail for blocks which are angled or in some other way don't conform to the block grid (e.g. side torches), because keeping them at full detail inflates the pack size beyond what I am willing to accept. For larger structures, they will be scaled down anyway since the excess resolution won't be needed. */
const MAX_LAYER_DIAGRAM_BLOCK_RESOLUTION = 16;
/** Maximum resolution, in pixels, of each block in the isometric diagram. Each structure may use a lower resolution if it isn't needed. */
const MAX_ISOMETRIC_DIAGRAM_BLOCK_RESOLUTION = 64;
/** Minimum resolution, in pixels, of a renderer. On large structures, when the max diagram texture size is set low, WebGL rasterisation can miss blocks entirely for block icons, meaning that they become invisible. This ensures that renderers can never be too small (and really, at these tiny sizes, memory implications are negligible anyway). */
const MIN_RENDERER_RESOLUTION = 8;

export default class StructureDiagramMaker {
	/** @readonly @type {number} The maximum width and height, in pixels, of any diagram. Anything bigger than this is scaled down to fit. */
	#maxTextureSize;
	/** @readonly @type {number} Effective 2D block resolution (<= `MAX_LAYER_DIAGRAM_BLOCK_RESOLUTION`), shared across all structures. */
	#layerBlockResolution;
	/** @readonly @type {TexImageSource} */
	#texture;
	/** @readonly @type {WebGL2QuadRenderer | null} */
	#birdsEyeViewRenderer = null;
	
	/**
	 * @param {TexImageSource} texture The texture atlas to make block icons out of. Must not have texture outlines, as they look bad on diagrams.
	 * @param {Vec3[]} structureSizes
	 * @param {number} maxTextureSize The maximum width and height, in pixels, of any diagram. Anything bigger than this is scaled down to fit.
	 */
	constructor(texture, structureSizes, maxTextureSize) {
		assert(structureSizes.length > 0, "StructureDiagramMaker should receive at least one structure");
		
		this.#texture = texture;
		this.#maxTextureSize = maxTextureSize;
		this.#layerBlockResolution = this.#computeLayerBlockResolution(structureSizes);
		
		if(WebGL2QuadRenderer.isSupported()) {
			this.#birdsEyeViewRenderer = this.#makeRenderer(this.#layerBlockResolution * 3);
		} else {
			console.error("Cannot make structure diagrams - WebGL2 is not supported!");
		}
	}
	/**
	 * @param {Vec3[]} structureSizes
	 * @returns {number}
	 */
	#computeLayerBlockResolution(structureSizes) {
		let maxDim = max(...structureSizes.flatMap(([width, _, depth]) => [width, depth]));
		return min(MAX_LAYER_DIAGRAM_BLOCK_RESOLUTION, this.#maxTextureSize / maxDim);
	}
	/**
	 * @param {IStructure} structure
	 * @returns {number}
	 */
	#computeIsometricBlockResolution(structure) {
		let { width, height, depth } = structure;
		let available = this.#maxTextureSize - 2 * ISOMETRIC_DIAGRAM_PADDING;
		let fitW = available / ((width + depth) * 0.5);
		let fitH = available / ((0.5 * (width + depth - 2) + height + 1) / sqrt(3));
		return min(MAX_ISOMETRIC_DIAGRAM_BLOCK_RESOLUTION, fitW, fitH);
	}
	/**
	 * Derives isometric layout steps from a block resolution.
	 * @param {number} blockResolution
	 */
	#getIsometricLayout(blockResolution) {
		let isoBlockIconSize = blockResolution * 3;
		return {
			isoXStep: blockResolution * 0.5,
			isoXYZStep: blockResolution * 0.5 / sqrt(3),
			isoYYStep: blockResolution / sqrt(3),
			isoBlockIconSize,
			isoBlockIconOffset: isoBlockIconSize / 2
		};
	}
	/**
	 * Makes a `WebGL2QuadRenderer` for block icons at a given icon resolution, returning null if it couldn't be made.
	 * @param {number} iconResolution
	 * @returns {WebGL2QuadRenderer | null}
	 */
	#makeRenderer(iconResolution) {
		try {
			return new WebGL2QuadRenderer(max(MIN_RENDERER_RESOLUTION, iconResolution), this.#texture);
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
		return polyMeshTemplatePalette.map(faces => this.#getIconForBlockFromFaces(faces, false, this.#birdsEyeViewRenderer));
	}
	/**
	 * Makes a palette of isometric block icons from a palette of poly mesh templates.
	 * @param {PolyMeshTemplateFaceWithUvs[][]} polyMeshTemplatePalette
	 * @param {WebGL2QuadRenderer} renderer
	 * @returns {ImageBitmap[]}
	 */
	makeIsometricViewBlockIconPalette(polyMeshTemplatePalette, renderer) {
		return polyMeshTemplatePalette.map(faces => this.#getIconForBlockFromFaces(faces, true, renderer));
	}
	/**
	 * Makes all the diagrams (3D isometric at index 0, 2D layers at index 1+) for an array of structures.
	 * @param {PolyMeshTemplateFaceWithUvs[][]} polyMeshTemplatePalette
	 * @param {IStructure[]} structures
	 * @returns {Promise<{ diagrams: Blob[], indices: number[][] }>}
	 */
	async makeDiagramsForStructures(polyMeshTemplatePalette, structures) {
		if(!this.#birdsEyeViewRenderer) {
			let errorImage = await toBlob(stringToImageData("Couldn't create diagrams"));
			let indices = structures.map(structure => (new Array(structure.height + 1)).fill(0));
			return {
				diagrams: [errorImage],
				indices
			};
		}
		
		let blockIconPalette = this.makeBirdsEyeViewBlockIconPalette(polyMeshTemplatePalette);
		
		/** @type {Promise<Blob>[]} */
		let diagramBlobPromises = [];
		/** @type {HashMap<number[], number, number>} */
		let diagramIndicesHashMap = new HashMap(indices => fnv1a(indices), areArraysEqual);
		/** @type {number[][]} */
		let diagramBlobIndices = new Array(structures.length);
		structures.forEach((structure, structureI) => {
			/** @type {number[]} */
			let diagramBlobIndicesForStructure = new Array(structure.height + 1);
			
			let isoBlockResolution = this.#computeIsometricBlockResolution(structure);
			let isometricRenderer = this.#makeRenderer(isoBlockResolution * 3);
			if(isometricRenderer) {
				let isometricBlockIconPalette = this.makeIsometricViewBlockIconPalette(polyMeshTemplatePalette, isometricRenderer);
				isometricRenderer.dispose();
				diagramBlobIndicesForStructure[0] = diagramBlobPromises.length;
				
				let isoDiagramPromise = this.#makeIsometricDiagramForStructure(isometricBlockIconPalette, structure, isoBlockResolution);
				diagramBlobPromises.push(isoDiagramPromise.catch(async e => {
					this.#disposeBlockIconPalette(isometricBlockIconPalette);
					console.error(`Failed to make isometric diagram: ${e}`, e?.stack);
					return await toBlob(stringToImageData("Couldn't create isometric diagram"));
				}).finally(() => this.#disposeBlockIconPalette(isometricBlockIconPalette)));
			} else {
				diagramBlobIndicesForStructure[0] = diagramBlobPromises.length;
				diagramBlobPromises.push(toBlob(stringToImageData("Couldn't create isometric diagram")));
			}
			
			// layer-by-layer diagrams are cached based on the hash of the palette indices on each layer. (Can't believe I had to implement a hash map myself in the big 26)
			for(let y = 0; y < structure.height; y++) {
				/** @type {number[]} */
				let indices = new Array(structure.width * structure.depth * 2);
				let indicesI = 0;
				for(let x = 0; x < structure.width; x++) {
					for(let z = 0; z < structure.depth; z++) {
						let paletteIndices = structure.getPaletteIndicesForBothLayers([x, y, z]);
						indices[indicesI++] = paletteIndices[0];
						indices[indicesI++] = paletteIndices[1];
					}
				}
				let layerKey = [structure.width, structure.depth, ...indices];
				let index = diagramIndicesHashMap.get(layerKey);
				if(index == undefined) {
					index = diagramBlobPromises.length;
					diagramIndicesHashMap.set(layerKey, index);
					diagramBlobPromises.push(this.#makeDiagramForLayer(blockIconPalette, indices, structure));
				}
				diagramBlobIndicesForStructure[y + 1] = index;
			}
			diagramBlobIndices[structureI] = diagramBlobIndicesForStructure;
		});
		
		// The new "using" statement is not yet widely supported, so I need to manually write this. esbuild can transpile it but it's soooo bloated. Maybe in 5 years...
		let diagramBlobs = await Promise.all(diagramBlobPromises);
		this.#disposeBlockIconPalette(blockIconPalette);
		
		return {
			diagrams: diagramBlobs,
			indices: diagramBlobIndices
		};
	}
	dispose() {
		this.#birdsEyeViewRenderer?.dispose();
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
	 * @param {WebGL2QuadRenderer} renderer
	 * @returns {ImageBitmap}
	 */
	#getIconForBlockFromFaces(faces, isometric, renderer) {
		let faceData = faces.map(face => ({ normal: face.normal, vertices: face.vertices }));
		if(!isometric) {
			// check if the faces won't be visible when viewed from a bird's-eye view (e.g. cross_texture blocks). if this happens, we swizzle the y and z axes so it's effectively looking from the side.
			if(faceData.every(({ vertices }) => this.#isFaceInvisibleFromAbove(vertices))) {
				faceData = structuredClone(faceData);
				faceData.forEach(({ vertices }) => vertices.forEach(v => {
					v.pos = [v.pos[0], v.pos[2], 16 - v.pos[1]];
				}));
			}
		}
		let depthSortedFaceData = faceData.map(({ normal, vertices }) => {
			if(isometric) {
				return {
					normal,
					vertices,
					depth: average(vertices.map(({ pos: p }) => (16 - p[0]) + p[2] + p[1] * 2 * sqrt(3))) // it works
				};
			} else {
				return {
					normal,
					vertices,
					depth: average(vertices.map(({ pos: [, y] }) => y))
				};
			}
		}).sort((a, b) => a.depth - b.depth);
		
		// Convert face vertex data into flat inputs acceptable by the WebGL engine
		let quadRenderData = depthSortedFaceData.map(({ normal, vertices }) => {
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
			let brightness = isometric? StructureDiagramMaker.computeFlatShading(normal) : 1;
			return { positions, uvs, brightness };
		});
		
		return renderer.render(quadRenderData);
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
	 * @param {IStructure} structure
	 * @returns {Promise<Blob>}
	 */
	async #makeDiagramForLayer(blockIconPalette, blockIndices, structure) {
		let can = new OffscreenCanvas(this.#layerBlockResolution * structure.width, this.#layerBlockResolution * structure.depth);
		let ctx = getOffscreenCanvasContext(can, "2d");
		// Explicit draw size so the icon stays centered even when its intrinsic (rounded WebGL) size differs from the exact float size by up to 0.5px.
		let iconDrawSize = this.#layerBlockResolution * 3;
		
		try {
			for(let x = 0; x < structure.width; x++) {
				for(let z = 0; z < structure.depth; z++) {
					// draw second layer first, so the first layer (the main layer) draws on top
					for(let layer = 1; layer >= 0; layer--) {
						let indexIndex = (x * structure.depth + z) * 2 + layer;
						let blockIconIndex = blockIndices[indexIndex];
						if(blockIconIndex in blockIconPalette) {
							// Offset by -1 * size so the 3x3 block icon (size * 3) is centered over grid cell (x, z)
							ctx.drawImage(blockIconPalette[blockIconIndex], (x - 1) * this.#layerBlockResolution, (z - 1) * this.#layerBlockResolution, iconDrawSize, iconDrawSize);
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
	 * @param {number} blockResolution
	 * @returns {Promise<Blob>}
	 */
	async #makeIsometricDiagramForStructure(isometricBlockIconPalette, structure, blockResolution) {
		let { width, height, depth } = structure;
		let { isoXStep, isoXYZStep, isoYYStep, isoBlockIconSize, isoBlockIconOffset } = this.#getIsometricLayout(blockResolution);
		// Canvas bounds fitting tightly around projected isometric structure bounds plus `ISOMETRIC_DIAGRAM_PADDING`:
		let can = new OffscreenCanvas(ceil((width + depth) * isoXStep + 2 * ISOMETRIC_DIAGRAM_PADDING), ceil((width + depth - 2) * isoXYZStep + (height + 1) * isoYYStep + 2 * ISOMETRIC_DIAGRAM_PADDING));
		let ctx = getOffscreenCanvasContext(can, "2d");
		
		// Grid origin offsets to align minimum projected X and Y boundaries at `ISOMETRIC_DIAGRAM_PADDING`
		let offsetX = depth * isoXStep + ISOMETRIC_DIAGRAM_PADDING;
		let offsetY = height * isoYYStep + ISOMETRIC_DIAGRAM_PADDING;
		
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
							let isometricX = (x - z) * isoXStep + offsetX;
							let isometricY = (x + z) * isoXYZStep - y * isoYYStep + offsetY;
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
				ctx.drawImage(blockIcon, pos[0] - isoBlockIconOffset, pos[1] - isoBlockIconOffset, isoBlockIconSize, isoBlockIconSize);
			});
			return await can.convertToBlob();
		} catch(e) {
			let errorMessage = `Failed to draw image: ${e}`;
			console.error(errorMessage);
			return await toBlob(stringToImageData(errorMessage));
		}
	}
	
	/**
	 * Calculates the brightness based on a face normal using flat shading. This is based on the MCBE entity.vertex shader (pre-Renderdragon at least).
	 * @param {Vec3} normal Face normal (normalised defensively here).
	 * @returns {number} Multiplier in [~0.45, 1]; top faces brightest.
	 */
	static computeFlatShading(normal) {
		// copied straight from entity.vertex lol
		const AMBIENT = 0.45;
		const XFAC = -0.1;
		const ZFAC = 0.1;
		
		let [nx, ny, nz] = normal;
		let len = hypot(...normal);
		if(len > 0) {
			nx /= len;
			ny /= len;
			nz /= len;
		} else {
			console.warn("Invalid surface normal!"); // ahhhhhhh
		}
		
		let yLight = (1 + ny) * 0.5;
		return yLight * (1 - AMBIENT) + nx * nx * XFAC + nz * nz * ZFAC + AMBIENT;
	}
}

/** @import { PolyMeshTemplateFaceWithUvs, PolyMeshTemplateVertexWithUv } from "./PolyMeshMaker.types.ts" */
/** @import { Vec3 } from "./common.types.ts" */
/** @import IStructure from "./structure/IStructure.ts" */