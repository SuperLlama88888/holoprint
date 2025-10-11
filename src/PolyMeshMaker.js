import { JSONMap, min, CoupleSet, TripleSet, vec3 } from "./utils.js";

const stringifyVec3 = "InternalError" in window? vec => vec[0] + "," + vec[1] + "," + vec[2] : vec => `${vec[0]},${vec[1]},${vec[2]}`;

export default class PolyMeshMaker {
	templatePalette;
	/** @type {[Vec3, number][][]} */
	#blocks = [];
	/** @type {JSONMap<Vec3, number>} */
	#positionsWithMultipleBlocks = new JSONMap([], stringifyVec3);
	
	/** @param {PolyMeshTemplateFaceWithUvs[][]} templatePalette */
	constructor(templatePalette) {
		this.templatePalette = templatePalette;
		for(let i in templatePalette) {
			this.#blocks[i] = [];
		}
	}
	/**
	 * Adds an entry from the template palette to the poly mesh, with an optional position offset.
	 * @param {number} paletteI
	 * @param {Vec3} [positionOffset]
	 * @param {number} [layer] 0 = primary layer, 1 = secondary layer
	 */
	add(paletteI, positionOffset = [0, 0, 0], layer = 0) {
		this.#blocks[paletteI].push([positionOffset, layer]);
		if(layer > 0) {
			this.#positionsWithMultipleBlocks.set(positionOffset, this.#positionsWithMultipleBlocks.size);
		}
	}
	/** @returns {PolyMesh} */
	export() {
		/** @type {TripleSet<number, number, number>} */
		let positions = new TripleSet();
		/** @type {TripleSet<number, number, number>} */
		let normals = new TripleSet();
		/** @type {CoupleSet<number, number>} */
		let uvs = new CoupleSet();
		
		let usedPaletteEntries = Object.entries(this.#blocks).filter(([, val]) => val.length);
		usedPaletteEntries.sort(([, a], [, b]) => b.length - a.length); // makes more common blocks have smaller indices
		let polysAndTransparencies = [];
		let facesToBeReordered = [];
		usedPaletteEntries.forEach(([paletteI, blockPositions]) => {
			let faces = this.templatePalette[+paletteI];
			for(let faceI = 0; faceI < faces.length; faceI++) {
				let face = faces[faceI];
				let normalIndex = normals.add(face["normal"]);
				let uvIndices = face["vertices"].map(vertex => uvs.add(vertex["uv"]));
				let polys = [];
				blockPositions.forEach(([blockPos, layer]) => {
					let facePolys = [];
					for(let vertexI = 0; vertexI < 4; vertexI++) {
						let pos = vec3.toFixed(vec3.add(blockPos, face["vertices"][vertexI]["pos"]), 4);
						let positionIndex = positions.add(pos);
						facePolys.push([positionIndex, normalIndex, uvIndices[vertexI]]);
					}
					polys.push(facePolys);
					if(this.#positionsWithMultipleBlocks.has(blockPos)) {
						let pairI = this.#positionsWithMultipleBlocks.get(blockPos);
						facesToBeReordered[pairI] ??= [];
						facesToBeReordered[pairI][layer] ??= [];
						facesToBeReordered[pairI][layer].push(facePolys);
					}
				});
				polysAndTransparencies.push({
					"transparency": face["transparency"],
					"polys": polys
				});
			}
		});
		polysAndTransparencies.sort((a, b) => a["transparency"] - b["transparency"]); // transparent blocks rendered later
		let polys = [].concat(...polysAndTransparencies.map(a => a["polys"])); // this is faster than .flat: https://stackoverflow.com/questions/61411776/is-js-native-array-flat-slow-for-depth-1
		facesToBeReordered.forEach(([primaryLayerFaces, secondaryLayerFaces]) => {
			let earliestSecondaryLayerFaceI = min(...secondaryLayerFaces.map(face => polys.indexOf(face)));
			primaryLayerFaces?.forEach(face => {
				let primaryLayerFaceI = polys.indexOf(face);
				if(primaryLayerFaceI > earliestSecondaryLayerFaceI) {
					polys.splice(primaryLayerFaceI, 1);
					polys.splice(earliestSecondaryLayerFaceI, 0, face); // move primary layer face before secondary layer face
					earliestSecondaryLayerFaceI++;
				}
			});
		});
		return {
			"normalized_uvs": true, // UV coords are really messed up if this is false, I haven't found a way to get it working.
			"positions": positions.values,
			"normals": normals.values,
			"uvs": uvs.values,
			"polys": polys
		};
	}
	clear() {
		for(let i in this.#blocks) {
			this.#blocks[i] = [];
		}
		this.#positionsWithMultipleBlocks.clear();
	}
}

/** @import { Vec3, PolyMeshTemplateFaceWithUvs, PolyMesh } from "./HoloPrint.js" */