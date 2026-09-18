import { jsonc, tuple, vec3 } from "./utils.js";

export default class EntityGeoMaker {
	/** @readonly @type {ResourcePackStack} */
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
		let geoFileRes = await this.resourcePackStack.fetchResource(entityModelInfo.geoFile);
		if(!geoFileRes.ok) {
			console.error(`Unable to load geometry file ${entityModelInfo.geoFile}`);
			return [];
		}
		let geoFile = await jsonc(geoFileRes);
		let matchingGeo = geoFile["minecraft:geometry"].find(geo => geo["description"]["identifier"] == entityModelInfo.identifier);
		if(!matchingGeo) {
			console.error(`Unable to find ${entityModelInfo.identifier} in geometry file ${entityModelInfo.geoFile}`);
			return [];
		}
		let textureWidth = matchingGeo["description"]["texture_width"];
		let textureHeight = matchingGeo["description"]["texture_height"];
		let cubes = [];
		matchingGeo["bones"].forEach(bone => {
			bone["cubes"]?.forEach(geoCube => {
				let cube = this.#getCubeFromGeoCube(geoCube, entityModelInfo.texture, [textureWidth, textureHeight], geoFile["format_version"]);
				if("inflate" in geoCube) {
					let { inflate } = geoCube;
					let inflate3 = tuple([inflate, inflate, inflate]);
					cube.pos = vec3.sub(cube.pos, inflate3);
					cube.size = vec3.add(cube.size, vec3.mul(inflate3, 2));
				}
				if("rotation" in geoCube) {
					cube.rot = geoCube["rotation"];
					cube.pivot = geoCube.pivot;
				}
				cubes.push(cube);
			});
		});
		return cubes;
	}
	
	/**
	 * Converts a cube from a `.geo.json` file into a cube used by HoloPrint, as found in `data/blockShapeGeos.json`.
	 * @param {object} geoCube
	 * @param {Data.TextureFace} texture
	 * @param {Vec2} textureSize
	 * @param {string} geoFileVersion
	 * @returns {Data.Cube}
	 */
	#getCubeFromGeoCube(geoCube, texture, textureSize, geoFileVersion) {
		switch(geoFileVersion) {
			case "1.12.0": return {
				pos: geoCube["origin"],
				size: geoCube["size"],
				translate: [8, 0, 8],
				boxUv: geoCube["uv"],
				boxUvSize: geoCube["size"],
				boxUvFlipEastWest: true,
				textures: {
					"*": texture
				},
				textureSize
			};
			case "1.21.0":
			case "1.26.50": {
				/** @type {Data.Cube} */
				let cube = {
					pos: geoCube["origin"],
					size: geoCube["size"],
					translate: [8, 0, 8],
					uv: {},
					uvSizes: {},
					uvRot: {
						// in MC the down/up faces on blocks are rotated 180 degrees compared to how they are in geometry; this does not happen on these new geo formats but is already accounted for in BlockGeoMaker.js so it must be effectively reverted here.
						"down": 180,
						"up": 180,
						"north": 0,
						"south": 0,
						"east": 0,
						"west": 0
					},
					flipTextureHorizontally: [],
					flipTextureVertically: [],
					textures: {
						"*": texture
					},
					textureSize
				};
				/** @type {Record<Data.Face, { uv: Vec2, uv_size: Vec2, uv_rotation?: number }>} */
				let cubeUvs = geoCube["uv"];
				Object.entries(cubeUvs).forEach(
					([face, uvInfo]) => {
						let { uv, uv_size: uvSize, uv_rotation: uvRot = 0 } = uvInfo;
						// some UV sizes may be negative because Mojang is like WHY NOT
						if(uvSize[0] < 0) {
							uv[0] += uvSize[0];
							uvSize[0] *= -1;
							cube.flipTextureHorizontally.push(face);
						}
						if(uvSize[1] < 0) {
							uv[1] += uvSize[1];
							uvSize[1] *= -1;
							cube.flipTextureVertically.push(face);
						}
						cube.uv[face] = uv;
						cube.uvSizes[face] = uvSize;
						cube.uvRot[face] += uvRot;
					}
				);
				return cube;
			}
		}
		console.error(`Unknown geo file format version: ${geoFileVersion}`);
		return {};
	}
}

/** @import ResourcePackStack from "./ResourcePackStack.js" */
/** @import { Vec2 } from "./common.types.ts" */
/** @import * as Data from "./data/schemas" */