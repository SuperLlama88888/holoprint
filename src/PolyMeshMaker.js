import { addVec3, JSONSet } from "./utils.js";

// InternalError is only in Firefox. This function will be run possibly hundreds of thousands of times so it's imperative that this is fast!
const stringifyVec2 = "InternalError" in window? vec => vec[0] + "," + vec[1] : vec => `${vec[0]},${vec[1]}`;
const stringifyVec3 = "InternalError" in window? vec => vec[0] + "," + vec[1] + "," + vec[2] : vec => `${vec[0]},${vec[1]},${vec[2]}`;

export default class PolyMeshMaker {
	templatePalette;
	/** @type {JSONSet<Vec3>} */
	#positions = new JSONSet([], stringifyVec3);
	/** @type {JSONSet<Vec3>} */
	#normals = new JSONSet([], stringifyVec3);
	/** @type {JSONSet<Vec2>} */
	#uvs = new JSONSet([], stringifyVec2);
	/** @type {Array<PolyMeshFace>} */
	#polys = [];
	/** @type {Map<number, Array<number>>} */
	#paletteNormals = new Map();
	/** @type {Map<number, Array<number>>} */
	#paletteUvs = new Map();
	
	/** @param {Array<Array<PolyMeshTemplateFaceWithUvs>>} [templatePalette] */
	constructor(templatePalette = []) {
		this.templatePalette = templatePalette;
	}
	/**
	 * Adds templates faces to the poly mesh, with an optional position offset.
	 * @param {Array<PolyMeshTemplateFaceWithUvs>} faces
	 * @param {Vec3} [positionOffset]
	 * @returns {[Array<number>, Array<number>]} Indices of the normals and uvs for the added faces.
	 */
	add(faces, positionOffset = [0, 0, 0]) {
		let normalIndices = [];
		let uvIndices = [];
		for(let faceI = 0; faceI < faces.length; faceI++) {
			let face = faces[faceI];
			let newPoly = [];
			let normalI = this.#normals.addI(face["normal"]);
			normalIndices[faceI] = normalI;
			for(let vertexI = 0; vertexI < 4; vertexI++) {
				let vertex = face["vertices"][vertexI];
				let pos = addVec3(vertex["pos"], positionOffset);
				let posI = this.#positions.addI(pos);
				let uvI = this.#uvs.addI(vertex["uv"]);
				uvIndices[faceI * 4 + vertexI] = uvI;
				newPoly.push([posI, normalI, uvI]);
			}
			this.#polys.push(newPoly);
		}
		return [normalIndices, uvIndices];
	}
	/**
	 * Adds an entry from the template palette to the poly mesh, with an optional position offset.
	 * @param {number} paletteI
	 * @param {Vec3} [positionOffset]
	 */
	addPaletteEntry(paletteI, positionOffset = [0, 0, 0]) {
		let faces = this.templatePalette[paletteI];
		if(this.#paletteNormals.has(paletteI)) { // since the same blocks have the same normals and uv coordinates, they can be cached
			let normalIndices = this.#paletteNormals.get(paletteI);
			let uvIndices = this.#paletteUvs.get(paletteI);
			for(let faceI = 0; faceI < faces.length; faceI++) {
				let face = faces[faceI];
				let newPoly = [];
				for(let vertexI = 0; vertexI < 4; vertexI++) {
					let vertex = face["vertices"][vertexI];
					let pos = addVec3(vertex["pos"], positionOffset);
					let posI = this.#positions.addI(pos);
					newPoly.push([posI, normalIndices[faceI], uvIndices[faceI * 4 + vertexI]]);
				}
				this.#polys.push(newPoly);
			}
		} else {
			let [normalIndices, uvIndices] = this.add(faces, positionOffset);
			this.#paletteNormals.set(paletteI, normalIndices);
			this.#paletteUvs.set(paletteI, uvIndices);
		}
	}
	/** @returns {PolyMesh} */
	export() {
		return {
			"normalized_uvs": true,
			"positions": Array.from(this.#positions),
			"normals": Array.from(this.#normals),
			"uvs": Array.from(this.#uvs),
			"polys": this.#polys
		};
	}
	clear() {
		this.#positions.clear();
		this.#normals.clear();
		this.#uvs.clear();
		this.#polys = [];
		this.#paletteNormals.clear();
		this.#paletteUvs.clear();
	}
}

/** @import { Vec3, Vec2, PolyMeshTemplateFaceWithUvs, PolyMeshFace, PolyMesh } from "./HoloPrint.js" */