import { average, getOffscreenCanvasContext, tuple } from "./utils.js";
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
	 * Makes all the diagrams for a structure, returning them as `Blob`s of images.
	 * @param {ImageBitmap[]} blockIconPalette
	 * @param {[Int32Array, Int32Array]} structureIndicesByLayer
	 * @param {I32Vec3} structureSize
	 * @returns {Promise<Blob[]>}
	 */
	async makeDiagramsForStructure(blockIconPalette, structureIndicesByLayer, structureSize) {
		let diagramPromises = [];
		for(let y = 0; y < structureSize[1]; y++) {
			let indices = [];
			for(let x = 0; x < structureSize[0]; x++) {
				let indicesForRow = [];
				for(let z = 0; z < structureSize[2]; z++) {
					let blockI = (x * structureSize[1] + y) * structureSize[2] + z;
					indicesForRow.push(tuple([structureIndicesByLayer[0][blockI], structureIndicesByLayer[1][blockI]]));
				}
				indices.push(indicesForRow);
			}
			diagramPromises.push(this.#makeDiagramForLayer(blockIconPalette, indices));
		}
		return await Promise.all(diagramPromises);
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
		
		// Convert data structural representation into flat inputs acceptable by the WebGL Engine
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
	 * @param {Vec2[][]} blockIndices
	 * @returns {Promise<Blob>}
	 */
	async #makeDiagramForLayer(blockIconPalette, blockIndices) {
		let can = new OffscreenCanvas(this.size * blockIndices.length, this.size * blockIndices[0].length);
		let ctx = getOffscreenCanvasContext(can, "2d", {
			willReadFrequently: true
		});
		
		blockIndices.forEach((indices, x) => {
			indices.forEach((indicesPerLayer, z) => {
				for(let layer = 1; layer >= 0; layer--) {
					let i = indicesPerLayer[layer];
					if(i in blockIconPalette) {
						ctx.drawImage(blockIconPalette[i], x * this.size, z * this.size);
					}
				}
			});
		});
		return await can.convertToBlob();
	}
}

/** @import { HoloPrintConfig, I32Vec3, PolyMeshTemplateFaceWithUvs, Vec2 } from "./HoloPrint.js" */