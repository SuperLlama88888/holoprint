import { addVec3, jsonc, mulVec3, subVec3, tuple } from "./utils.js";

export default class EntityGeoMaker {
	resourcePackStack;
	
	/**
	 * @param {ResourcePackStack} resourcePackStack
	 */
	constructor(resourcePackStack) {
		this.resourcePackStack = resourcePackStack;
	}
	/**
	 * Generates regular cubes from an entity model.
	 * @param {Data.EntityModelInfo} entityModelInfo
	 * @returns {Promise<Data.Cube[]>}
	 */
	async entityModelToCubes(entityModelInfo) {
		let geoFile = await this.resourcePackStack.fetchResource(entityModelInfo["geo_file"]).then(res => jsonc(res));
		let matchingGeo = geoFile["minecraft:geometry"].find(geo => geo["description"]["identifier"] == entityModelInfo["identifier"]);
		let textureWidth = matchingGeo["description"]["texture_width"];
		let textureHeight = matchingGeo["description"]["texture_height"];
		let cubes = [];
		matchingGeo["bones"].forEach(bone => {
			bone["cubes"]?.forEach(geoCube => {
				/** @type {Data.Cube} */
				let cube = {
					"pos": geoCube["origin"],
					"size": geoCube["size"],
					"translate": [8, 0, 8],
					"box_uv": geoCube["uv"],
					"box_uv_size": geoCube["size"],
					"textures": {
						"*": entityModelInfo["texture"]
					},
					"texture_size": [textureWidth, textureHeight]
				};
				if("inflate" in geoCube) {
					let { inflate } = geoCube;
					let inflate3 = tuple([inflate, inflate, inflate]);
					cube["pos"] = subVec3(cube["pos"], inflate3);
					cube["size"] = addVec3(cube["size"], mulVec3(inflate3, 2));
				}
				if("rotation" in geoCube) {
					cube["rot"] = geoCube["rotation"];
					cube["pivot"] = geoCube["pivot"];
				}
				cubes.push(cube);
			});
		});
		return cubes;
	}
}

/** @import ResourcePackStack from "./ResourcePackStack.js" */
/** @import * as Data from "./data/schemas" */