// this looks interesting: https://github.com/PrismarineJS/minecraft-data/blob/master/data/bedrock/1.20.71/blockCollisionShapes.json (Object.fromEntries(Object.entries(d.blocks).map(([name, indices])=>[name,indices.map(i=>d.shapes[i])])))
// READ: this also looks pretty comprehensive: https://github.com/MCBE-Development-Wiki/mcbe-dev-home/blob/main/docs/misc/enums/block_shape.md
// https://github.com/bricktea/MCStructure/blob/main/docs/1.16.201/enums/B.md

import { awaitAllEntries, hexColorToClampedTriplet, JSONSet } from "./essential.js";

// https://wiki.bedrock.dev/visuals/material-creations.html#overlay-color-in-render-controllers
// https://wiki.bedrock.dev/documentation/materials.html#entity-alphatest

export default class BlockGeoMaker {
	/** @type {HoloPrintConfig} */
	config;
	textureRefs;
	
	#individualBlockShapes;
	#blockShapePatterns;
	#blockShapeGeos;
	#eigenvariants;
	
	#globalBlockStateRotations;
	#blockShapeBlockStateRotations;
	#blockNameBlockStateRotations;
	#blockNamePatternBlockStateRotations;
	
	#globalBlockStateTextureVariants;
	#blockShapeBlockStateTextureVariants;
	#blockNameBlockStateTextureVariants;
	#blockNamePatternBlockStateTextureVariants;
	
	#cachedBlockShapes;
	
