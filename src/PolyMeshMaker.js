import { addVec3, JSONSet } from "./utils.js";

// InternalError is only in Firefox. This function will be run possibly hundreds of thousands of times per pack so it's imperative that this is fast!
const stringifyVec2 = "InternalError" in window? vec => vec[0] + "," + vec[1] : vec => `${vec[0]},${vec[1]}`;
const stringifyVec3 = "InternalError" in window? vec => vec[0] + "," + vec[1] + "," + vec[2] : vec => `${vec[0]},${vec[1]},${vec[2]}`;

export default class PolyMeshMaker {
	templatePalette;
	/** @type {Array<Array<Vec3>>} */
	#blocks = [];
	
	/** @param {Array<Array<PolyMeshTemplateFaceWithUvs>>} templatePalette */
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
	 */
	add(paletteI, positionOffset = [0, 0, 0]) {
		this.#blocks[paletteI].push(positionOffset);
	}
	/** @returns {PolyMesh} */
	export() {
		let positions = new JSONSet([], stringifyVec3);
		let normals = new JSONSet([], stringifyVec3);
		let uvs = new JSONSet([], stringifyVec2);
		
		let usedPaletteEntries = Object.entries(this.#blocks).filter(([, val]) => val.length);
		usedPaletteEntries.sort(([, a], [, b]) => b.length - a.length); // makes more common blocks have smaller indices
		let polysAndTransparencies = [];
		usedPaletteEntries.forEach(([paletteI, blockPositions]) => {
			let faces = this.templatePalette[+paletteI];
			for(let faceI = 0; faceI < faces.length; faceI++) {
				let face = faces[faceI];
				let normalIndex = normals.addI(face["normal"]);
				let uvIndices = face["vertices"].map(vertex => uvs.addI(vertex["uv"]));
				let polys = [];
				blockPositions.forEach(blockPos => {
					let facePolys = [];
					for(let vertexI = 0; vertexI < 4; vertexI++) {
						let positionIndex = positions.addI(addVec3(blockPos, face["vertices"][vertexI]["pos"]));
						facePolys.push([positionIndex, normalIndex, uvIndices[vertexI]]);
					}
					polys.push(facePolys);
				});
				polysAndTransparencies.push({
					"transparency": face["transparency"],
					"polys": polys
				});
			}
		});
		polysAndTransparencies.sort((a, b) => a["transparency"] - b["transparency"]); // transparent blocks rendered later
		let polys = [].concat(...polysAndTransparencies.map(a => a["polys"])); // this is faster than .flat: https://stackoverflow.com/questions/61411776/is-js-native-array-flat-slow-for-depth-1
		return {
			"normalized_uvs": true, // UV coords are really messed up if this is false, I haven't found a way to get it working.
			"positions": Array.from(positions),
			"normals": Array.from(normals),
			"uvs": Array.from(uvs),
			"polys": polys
		};
	}
	clear() {
		for(let i in this.#blocks) {
			this.#blocks[i] = [];
		}
	}
}

/** @import { Vec3, PolyMeshTemplateFaceWithUvs, PolyMesh } from "./HoloPrint.js" */