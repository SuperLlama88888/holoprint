// this looks interesting: https://github.com/PrismarineJS/minecraft-data/blob/master/data/bedrock/1.20.71/blockCollisionShapes.json (Object.fromEntries(Object.entries(d.blocks).map(([name, indices])=>[name,indices.map(i=>d.shapes[i])])))
// READ: this also looks pretty comprehensive: https://github.com/MCBE-Development-Wiki/mcbe-dev-home/blob/main/docs/misc/enums/block_shape.md
// https://github.com/bricktea/MCStructure/blob/main/docs/1.16.201/enums/B.md

import { awaitAllEntries, clamp, hexColourToClampedTriplet, JSONSet } from "./essential.js";

// https://wiki.bedrock.dev/visuals/material-creations.html#overlay-color-in-render-controllers
// https://wiki.bedrock.dev/documentation/materials.html#entity-alphatest

/**
 * A regular 3D vector.
 * @typedef {[Number, Number, Number]} Vec3
 */
/**
 * A block palette entry, as used in HoloPrint.
 * @typedef {Object} Block
 * @property {String} name The block's ID
 * @property {*} [states] Block states
 * @property {*} [block_entity_data] Block entity data
 */
/**
 * An unpositioned bone for geometry files without name or parent. All units/coordinates are relative to (0, 0, 0).
 * @typedef {Object} BoneTemplate
 * @property {Vec3} [pivot] The block's center point of rotation
 * @property {Vec3} [rotation] The block's rotation
 * @property {Array} cubes
 */
/**
 * A positioned bone for geometry files.
 * @typedef {Object} Bone
 * @augments BoneTemplate
 * @property {String} name
 * @property {String} parent
 */