	constructor(config) {
		return (async () => {
			this.config = config;
			
			this.textureRefs = new JSONSet();
			
			let { blockShapes, blockShapeGeos, blockStateDefs, eigenvariants } = await awaitAllEntries({
				blockShapes: fetch("data/blockShapes.json").then(res => res.jsonc()),
				blockShapeGeos: fetch("data/blockShapeGeos.json").then(res => res.jsonc()),
				blockStateDefs: fetch("data/blockStateDefinitions.json").then(res => res.jsonc()),
				eigenvariants: fetch("data/blockEigenvariants.json").then(res => res.jsonc()),
			});
			this.#individualBlockShapes = blockShapes["individual_blocks"];
			this.#blockShapePatterns = Object.entries(blockShapes["patterns"]).map(([rule, blockShape]) => [new RegExp(rule), blockShape]); // store regular expressions from the start to avoid recompiling them every time
			this.#blockShapeGeos = blockShapeGeos;
			this.#eigenvariants = eigenvariants;
			
			// console.log(this.#blockShapeGeos)
			
			// block-state-driven rotations/texture variants can either be global, based on block shape, based on specific block names, or based on regular expressions for block names, hence the many variables.
			this.#globalBlockStateRotations = blockStateDefs["rotations"]["*"];
			this.#blockShapeBlockStateRotations = [];
			Object.entries(blockStateDefs["rotations"]["block_shapes"] ?? {}).forEach(([blockShapes, rotationDefs]) => {
				blockShapes.split(",").forEach(blockShape => {
					this.#blockShapeBlockStateRotations[blockShape] = rotationDefs;
				});
			});
			this.#blockNameBlockStateRotations = [];
			this.#blockNamePatternBlockStateRotations = [];
			Object.entries(blockStateDefs["rotations"]["block_names"] ?? {}).forEach(([blockNames, rotationDefs]) => {
				if(blockNames.startsWith("/") && blockNames.endsWith("/")) {
					this.#blockNamePatternBlockStateRotations.push([new RegExp(blockNames.slice(1, -1)), rotationDefs]);
				} else {
					blockNames.split(",").forEach(blockName => {
						this.#blockNameBlockStateRotations[blockName] = rotationDefs; // todo: make these Maps?
					});
				}
			});
			
			this.#globalBlockStateTextureVariants = blockStateDefs["texture_variants"]["*"];
			this.#blockShapeBlockStateTextureVariants = [];
			Object.entries(blockStateDefs["texture_variants"]["block_shapes"] ?? {}).forEach(([blockShapes, textureVariantDefs]) => {
				blockShapes.split(",").forEach(blockShape => {
					this.#blockShapeBlockStateTextureVariants[blockShape] = textureVariantDefs;
				});
			});
			this.#blockNameBlockStateTextureVariants = [];
			this.#blockNamePatternBlockStateTextureVariants = [];
			Object.entries(blockStateDefs["texture_variants"]["block_names"] ?? {}).forEach(([blockNames, textureVariantDefs]) => {
				if(blockNames.startsWith("/") && blockNames.endsWith("/")) {
					this.#blockNamePatternBlockStateTextureVariants.push([new RegExp(blockNames.slice(1, -1)), textureVariantDefs]);
				} else {
					blockNames.split(",").forEach(blockName => {
						this.#blockNameBlockStateTextureVariants[blockName] = textureVariantDefs;
					});
				}
			});
			
			this.#cachedBlockShapes = new Map();
			
			return this;
		})();
	}
	/**
	 * Makes a bone template (i.e. unpositioned, nameless bone with geometry) from a block. Texture UVs are unresolved, and are indices for the textureRefs property.
	 * @param {Block} block
	 * @returns {BoneTemplate}
	 */
	makeBoneTemplate(block) {
		let blockName = block["name"];
		let blockShape = this.#getBlockShape(blockName);
		let boneCubes = this.#makeBoneCubes(block, blockShape);
		if(boneCubes.length == 0) {
			console.debug(`No cubes are being rendered for block ${blockName}`);
		}
		let bone = {
			"cubes": boneCubes
		};
		if(blockShape.includes("{")) {
			blockShape = blockShape.slice(0, blockShape.indexOf("{"));
		}
		let blockShapeSpecificRotations = this.#blockShapeBlockStateRotations[blockShape];
		let blockNameSpecificRotations = this.#blockNameBlockStateRotations[blockName];
		let statesAndBlockEntityData = this.#getBlockStatesAndEntityDataEntries(block);
		statesAndBlockEntityData.forEach(([blockStateName, blockStateValue]) => {
			let rotations = blockNameSpecificRotations?.[blockStateName] ?? this.#blockNamePatternBlockStateRotations.find(([pattern, rotations]) => pattern.test(blockName) && blockName in rotations)?.[1] ?? blockShapeSpecificRotations?.[blockStateName] ?? this.#globalBlockStateRotations[blockStateName]; // order: block name (exact match), block name (regular expression pattern), block shape, global
			if(!rotations) {
				return; // this block state doesn't control rotation
			}
			
			if(!(blockStateValue in rotations)) {
				console.error(`Block state value ${blockStateValue} for rotation block state ${blockStateName} not found on ${blockName}...`, block);
				return;
			}
			if("rotation" in bone) {
				console.debug(`Multiple rotation block states for block ${block["name"]}; adding them all together!`);
				bone["rotation"] = bone["rotation"].map((x, i) => x + rotations[blockStateValue][i]);
			} else {
				bone["rotation"] = rotations[blockStateValue];
				bone["pivot"] = [8, 8, 8];
			}
		});
		if(bone["rotation"]?.every(x => x == 0)) {
			delete bone["rotation"];
			delete bone["pivot"];
		}
		return bone;
	}
	/**
	 * Absolutely positions a bone template.
	 * @param {BoneTemplate} boneTemplate
	 * @param {Vec3} blockPos The position where the bone will be moved to.
	 * @returns {BoneTemplate}
	 */
	positionBoneTemplate(boneTemplate, blockPos) {
		let bone = structuredClone(boneTemplate);
		bone["cubes"].forEach(boneCube => {
			boneCube["origin"] = boneCube["origin"].map((x, i) => x + blockPos[i]);
			if("pivot" in boneCube) {
				boneCube["pivot"] = boneCube["pivot"].map((x, i) => x + blockPos[i]);
			}
			boneCube["extra_rots"]?.forEach(extraRot => {
				extraRot["pivot"] = extraRot["pivot"].map((x, i) => x + blockPos[i]);
			});
		});
		if("pivot" in bone) {
			bone["pivot"] = bone["pivot"].map((x, i) => x + blockPos[i]);
		}
		return bone;
	}
	/**
	 * Gets the block shape for a specific block.
	 * @param {String} blockName
	 * @returns {String}
	 */
	#getBlockShape(blockName) {
		if(this.#cachedBlockShapes.has(blockName)) {
			return this.#cachedBlockShapes.get(blockName);
		}
		let individualBlockShape = this.#individualBlockShapes[blockName];
		if(individualBlockShape) {
			return individualBlockShape;
		}
		let matchingBlockShape = this.#blockShapePatterns.find(([pattern]) => pattern.test(blockName))?.[1]; // could use .filter to catch double matches but that's a skill issue
		let blockShape = matchingBlockShape ?? "block";
		this.#cachedBlockShapes.set(blockName, blockShape);
		return blockShape;
	}
	/**
	 * Makes the cubes in a bone from a block.
	 * @param {Block} block
	 * @param {String} blockShape
	 * @returns {Array}
	 */
	#makeBoneCubes(block, blockShape) {
		let specialTexture;
		if(blockShape.includes("{")) {
			[, blockShape, specialTexture] = blockShape.match(/^(\w+)\{(textures\/[\w\/]+)\}$/);
		}
		
		let unfilteredCubes = structuredClone(this.#blockShapeGeos[blockShape]);
		if(!unfilteredCubes) {
			console.error(`Could not find geometry for block shape ${blockShape}; defaulting to "block"`);
			unfilteredCubes = structuredClone(this.#blockShapeGeos["block"]);
		}
		let filteredCubes = [];
		let boneCubes = [];
		while(unfilteredCubes.length) {
			// For each unfiltered cube, we add it to filteredCubes if we've checked the "if" flag. If there are copies, we then add them back to unfilteredCubes.
			let cube = unfilteredCubes.shift();
			if("block_states" in cube) {
				let blockOverride = structuredClone(block);
				for(let blockStateName in cube["block_states"]) {
					if(typeof cube["block_states"][blockStateName] == "string") {
						cube["block_states"][blockStateName] = this.#interpolateInBlockValues(block, cube["block_states"][blockStateName], cube);
					}
				}
				blockOverride["states"] = { ...blockOverride["states"], ...cube["block_states"] };
				cube["block_override"] = blockOverride;
			}
			if("if" in cube) {
				if(!this.#checkBlockStateConditional(cube["block_override"] ?? block, cube["if"])) {
					continue;
				}
				delete cube["if"]; // later on, when determining if a bone cube is mergeable, we only allow cubes with "pos" and "size" keys. I am lazy so it only checks if there are exactly 2 keys in the cube. hence, we need to delete the "if" key here.
			}
			if("terrain_texture" in cube) {
				cube["terrain_texture"] = this.#interpolateInBlockValues(cube["block_override"] ?? block, cube["terrain_texture"], cube);
			}
			if("copy" in cube) {
				if(cube["copy"] == blockShape) { // prevent recursion (sometimes)
					console.error(`Cannot copy the same block shape: ${blockShape}`);
					continue;
				}
				let copiedCubes = structuredClone(this.#blockShapeGeos[cube["copy"]]);
				if(!copiedCubes) {
					console.error(`Could not find geometry for block shape ${blockShape}; defaulting to "block"`);
					copiedCubes = structuredClone(this.#blockShapeGeos["block"]);
				}
				let fieldsToCopy = Object.keys(cube).filter(field => !["copy", "rot", "pivot", "translate"].includes(field));
				copiedCubes.forEach(copiedCube => {
					if("translate" in cube) {
						copiedCube["translate"] = (copiedCube["translate"] ?? [0, 0, 0]).map((x, i) => x + cube["translate"][i]);
					}
					fieldsToCopy.forEach(field => { // copy all fields from this cube onto the new ones
						if(field == "flip_textures_horizontally" || field == "flip_textures_vertically") { // these ones are arrays but are supposed to represent sets, so we take the XOR/symmetric difference (ik there's a native method but it's very new)
							let facesInCopiedCube = new Set(copiedCube[field] ?? []);
							cube[field].forEach(face => {
								if(facesInCopiedCube.has(face)) {
									facesInCopiedCube.delete(face);
								} else {
									facesInCopiedCube.add(face);
								}
							});
							copiedCube[field] = [...facesInCopiedCube];
						} else if(typeof copiedCube[field] == "object") {
							copiedCube[field] = { ...cube[field], ...copiedCube[field] }; // fields on the copied cubes still take priority over the "parent" cube (the one that's copying it)
						} else {
							copiedCube[field] ??= cube[field];
						}
					});
					if("rot" in cube) {
						if("rot" in copiedCube) {
							// maths for combining both rotations is hard so we handle it differently and create a list of extra rotations.
							// HoloPrint.js will create a wrapper bone for each rotation
							copiedCube["extra_rots"] ??= [];
							copiedCube["extra_rots"].unshift({
								"rot": cube["rot"],
								"pivot": cube["pivot"] ?? [8, 8, 8]
							});
						} else {
							copiedCube["rot"] = cube["rot"];
							copiedCube["pivot"] = cube["pivot"] ?? copiedCube["pivot"];
						}
					}
				});
				unfilteredCubes.push(...copiedCubes);
			} else if("copy_block" in cube) {
				let match = cube["copy_block"].match(/^entity\.(.+)$/);
				if(!match) {
					console.error(`Incorrect formated copy_block property: ${match}`);
					continue;
				}
				let blockEntityProperty = match[1];
				let blockToCopy = block["block_entity_data"]?.[blockEntityProperty];
				if(!blockToCopy) {
					console.error(`Cannot find block entity property ${blockEntityProperty} on block ${block["name"]}:`, block);
					continue;
				}
				blockToCopy["name"] = blockToCopy["name"].replace(/^minecraft:/, "");
				if(this.config.IGNORED_BLOCKS.includes(blockToCopy["name"])) {
					continue;
				}
				blockToCopy["#copied_via_copy_block"] = true; // I will learn rust if mojang adds this to the structure NBT
				let newBlockShape = this.#getBlockShape(blockToCopy["name"]);
				let newBoneCubes = this.#makeBoneCubes(blockToCopy, newBlockShape);
				if("translate" in cube) {
					newBoneCubes.forEach(boneCube => {
						boneCube["origin"] = boneCube["origin"].map((x, i) => x + cube["translate"][i]);
						if("pivot" in boneCube) {
							boneCube["pivot"] = boneCube["pivot"].map((x, i) => x + cube["translate"][i]);
						}
					});
				}
				boneCubes.push(...newBoneCubes);
			} else {
				filteredCubes.push(cube);
			}
		}
		// add easy property accessors. I could make a class if I wanted to
		filteredCubes.forEach(cube => {
			Object.defineProperties(cube, Object.fromEntries(["x", "y", "z", "w", "h", "d"].map((prop, i) => [prop, {
				get() {
					return (i < 3? this["pos"] : this["size"])[i % 3];
				},
				set(value) {
					(i < 3? this["pos"] : this["size"])[i % 3] = value;
				}
			}])));
		});
		let cubes = this.#mergeCubes(filteredCubes);
		
		let blockName = block["name"];
		let variant = this.#getTextureVariant(block);
		let variantWithoutEigenvariant;
		
		cubes.forEach(cube => {
			let boneCube = {
				"origin": cube["pos"],
				"size": cube["size"],
				"uv": this.#calculateUv(cube)
			};
			
			let croppable = false;
			// When the size of a cube in a direction is 0, we can remove all faces but 1. Because we have DisableCulling in the material, this single face will render from the back as well.
			// On a side note, if there wasn't the DisableCulling material state and we rendered both faces on opposite sides, the texture wouldn't be mirrored on the other side, so this is another bug fix ig
			if(cube.w == 0) {
				// 0 width: only render west
				["east", "down", "up", "north", "south"].forEach(faceName => delete boneCube["uv"][faceName]);
				croppable = true;
			}
			if(cube.h == 0) {
				// 0 height: only render down
				["west", "east", "up", "north", "south"].forEach(faceName => delete boneCube["uv"][faceName]);
				croppable = true;
			}
			if(cube.d == 0) {
				// 0 depth: only render north
				["west", "east", "down", "up", "south"].forEach(faceName => delete boneCube["uv"][faceName]);
				croppable = true;
			}
			
			let cubeVariant;
			if("variant" in cube) {
				cubeVariant = cube["variant"];
			} else if(cube["ignore_eigenvariant"]) {
				if("block_override" in cube) {
					cubeVariant = this.#getTextureVariant(cube["block_override"], true);
				} else {
					if(variantWithoutEigenvariant == undefined) {
						variantWithoutEigenvariant = this.#getTextureVariant(block, true);
					}
					cubeVariant = variantWithoutEigenvariant;
				}
			} else if("block_override" in cube) {
				cubeVariant = this.#getTextureVariant(cube["block_override"]);
			} else {
				cubeVariant = variant; // default variant for this block
			}
			
			let textureSize = cube["texture_size"] ?? [16, 16];
			// add generic keys to all faces, and convert texture references into indices
			for(let faceName in boneCube["uv"]) {
				let isSideFace = ["west", "east", "north", "south"].includes(faceName);
				let face = boneCube["uv"][faceName];
				let textureFace = cube["textures"]?.[faceName] ?? (isSideFace? cube["textures"]?.["side"] : undefined) ?? cube["textures"]?.["*"] ?? faceName;
				if(textureFace == "none") {
					delete boneCube["uv"][faceName];
					continue;
				}
				textureFace = this.#interpolateInBlockValues(cube["block_override"] ?? block, textureFace, cube);
				let textureRef = {
					"uv": face["uv"].map((x, i) => x / textureSize[i]),
					"uv_size": face["uv_size"].map((x, i) => x / textureSize[i]),
					"block_name": blockName,
					"texture_face": textureFace,
					"variant": cubeVariant,
					"croppable": croppable
				};
				if(textureFace == "#tex") {
					if(specialTexture) {
						textureRef["texture_path_override"] = specialTexture;
					} else {
						console.error(`No #tex for block ${blockName} and blockshape ${blockShape}!`);
					}
				} else if(/^textures\/.+[^/]$/.test(textureFace)) { // file path
					textureRef["texture_path_override"] = textureFace;
				} else {
					let terrainTextureOverride = cube["terrain_texture"];
					if(terrainTextureOverride) {
						delete textureRef["block_name"];
						delete textureRef["texture_face"];
						textureRef["terrain_texture_override"] = terrainTextureOverride;
					}
				}
				if("texture_path_override" in textureRef) {
					delete textureRef["block_name"];
					delete textureRef["texture_face"];
					delete textureRef["variant"];
				}
				if("tint" in cube) {
					let tint = cube["tint"];
					tint = this.#interpolateInBlockValues(cube["block_override"] ?? block, tint, cube);
					if(tint[0] == "#") {
						textureRef["tint"] = hexColorToClampedTriplet(tint);
					} else {
						// this is from cauldrons; colour is a 32-bit ARGB colour
						let colorCode = 4294967296 + Number(tint); // 4294967296 = 2 ** 32
						textureRef["tint"] = [colorCode >> 16 & 0xFF, colorCode >> 8 & 0xFF, colorCode & 0xFF].map(x => x / 255);
					}
				}
				
				this.textureRefs.add(textureRef);
				let flipTextureHorizontally = cube["flip_textures_horizontally"]?.includes(faceName) ^ (isSideFace && cube["flip_textures_horizontally"]?.includes("side")) ^ cube["flip_textures_horizontally"]?.includes("*");
				let flipTextureVertically = cube["flip_textures_vertically"]?.includes(faceName) ^ (isSideFace && cube["flip_textures_vertically"]?.includes("side")) ^ cube["flip_textures_vertically"]?.includes("*");
				if("box_uv" in cube) { // box uv does some flipping automatically
					flipTextureHorizontally ^= faceName != "north" && faceName != "south";
					flipTextureVertically ^= faceName == "up";
				}
				boneCube["uv"][faceName] = {
					"index": this.textureRefs.indexOf(textureRef),
					"flip_horizontally": (faceName == "down" || faceName == "up") ^ flipTextureHorizontally, // in MC the down/up faces are rotated 180 degrees compared to how they are in geometry; this can be faked by flipping both axes. I don't want to use uv_rotation since that's a 1.21 thing and I want support back to 1.16.
					"flip_vertically": (faceName == "down" || faceName == "up") ^ flipTextureVertically
				};
			}
			
			if("rot" in cube) {
				boneCube["rotation"] = cube["rot"];
				boneCube["pivot"] = cube["pivot"] ?? [8, 8, 8]; // we set the pivot for this cube to be the center of it. if we don't specify this it would look at the pivot for the bone, which would be different if we're doing our fancy animations.
			}
			if("extra_rots" in cube) {
				boneCube["extra_rots"] = cube["extra_rots"];
			}
			if("translate" in cube) {
				boneCube["origin"] = boneCube["origin"].map((x, i) => x + cube["translate"][i]);
				if("rot" in cube) {
					boneCube["pivot"] = boneCube["pivot"].map((x, i) => x + cube["translate"][i]);
				}
				if("extra_rots" in cube) {
					boneCube["extra_rots"].forEach(extraRot => {
						extraRot["pivot"] = extraRot["pivot"].map((x, i) => x + cube["translate"][i]);
					});
				}
			}
			boneCube = this.#scaleBoneCube(boneCube);
			boneCubes.push(boneCube);
		});
		return boneCubes;
	}
	/**
	 * Returns the entries of a block's states and block entity data (prefixed by `entity.`; only first-level properties are supported).
	 * @param {Block} block
	 * @returns {Array<[String, any]>}
	 */
	#getBlockStatesAndEntityDataEntries(block) {
		return [...Object.entries(block["states"] ?? {}), ...Object.entries(block["block_entity_data"] ?? {}).map(([key, value]) => [`entity.${key}`, value])];
	}
	/**
	 * Merges cubes together greedily.
	 * @param {Array<Object>} cubes
	 * @returns {Array<Object>}
	 */
	#mergeCubes(cubes) {
		let unmergeableCubes = [];
		let mergeableCubes = [];
		cubes.forEach(cube => {
			if(!cube["size"].some(x => x == 0) && Object.keys(cube).length == 2) { // 2 keys: pos and size
				mergeableCubes.push(cube);
			} else {
				unmergeableCubes.push(cube);
			}
		});
		
		let mergedCubes = [];
		mergeableCubes.forEach(cube1 => { // this is the cube we're trying to add to mergedCubes
			tryMerging: while(true) {
				for(let [i, cube2] of mergedCubes.entries()) {
					if(this.#tryMergeCubesOneWay(cube1, cube2)) {
						console.debug("Merged cube", cube2, "into", cube1);
						mergedCubes.splice(i, 1);
						continue tryMerging; // since boneCube1 has been mutated, this stops the current comparison of boneCube1 with the already merged cubes, and makes it start again.
					} else if(this.#tryMergeCubesOneWay(cube2, cube1)) {
						console.debug("Merged cube", cube1, "into", cube2);
						mergedCubes.splice(i, 1);
						cube1 = cube2;
						continue tryMerging; // boneCube2 has been mutated, so we removed it from mergedCubes and swap it out for boneCube1, then restart trying to merge it.
					}
				}
				break; // we'll only get to here when it's checked all combinations between the already merged cubes and the new cube (cube1)
			}
			mergedCubes.push(cube1);
		});
		
		return [...unmergeableCubes, ...mergedCubes];
	}
	/**
	 * Gets the index of the variant to use in terrain_texture.json for a block.
	 * @param {Block} block
	 * @param {Boolean} [ignoreEigenvariant]
	 * @returns {Number}
	 */
	#getTextureVariant(block, ignoreEigenvariant = false) {	
		let blockName = block["name"];
		let eigenvariantExists = blockName in this.#eigenvariants;
		if(!ignoreEigenvariant && eigenvariantExists) {
			let variant = this.#eigenvariants[blockName];
			console.debug(`Using eigenvariant ${variant} for block ${blockName}`);
			return variant;
		} else if(ignoreEigenvariant && !eigenvariantExists) {
			console.warn(`Cannot ignore eigenvariant of ${blockName} as it doesn't exist!`);
		}
		
		if(!("states" in block || "block_entity_data" in block)) {
			return -1;
		}
		let blockShape = this.#getBlockShape(blockName); // In copied block shapes, we want to look at the original block shape's texture variants, not the copied's. E.g. With candle_cake, we don't want the cake that is copied to look at the texture variants for cake (which includes bite_counter).
		let statesAndBlockEntityData = this.#getBlockStatesAndEntityDataEntries(block);
		let blockShapeSpecificVariants = this.#blockShapeBlockStateTextureVariants[blockShape];
		if(blockShapeSpecificVariants?.["#exclusive_add"]) {
			let variant = 0;
			statesAndBlockEntityData.forEach(([blockStateName, blockStateValue]) => {
				if(blockStateName in blockShapeSpecificVariants) {
					let blockStateVariants = blockShapeSpecificVariants[blockStateName];
					if(!(blockStateValue in blockStateVariants)) {
						console.error(`Block state value ${blockStateValue} for texture-variating block state ${blockStateName} not found on ${blockName}...`, block);
						return;
					}
					variant += blockStateVariants[blockStateValue];
				}
			});
			return variant;
		}
		let blockNameSpecificVariants = this.#blockNameBlockStateTextureVariants[blockName] ?? this.#blockNamePatternBlockStateTextureVariants.find(([pattern]) => pattern.test(blockName))?.[1];
		if(blockNameSpecificVariants?.["#exclusive_add"]) {
			let variant = 0;
			statesAndBlockEntityData.forEach(([blockStateName, blockStateValue]) => {
				if(blockStateName in blockNameSpecificVariants) {
					let blockStateVariants = blockNameSpecificVariants[blockStateName];
					if(!(blockStateValue in blockStateVariants)) {
						console.error(`Block state value ${blockStateValue} for texture-variating block state ${blockStateName} not found...`);
						return;
					}
					variant += blockStateVariants[blockStateValue];
				}
			});
			return variant;
		}
		let variant = -1;
		statesAndBlockEntityData.forEach(([blockStateName, blockStateValue]) => {
			let blockStateVariants = blockNameSpecificVariants?.[blockStateName] ?? blockShapeSpecificVariants?.[blockStateName] ?? this.#globalBlockStateTextureVariants[blockStateName];
			if(blockStateVariants == undefined) {
				return;
			}
			
			if(!(blockStateValue in blockStateVariants)) {
				console.error(`Block state value ${blockStateValue} for texture-variating block state ${blockStateName} not found...`);
				return;
			}
			let newVariant = blockStateVariants[blockStateValue];
			if(variant != -1) {
				console.warn(`Multiple texture-variating block states for block ${block["name"]}; using ${blockStateName}`);
			}
			variant = newVariant;
		});
		return variant;
	}
	/**
	 * Calculates the UV for a cube.
	 * @param {Object} cube
	 * @returns {Object}
	 */
	#calculateUv(cube) {
		if("box_uv" in cube) { // this is where a singular uv coordinate is specified, and the rest is calculated as below. used primarily in entity models.
			let boxUvSize = cube["box_uv_size"] ?? cube["size"];
			let uv = {
				"up": {
					"uv": [boxUvSize[2], 0],
					"uv_size": [boxUvSize[0], boxUvSize[2]]
				},
				"down": {
					"uv": [boxUvSize[0] + boxUvSize[2], 0],
					"uv_size": [boxUvSize[0], boxUvSize[2]]
				},
				"west": {
					"uv": [0, boxUvSize[2]],
					"uv_size": [boxUvSize[2], boxUvSize[1]]
				},
				"north": {
					"uv": [boxUvSize[2], boxUvSize[2]],
					"uv_size": [boxUvSize[0], boxUvSize[1]]
				},
				"east": {
					"uv": [boxUvSize[0] + boxUvSize[2], boxUvSize[2]],
					"uv_size": [boxUvSize[2], boxUvSize[1]]
				},
				"south": {
					"uv": [boxUvSize[0] + boxUvSize[2] * 2, boxUvSize[2]],
					"uv_size": [boxUvSize[0], boxUvSize[1]]
				}
			};
			Object.values(uv).forEach(face => {
				face["uv"] = face["uv"].map((x, i) => x + cube["box_uv"][i]);
			});
			return uv;
		} else {
			// In MCBE most non-full-block textures look at where the part that is being rendered is in relation to the entire cube space it's in - like it's being projected onto a full face then cut out. Kinda hard to explain sorry, I recommend messing around with fence textures so you understand how it works.
			let westUvOffset = [cube.z, 16 - cube.y - cube.h];
			let eastUvOffset = [16 - cube.z - cube.d, 16 - cube.y - cube.h];
			let downUvOffset = [16 - cube.x - cube.w, 16 - cube.z - cube.d];
			let upUvOffset = [16 - cube.x - cube.w, cube.z];
			let northUvOffset = [cube.x, 16 - cube.y - cube.h];
			let southUvOffset = [16 - cube.x - cube.w, 16 - cube.y - cube.h];
			return {
				"west": {
					"uv": cube["uv"]?.["west"] ?? cube["uv"]?.["side"] ?? cube["uv"]?.["*"] ?? westUvOffset,
					"uv_size": cube["uv_sizes"]?.["west"] ?? cube["uv_sizes"]?.["side"] ?? cube["uv_sizes"]?.["*"] ?? [cube.d, cube.h]
				},
				"east": {
					"uv": cube["uv"]?.["east"] ?? cube["uv"]?.["side"] ?? cube["uv"]?.["*"] ?? eastUvOffset,
					"uv_size": cube["uv_sizes"]?.["east"] ?? cube["uv_sizes"]?.["side"] ?? cube["uv_sizes"]?.["*"] ?? [cube.d, cube.h]
				},
				"down": {
					"uv": cube["uv"]?.["down"] ?? cube["uv"]?.["*"] ?? downUvOffset,
					"uv_size": cube["uv_sizes"]?.["down"] ?? cube["uv_sizes"]?.["*"] ?? [cube.w, cube.d]
				},
				"up": {
					"uv": cube["uv"]?.["up"] ?? cube["uv"]?.["*"] ?? upUvOffset,
					"uv_size": cube["uv_sizes"]?.["up"] ?? cube["uv_sizes"]?.["*"] ?? [cube.w, cube.d]
				},
				"north": {
					"uv": cube["uv"]?.["north"] ?? cube["uv"]?.["side"] ?? cube["uv"]?.["*"] ?? northUvOffset,
					"uv_size": cube["uv_sizes"]?.["north"] ?? cube["uv_sizes"]?.["side"] ?? cube["uv_sizes"]?.["*"] ?? [cube.w, cube.h]
				},
				"south": {
					"uv": cube["uv"]?.["south"] ?? cube["uv"]?.["side"] ?? cube["uv"]?.["*"] ?? southUvOffset,
					"uv_size": cube["uv_sizes"]?.["south"] ?? cube["uv_sizes"]?.["side"] ?? cube["uv_sizes"]?.["*"] ?? [cube.w, cube.h]
				}
			};
		}
	}
	/** Scales a bone cube towards (8, 8, 8).
	 * @param {Object} boneCube
	 * @returns {Object}
	 */
	#scaleBoneCube(boneCube) {
		boneCube["origin"] = boneCube["origin"].map(x => (x - 8) * this.config.SCALE + 8);
		boneCube["size"] = boneCube["size"].map(x => x * this.config.SCALE);
		if("pivot" in boneCube) {
			boneCube["pivot"] = boneCube["pivot"].map(x => (x - 8) * this.config.SCALE + 8);
		}
		if("extra_rots" in boneCube) {
			boneCube["extra_rots"].forEach(extraRot => {
				extraRot["pivot"] = extraRot["pivot"].map(x => (x - 8) * this.config.SCALE + 8);
			});
		}
		return boneCube;
	}
	#checkBlockStateConditional(block, conditional) {
		let trimmedConditional = conditional.replaceAll(/\s/g, "");
		let booleanOperations = trimmedConditional.match(/&&|\|\|/g) ?? []; // can have multiple separated by ?? or ||
		let booleanValues = trimmedConditional.split(/&&|\|\|/).map(booleanExpression => {
			if(booleanExpression == "#copied_via_copy_block") {
				return block["#copied_via_copy_block"] === true;
			} else if(booleanExpression == "!#copied_via_copy_block") {
				return block["#copied_via_copy_block"] !== true;
			}
			let match = booleanExpression.match(/^((?:entity\.)?[\w:&-?]+)(==|>|<|>=|<=|!=)(-?\w+)$/); // Despite the Minecraft Wiki and Microsoft creator documentation saying there can be boolean block states, they're stored as bytes in NBT
			if(!match) {
				console.error(`Incorrectly formatted block state expression "${booleanExpression}" from conditional "${conditional}"\n(Match: ${JSON.stringify(match)})`);
				return true; // If we miss the error message more geometry will draw more attention to it :D
			}
			let [, blockStateTerm, comparisonOperator, expectedBlockState] = match;
			let blockStateOperation = blockStateTerm.match(/^(entity\.)?([\w:]+)(?:(\?\?|&)(-?\d+))?$/);
			if(!blockStateOperation) {
				console.error(`Incorrectly formed block state term: ${blockStateTerm}`);
				return true;
			}
			let [, usingBlockEntityData, blockStateName, blockStateOperator, blockStateOperandString] = blockStateOperation;
			let dataObjectName = usingBlockEntityData? "block_entity_data" : "states";
			if(!(dataObjectName in block)) {
				console.error(`No ${dataObjectName} in block ${block["name"]}!`);
				return true;
			}
			let dataObject = block[dataObjectName];
			if(blockStateOperator != "??" && !(blockStateName in dataObject)) {
				console.error(`Cannot find ${dataObjectName} ${blockStateName} on block ${block["name"]}`);
				return true;
			}
			let actualBlockState = dataObject[blockStateName];
			
			if(blockStateOperator) {
				let blockStateOperand = Number(blockStateOperandString);
				if(Number.isNaN(blockStateOperand)) {
					console.error(`${dataObjectName} operand ${blockStateOperand} is not a number!`);
					return true;
				}
				actualBlockState = function() {
					switch(blockStateOperator) {
						case "&": return actualBlockState & blockStateOperand;
						case "??": return actualBlockState ?? blockStateOperand;
					}
					console.error(`Unknown ${dataObjectName} operator ${blockStateOperator} in term ${blockStateTerm}!`);
					return actualBlockState;
				}();
			}
			
			switch(comparisonOperator) {
				case "==": return actualBlockState == expectedBlockState;
				case ">": return actualBlockState > expectedBlockState;
				case "<": return actualBlockState < expectedBlockState;
				case ">=": return actualBlockState >= expectedBlockState;
				case "<=": return actualBlockState <= expectedBlockState;
				case "!=": return actualBlockState != expectedBlockState;
			}
			console.error(`Unknown ${dataObjectName} comparison operator ${comparisonOperator} in expression ${booleanExpression}`);
			return true;
		});
		
		// do && before || to match JS operator precedence
		let andRes = [booleanValues[0]];
		booleanOperations.forEach((booleanOperation, i) => {
			if(booleanOperation == "&&") {
				andRes[andRes.length - 1] &&= booleanValues[i + 1];
			} else {
				andRes.push(booleanValues[i + 1])
			}
		});
		let orRes = andRes.some(x => x); // only || operations remain
		return orRes;
	}
	/**
	 * Substitutes values from a block into a particular expression.
	 * @param {Block} block
	 * @param {String} fullExpression
	 * @param {Object} cube
	 * @returns {String}
	 */
	#interpolateInBlockValues(block, fullExpression, cube) {
		let wholeStringValue;
		let substitutedExpression = fullExpression.replaceAll(/\${([^}]+)}/g, (bracketedExpression, expression) => {
			if(wholeStringValue != undefined) return;
			if(/^Array\.\w+\[[^\[]+\]$/.test(expression)) {
				let [, arrayName, arrayIndexVar] = expression.match(/^Array\.(\w+)\[([^\[]+)\]$/);
				let array = cube["arrays"]?.[arrayName];
				if(!array) {
					console.error(`Couldn't find array ${arrayName} in cube:`, cube);
					return "";
				}
				let arrayIndex;
				if(arrayIndexVar.startsWith("entity.")) {
					let blockEntityProperty = arrayIndexVar.slice(7);
					if(!("block_entity_data" in block) || !(blockEntityProperty in block["block_entity_data"])) {
						console.error(`Cannot find block entity property ${blockEntityProperty} in ${block["name"]}:`, block);
						return "";
					}
					arrayIndex = block["block_entity_data"][blockEntityProperty];
				} else {
					if(!("states" in block) || !(arrayIndexVar in block["states"])) {
						console.error(`Cannot find block state ${arrayIndexVar} in ${block["name"]}:`, block);
						return "";
					}
					arrayIndex = block["states"][arrayIndexVar];
				}
				if(!(arrayIndex in array)) {
					console.error(`Array index out of bounds: ${JSON.stringify(array)}[${arrayIndex}]`);
					return "";
				}
				return array[arrayIndex];
			}
			let match = expression.replaceAll(/\s/g, "").match(/^(#block_name|#block_states|#block_entity_data)((?:\.\w+|\[-?\d+\])*)(\[(-?\d+):(-?\d*)\]|\[:(-?\d+)\])?(?:\?\?(.+))?$/);
			if(!match) {
				console.error(`Wrongly formatted expression: ${bracketedExpression}`);
				return "";
			}
			let [, specialVar, propertyChain, ...slicingAndDefault] = match;
			let value = function() {
				switch(specialVar) {
					case "#block_name": return block["name"];
					case "#block_states": return block["states"];
					case "#block_entity_data": return block["block_entity_data"];
				}
				console.error(`Unknown special variable: ${specialVar}`);
			}();
			propertyChain.match(/\.\w+|\[-?\d+\]/g)?.forEach(property => {
				let keys = property.match(/^\.(\w+)|\[(\d+)\]$/);
				value = value?.[keys[1] ?? keys[2]];
			});
			if(slicingAndDefault[0] != undefined) {
				value = value?.slice(slicingAndDefault[1], slicingAndDefault[3] ?? (slicingAndDefault[2] == ""? undefined : slicingAndDefault[2]));
			}
			if(value == undefined || value === "") {
				if(slicingAndDefault[4] != undefined) {
					let defaultValue = slicingAndDefault[4];
					if(/SET_WHOLE_STRING\([^)]+\)/.test(defaultValue)) {
						wholeStringValue = defaultValue.match(/\(([^)]+)\)/)[1];
						return;
					} else {
						value = defaultValue;
					}
				} else {
					console.error(`Nothing for ${specialVar}${propertyChain} in block:`, block);
					return "";
				}
			}
			console.debug(`Changed ${bracketedExpression} to ${value}!`, block);
			return value;
		});
		return wholeStringValue ?? substitutedExpression;
	}
	/**
	 * Unpurely tries to merge the second cube into the first if the second is more positive than the first.
	 * @param {Object} cube1
	 * @param {Object} cube2
	 * @returns {Boolean} If the second cube was merged into the first.
	 */
	#tryMergeCubesOneWay(cube1, cube2) {
		if(cube1.x + cube1.w == cube2.x) { // bone cube 2 is to the right of bone cube 1
			if(cube1.y == cube2.y && cube1.z == cube2.z && cube1.h == cube2.h && cube1.d == cube2.d) {
				cube1.w += cube2.w; // grow cube 1...
				return true;
			}
		} else if(cube1.y + cube1.h == cube2.y) { // bone cube 2 is above bone cube 1
			if(cube1.x == cube2.x && cube1.z == cube2.z && cube1.w == cube2.w && cube1.d == cube2.d) {
				cube1.h += cube2.h;
				return true;
			}
		} else if(cube1.z + cube1.d == cube2.z) { // bone cube 2 is behind bone cube 1
			if(cube1.x == cube2.x && cube1.y == cube2.y && cube1.w == cube2.w && cube1.h == cube2.h) {
				cube1.d += cube2.d;
				return true;
			}
		}
		return false;
	}
}

/**
 * @typedef {import("./HoloPrint.js").Vec3} Vec3
 */
/**
 * @typedef {import("./HoloPrint.js").Block} Block
 */
/**
 * @typedef {import("./HoloPrint.js").BoneTemplate} BoneTemplate
 */
/**
 * @typedef {import("./HoloPrint.js").Bone} Bone
 */
/**
 * @typedef {import("./HoloPrint.js").HoloPrintConfig} HoloPrintConfig
 */