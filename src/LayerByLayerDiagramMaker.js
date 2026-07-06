import { areArraysEqual, average, fnv1a, getOffscreenCanvasContext, getStructureIndexFromCoordinates, HashMap } from "./utils.js";
import WebGL2QuadRenderer from "./WebGL2QuadRenderer.js"; // dependency injection coming soon^tm

export default class LayerByLayerDiagramMaker {
	/** @readonly */
	size;
	/** @readonly */
	#renderer;
	
	/**
	 * @param {HoloPrintConfig} config 
	 * @param {HTMLImageElement} texture
	 */
	constructor(config, texture) {
		this.size = config.LAYER_BY_LAYER_DIAGRAM_BLOCK_RESOLUTION;
		// Instantiate our dedicated extracted rendering engine
		this.#renderer = new WebGL2QuadRenderer(this.size, texture);
	}
	
	/**
	 * Makes a palette of block icons from a palette of poly mesh templates.
	 * @param {PolyMeshTemplateFaceWithUvs[][]} polyMeshTemplatePalette
	 * @returns {ImageBitmap[]}
	 */
	makeBlockIconPalette(polyMeshTemplatePalette) {
		return polyMeshTemplatePalette.map(faces => this.#getIconForBlockFromFaces(faces));
	}
	/**
	 * Makes all the diagrams for an array of structures, returning them as `Blob`s of images and an array of indices for each layer per structure.
	 * @param {ImageBitmap[]} blockIconPalette
	 * @param {[Int32Array, Int32Array][]} structureIndicesByLayerByStructure
	 * @param {I32Vec3[]} structureSizes
	 * @returns {Promise<{ diagrams: Blob[], indices: number[][] }>}
	 */
	async makeDiagramsForStructures(blockIconPalette, structureIndicesByLayerByStructure, structureSizes) {
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
	 * @returns {ImageBitmap}
	 */
	#getIconForBlockFromFaces(faces) {
		let sortedFaces = faces.map(face => ({
			face,
			depth: average(face.vertices.map(v => v.pos[1]))
		})).sort((a, b) => a.depth - b.depth);
		
		// Convert face vertex data into flat inputs acceptable by the WebGL engine
		let quadRenderData = sortedFaces.map(({ face }) => ({
			positions: new Float32Array([
				1 - face.vertices[0].pos[0] / 16, face.vertices[0].pos[2] / 16,
				1 - face.vertices[1].pos[0] / 16, face.vertices[1].pos[2] / 16,
				1 - face.vertices[2].pos[0] / 16, face.vertices[2].pos[2] / 16,
				1 - face.vertices[3].pos[0] / 16, face.vertices[3].pos[2] / 16
			]),
			uvs: new Float32Array([
				face.vertices[0].uv[0], 1 - face.vertices[0].uv[1],
				face.vertices[1].uv[0], 1 - face.vertices[1].uv[1],
				face.vertices[2].uv[0], 1 - face.vertices[2].uv[1],
				face.vertices[3].uv[0], 1 - face.vertices[3].uv[1]
			])
		}));
		
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
						ctx.drawImage(blockIconPalette[blockIconIndex], x * this.size, z * this.size);
					}
					// not in blockIconPalette means it's an excluded block, e.g. air
				}
			}
		}
		return await can.convertToBlob();
	}
}

/** @import { HoloPrintConfig, I32Vec3, PolyMeshTemplateFaceWithUvs } from "./HoloPrint.js" */