export default class BlockGeoMaker {
	static #eigenvariants = { // variant numbers tied to specific blocks. they will always have these variant indices.
		"grass_block": 0, // for the tints; this makes it look like the forest or flower forest biomes
		"unpowered_repeater": 0,
		"powered_repeater": 1,
		"unpowered_comparator": 0,
		"powered_comparator": 1,
		"daylight_detector": 0,
		"daylight_detector_inverted": 1,
		"furnace": 0, // these are strange
		"lit_furnace": 0,
		"blast_furnace": 0,
		"lit_blast_furnace": 0,
		"smoker": 0,
		"lit_smoker": 0,
		"normal_stone_stairs": 0,
		"stone_button": 0,
		"stone_pressure_plate": 0
	};
	
	static #REDSTONE_DUST_TINTS = function() {
		// net.minecraft.world.level.block.RedStoneWireBlock
		let cols = [];
		for(let i = 0; i < 16; i++) {
			let f = i / 15;
			let r = f * 0.6 + (f > 0? 0.4 : 0.3);
			let g = clamp(f * f * 0.7 - 0.5, 0, 1);
			cols[i] = [r, g, 0];
		}
		return cols;
	}();
	
	config;
	allCubes; // All the cubes ever created by BlockGeoMaker
	textureRefs;
	
	#individualBlockShapes;
	#blockShapePatterns;
	#blockShapeGeos;
	
	#blockStateRotations;
	#blockStateTextureVariants;
	#blockStateTextureVariantPatterns;
	
	#cachedBlockShapes;
	
	constructor(config) {
		return (async () => {
			this.config = config;
			
			this.allCubes = [];
			this.textureRefs = new JSONSet();
			
			let { blockShapes, blockShapeGeos, blockStateDefs } = await awaitAllEntries({
				blockShapes: fetch("data/blockShapes.json").then(res => res.jsonc()),
				blockShapeGeos: fetch("data/blockShapeGeos.json").then(res => res.jsonc()),
				blockStateDefs: fetch("data/blockStateDefinitions.json").then(res => res.jsonc())
			});
			this.#individualBlockShapes = blockShapes["individual_blocks"];
			this.#blockShapePatterns = Object.entries(blockShapes["patterns"]).map(([rule, blockShape]) => [new RegExp(rule), blockShape]); // store regular expressions from the start to avoid recompiling them every time
			this.#blockShapeGeos = blockShapeGeos;
			
			// console.log(this.#blockShapeGeos)
			
			this.#blockStateRotations = blockStateDefs["rotations"];
			this.#blockStateTextureVariants = blockStateDefs["texture_variants"];
			this.#blockStateTextureVariantPatterns = Object.entries(blockStateDefs["texture_variants"]).filter(([blockShape]) => blockShape.startsWith("/") && blockShape.endsWith("/")).map(([pattern, variants]) => [new RegExp(pattern.slice(1, -1)), variants]);
			
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
		Object.entries(block["states"] ?? {}).forEach(([blockStateName, blockStateValue]) => {
			let rotations;
			if(blockShape in this.#blockStateRotations && blockStateName in this.#blockStateRotations[blockShape]) {
				rotations = this.#blockStateRotations[blockShape][blockStateName];
			} else if(blockStateName in this.#blockStateRotations["*"]) {
				rotations = this.#blockStateRotations["*"][blockStateName];
			} else {
				return; // no block state definition
			}
			
			if(!(blockStateValue in rotations)) {
				console.error(`Block state value ${blockStateValue} for rotation block state ${blockStateName} not found...`);
				return;
			}
			if(bone["rotation"]) {
				console.debug(`Multiple rotation block states for block ${block["name"]}; adding them all together!`);
				bone["rotation"] = bone["rotation"].map((x, i) => x + rotations[blockStateValue][i]);
			} else {
				bone["rotation"] = rotations[blockStateValue];
				bone["pivot"] = [8, 8, 8];
			}
		});
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
		});
		if("pivot" in bone) {
			bone["pivot"] = bone["pivot"].map((x, i) => x + blockPos[i]);
		}
		this.allCubes.push(...bone["cubes"]);
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
	 * @param {String} [blockShapeTerrainTextureOverride]
	 * @returns {Array}
	 */
	#makeBoneCubes(block, blockShape, blockShapeTerrainTextureOverride) {
		let specialTexture;
		if(blockShape.includes("{")) {
			[, blockShape, specialTexture] = blockShape.match(/^(\w+)\{(textures\/[\w\/]+)\}$/);
		}
		
		let cubes = this.#blockShapeGeos[blockShape];
		if(!cubes) {
			console.error(`Could not find geometry for block shape ${blockShape}; defaulting to "block"`);
			cubes = this.#blockShapeGeos["block"];
		}
		
		let blockName = block["name"];
		let variant = this.#getTextureVariant(block);
		let variantWithoutEigenvariant;
		
		let boneCubes = [];
		cubes.forEach(cube => {
			if("if" in cube) {
				if(!this.#checkBlockStateConditional(block, cube["if"])) {
					return;
				}
			}
			
			if("copy" in cube) {
				let blockCopy = structuredClone(block);
				if("block_states" in cube) {
					blockCopy["states"] ??= {};
					Object.entries(cube["block_states"]).forEach(([blockStateName, blockStateValue]) => {
						blockCopy["states"][blockStateName] = blockStateValue;
					});
				}
				let copiedBoneCubes = this.#makeBoneCubes(blockCopy, cube["copy"], cube["terrain_texture"] ?? blockShapeTerrainTextureOverride);
				copiedBoneCubes.forEach(boneCube => {
					boneCube["origin"] = boneCube["origin"].map((x, i) => x + cube["pos"][i]);
					if("pivot" in boneCube) {
						boneCube["pivot"] = boneCube["pivot"].map((x, i) => x + cube["pos"][i]);
					}
				});
				boneCubes.push(...copiedBoneCubes);
				return;
			}
			
			// In MCBE most non-full-block textures look at where the part that is being rendered is in relation to the entire cube space it's in - like it's being projected onto a full face then cut out. Kinda hard to explain sorry, I recommend messing around with fence textures so you understand how it works.
			// Pretty sure some need to be mirrored still. this includes the top of the torch
			let westUvOffset = [cube["pos"][2], 16 - cube["pos"][1] - cube["size"][1]];
			let eastUvOffset = [16 - cube["pos"][2] - cube["size"][2], 16 - cube["pos"][1] - cube["size"][1]];
			let downUvOffset = [cube["pos"][0], cube["pos"][2]]; // upside down???
			let upUvOffset = [cube["pos"][0], cube["pos"][2]];
			let northUvOffset = [cube["pos"][0], 16 - cube["pos"][1] - cube["size"][1]];
			let southUvOffset = [16 - cube["pos"][0] - cube["size"][0], 16 - cube["pos"][1] - cube["size"][1]];
			let boneCube = {
				"origin": cube["pos"],
				"size": cube["size"],
				"uv": {
					"west": {
						"uv": cube["uv"]?.["west"] ?? cube["uv"]?.["side"] ?? cube["uv"]?.["*"] ?? westUvOffset,
						"uv_size": cube["uv_sizes"]?.["west"] ?? cube["uv_sizes"]?.["side"] ?? cube["uv_sizes"]?.["*"] ?? [cube["size"][2], cube["size"][1]]
					},
					"east": {
						"uv": cube["uv"]?.["east"] ?? cube["uv"]?.["side"] ?? cube["uv"]?.["*"] ?? eastUvOffset,
						"uv_size": cube["uv_sizes"]?.["east"] ?? cube["uv_sizes"]?.["side"] ?? cube["uv_sizes"]?.["*"] ?? [cube["size"][2], cube["size"][1]]
					},
					"down": {
						"uv": cube["uv"]?.["down"] ?? cube["uv"]?.["*"] ?? downUvOffset,
						"uv_size": cube["uv_sizes"]?.["down"] ?? cube["uv_sizes"]?.["*"] ?? [cube["size"][0], cube["size"][2]]
					},
					"up": {
						"uv": cube["uv"]?.["up"] ?? cube["uv"]?.["*"] ?? upUvOffset,
						"uv_size": cube["uv_sizes"]?.["up"] ?? cube["uv_sizes"]?.["*"] ?? [cube["size"][0], cube["size"][2]]
					},
					"north": {
						"uv": cube["uv"]?.["north"] ?? cube["uv"]?.["side"] ?? cube["uv"]?.["*"] ?? northUvOffset,
						"uv_size": cube["uv_sizes"]?.["north"] ?? cube["uv_sizes"]?.["side"] ?? cube["uv_sizes"]?.["*"] ?? [cube["size"][0], cube["size"][1]]
					},
					"south": {
						"uv": cube["uv"]?.["south"] ?? cube["uv"]?.["side"] ?? cube["uv"]?.["*"] ?? southUvOffset,
						"uv_size": cube["uv_sizes"]?.["south"] ?? cube["uv_sizes"]?.["side"] ?? cube["uv_sizes"]?.["*"] ?? [cube["size"][0], cube["size"][1]]
					}
				}
			};
			
			let croppable = false;
			// When the size of a cube in a direction is 0, we can remove all faces but 1. Because we have DisableCulling in the material, this single face will render from the back as well.
			// On a side note, if there wasn't the DisableCulling material state and we rendered both faces on opposite sides, the texture wouldn't be mirrored on the other side, so this is another bug fix ig
			if(cube["size"][0] == 0) {
				// 0 width: only render west
				["east", "down", "up", "north", "south"].forEach(faceName => delete boneCube["uv"][faceName]);
				croppable = true;
			}
			if(cube["size"][1] == 0) {
				// 0 height: only render down
				["west", "east", "up", "north", "south"].forEach(faceName => delete boneCube["uv"][faceName]);
				croppable = true;
			}
			if(cube["size"][2] == 0) {
				// 0 depth: only render north
				["west", "east", "down", "up", "south"].forEach(faceName => delete boneCube["uv"][faceName]);
				croppable = true;
			}
			
			let cubeVariant;
			if("variant" in cube) {
				cubeVariant = cube["variant"];
			} else if(cube["ignore_eigenvariant"]) {
				if(variantWithoutEigenvariant == undefined) {
					variantWithoutEigenvariant = this.#getTextureVariant(block, true);
				}
				cubeVariant = variantWithoutEigenvariant;
			} else {
				cubeVariant = variant; // default variant for this block
			}
			
			let textureSize = cube["texture_size"] ?? [16, 16];
			// add generic keys to all faces, and convert texture references into indices
			for(let faceName in boneCube["uv"]) {
				let face = boneCube["uv"][faceName];
				let textureFace = cube["textures"]?.[faceName] ?? (["west", "east", "north", "south"].includes(faceName)? cube["textures"]?.["side"] : undefined) ?? cube["textures"]?.["*"] ?? faceName;
				if(textureFace == "none") {
					delete boneCube["uv"][faceName];
					continue;
				}
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
				} else if(/^textures\/[\w\/]+$/.test(textureFace)) { // file path
					textureRef["texture_path_override"] = textureFace;
				} else {
					let terrainTextureOverride = cube["terrain_texture"] ?? blockShapeTerrainTextureOverride;
					if(terrainTextureOverride) {
						let slicing = terrainTextureOverride.match(/^#block_name(\[(-?\d+):(-?\d*)\]|\[:(-?\d+)\])?$/);
						if(slicing) {
							terrainTextureOverride = blockName.slice(slicing[2], slicing[4] ?? (slicing[3] == ""? undefined : slicing[3]));
							console.debug(`Sliced ${blockName} into ${terrainTextureOverride} for terrain texture override`);
						}
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
					textureRef["tint"] = hexColourToClampedTriplet(cube["tint"]);
				}
				if("states" in block && "redstone_signal" in block["states"]) {
					textureRef["tint"] = BlockGeoMaker.#REDSTONE_DUST_TINTS[block["states"]["redstone_signal"]];
				}
				
				this.textureRefs.add(textureRef);
				boneCube["uv"][faceName] = this.textureRefs.indexOf(textureRef);
			}
			
			if("rot" in cube) {
				boneCube["rotation"] = cube["rot"];
				boneCube["pivot"] = cube["pivot"] ?? [8, 8, 8]; // we set the pivot for this cube to be the center of it. if we don't specify this it would look at the pivot for the bone, which would be different if we're doing our fancy animations.
			}
			boneCube = this.#scaleBoneCube(boneCube);
			boneCubes.push(boneCube);
		});
		return boneCubes;
	}
	/**
	 * Gets the index of the variant to use in terrain_texture.json for a block.
	 * @param {Block} block
	 * @param {Boolean} [ignoreEigenvariant]
	 * @returns {Number}
	 */
	#getTextureVariant(block, ignoreEigenvariant = false) {	
		let blockName = block["name"];
		let eigenvariantExists = blockName in BlockGeoMaker.#eigenvariants;
		if(!ignoreEigenvariant && eigenvariantExists) {
			let variant = BlockGeoMaker.#eigenvariants[blockName];
			console.debug(`Using eigenvariant ${variant} for block ${blockName}`);
			return variant;
		} else if(ignoreEigenvariant && !eigenvariantExists) {
			console.warn(`Cannot ignore eigenvariant of ${blockName} as it doesn't exist!`);
		}
		
		if(!("states" in block)) {
			return -1;
		}
		let blockShape = this.#getBlockShape(blockName); // In copied block shapes, we want to look at the original block shape's texture variants, not the copied's. E.g. With candle_cake, we don't want the cake that is copied to look at the texture variants for cake (which includes bite_counter).
		let blockShapeSpecificVariants = this.#blockStateTextureVariants[blockShape];
		let blockNameSpecificVariants = this.#blockStateTextureVariantPatterns.find(([pattern]) => pattern.test(blockName))?.[1];
		if(blockNameSpecificVariants?.["#exclusive_add"]) {
			let variant = 0;
			Object.entries(block["states"]).forEach(([blockStateName, blockStateValue]) => {
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
		Object.entries(block["states"]).forEach(([blockStateName, blockStateValue]) => {
			let blockStateVariants = blockNameSpecificVariants?.[blockStateName] ?? blockShapeSpecificVariants?.[blockStateName] ?? this.#blockStateTextureVariants["*"][blockStateName];
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
	/** Scales a bone cube towards (8, 8, 8).
	 * @param {*} boneCube
	 * @returns {*}
	 */
	#scaleBoneCube(boneCube) {
		boneCube["origin"] = boneCube["origin"].map(x => (x - 8) * this.config.SCALE + 8);
		boneCube["size"] = boneCube["size"].map(x => x * this.config.SCALE);
		return boneCube;
	}
	#checkBlockStateConditional(block, conditional) {
		let trimmedConditional = conditional.replaceAll(/\s/g, "");
		let booleanOperations = trimmedConditional.match(/&&|\|\|/g) ?? []; // can have multiple separated by ?? or ||
		let booleanValues = trimmedConditional.split(/&&|\|\|/).map(booleanExpression => {
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
}