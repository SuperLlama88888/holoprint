import { jsonc, tuple, vec3 } from "./utils.js";

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
		let geoFileRes = await this.resourcePackStack.fetchResource(entityModelInfo["geo_file"]);
		if(!geoFileRes.ok) {
			console.error(`Unable to load geometry file ${entityModelInfo["geo_file"]}`);
			return [];
		}
		let geoFile = await jsonc(geoFileRes);
		let matchingGeo = geoFile["minecraft:geometry"].find(geo => geo["description"]["identifier"] == entityModelInfo["identifier"]);
		if(!matchingGeo) {
			console.error(`Unable to find ${entityModelInfo["identifier"]} in geometry file ${entityModelInfo["geo_file"]}`);
			return [];
		}
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
					"box_uv_flip_east_west": true,
					"textures": {
						"*": entityModelInfo["texture"]
					},
					"texture_size": [textureWidth, textureHeight]
				};
				if("inflate" in geoCube) {
					let { inflate } = geoCube;
					let inflate3 = tuple([inflate, inflate, inflate]);
					cube["pos"] = vec3.sub(cube["pos"], inflate3);
					cube["size"] = vec3.add(cube["size"], vec3.mul(inflate3, 2));
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