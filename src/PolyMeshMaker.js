import { JSONSet } from "./utils.js";

export default class PolyMeshMaker {
	/** @type {JSONSet<Vec3>} */
	#positions = new JSONSet();
	/** @type {JSONSet<Vec3>} */
	#normals = new JSONSet();
	/** @type {JSONSet<Vec2>} */
	#uvs = new JSONSet();
	/** @type {Array<PolyMeshFace>} */
	#polys = [];
	
	/**
	 * Adds templates faces to the poly mesh, with an optional position offset.
	 * @param {Array<PolyMeshTemplateFaceWithUvs>} faces
	 * @param {Vec3} [positionOffset]
	 */
	add(faces, positionOffset = [0, 0, 0]) {
		faces.forEach(face => {
			let newPoly = [];
			let normalI = this.#normals.addI(face["normal"]);
			for(let i = 0; i < 4; i++) {
				let vertex = face["vertices"][i];
				let pos = [vertex["pos"][0] + positionOffset[0], vertex["pos"][1] + positionOffset[1], vertex["pos"][2] + positionOffset[2]];
				let posI = this.#positions.addI(pos);
				let uvI = this.#uvs.addI(vertex["uv"]);
				newPoly.push([posI, normalI, uvI]);
			}
			this.#polys.push(newPoly);
		});
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
	}
}

/** @import { Vec3, Vec2, PolyMeshTemplateFaceWithUvs, PolyMeshFace, PolyMesh } from "./HoloPrint.js" */