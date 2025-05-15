import * as NBT from "nbtify";
import { ZipWriter, TextReader, BlobWriter, BlobReader, ZipReader } from "@zip.js/zip.js";

import BlockGeoMaker from "./BlockGeoMaker.js";
import TextureAtlas from "./TextureAtlas.js";
import MaterialList from "./MaterialList.js";
import PreviewRenderer from "./PreviewRenderer.js";

import * as entityScripts from "./entityScripts.molang.js";
import { addPaddingToImage, arrayMin, awaitAllEntries, CachingFetcher, concatenateFiles, createNumericEnum, desparseArray, exp, floor, getFileExtension, hexColorToClampedTriplet, JSONMap, JSONSet, lcm, loadTranslationLanguage, max, min, overlaySquareImages, pi, resizeImageToBlob, round, sha256, translate, UserError } from "./essential.js";
import ResourcePackStack from "./ResourcePackStack.js";
import BlockUpdater from "./BlockUpdater.js";

export const VERSION = "dev";
export const IGNORED_BLOCKS = ["air", "piston_arm_collision", "sticky_piston_arm_collision"]; // blocks to be ignored when scanning the structure file
const IGNORED_BLOCK_ENTITIES = ["Beacon", "Beehive", "Bell", "BrewingStand", "ChiseledBookshelf", "CommandBlock", "Comparator", "Conduit", "EnchantTable", "EndGateway", "JigsawBlock", "Lodestone", "SculkCatalyst", "SculkShrieker", "SculkSensor", "CalibratedSculkSensor", "StructureBlock", "BrushableBlock", "TrialSpawner", "Vault"];
export const PLAYER_CONTROL_NAMES = {
	TOGGLE_RENDERING: "player_controls.toggle_rendering",
	CHANGE_OPACITY: "player_controls.change_opacity",
	TOGGLE_TINT: "player_controls.toggle_tint",
	TOGGLE_VALIDATING: "player_controls.toggle_validating",
	CHANGE_LAYER: "player_controls.change_layer",
	DECREASE_LAYER: "player_controls.decrease_layer",
	CHANGE_LAYER_MODE: "player_controls.change_layer_mode",
	MOVE_HOLOGRAM: "player_controls.move_hologram",
	ROTATE_HOLOGRAM: "player_controls.rotate_hologram",
	CHANGE_STRUCTURE: "player_controls.change_structure",
	DISABLE_PLAYER_CONTROLS: "player_controls.disable_player_controls",
	BACKUP_HOLOGRAM: "player_controls.backup_hologram"
};
export const DEFAULT_PLAYER_CONTROLS = {
	TOGGLE_RENDERING: createItemCriteria("brick"),
	CHANGE_OPACITY: createItemCriteria("amethyst_shard"),
	TOGGLE_TINT: createItemCriteria("white_dye"),
	TOGGLE_VALIDATING: createItemCriteria("iron_ingot"),
	CHANGE_LAYER: createItemCriteria("leather"),
	DECREASE_LAYER: createItemCriteria("feather"),
	CHANGE_LAYER_MODE: createItemCriteria("flint"),
	MOVE_HOLOGRAM: createItemCriteria("stick"),
	ROTATE_HOLOGRAM: createItemCriteria("copper_ingot"),
	CHANGE_STRUCTURE: createItemCriteria("arrow"),
	DISABLE_PLAYER_CONTROLS: createItemCriteria("bone"),
	BACKUP_HOLOGRAM: createItemCriteria("paper")
};

const HOLOGRAM_LAYER_MODES = createNumericEnum(["SINGLE", "ALL_BELOW"]);

/**
 * Makes a HoloPrint resource pack from a structure file.
 * @param {File|Array<File>} structureFiles Either a singular structure file (`*.mcstructure`), or an array of structure files
 * @param {HoloPrintConfig} [config]
 * @param {ResourcePackStack} [resourcePackStack]
 * @param {HTMLElement} [previewCont]
 * @returns {Promise<File>} Resource pack (`*.mcpack`)
 */
export async function makePack(structureFiles, config = {}, resourcePackStack, previewCont) {
	console.info(`Running HoloPrint ${VERSION}`);
	if(!resourcePackStack) {
		console.debug("Waiting for resource pack stack initialisation...");
		resourcePackStack = await new ResourcePackStack();
		console.debug("Resource pack stack initialised!");
	}
	let startTime = performance.now();
	
	config = addDefaultConfig(config);
	if(!Array.isArray(structureFiles)) {
		structureFiles = [structureFiles];
	}
	let nbts = await Promise.all(structureFiles.map(structureFile => readStructureNBT(structureFile)));
	console.info("Finished reading structure NBTs!");
	console.log("NBTs:", nbts);
	let structureSizes = nbts.map(nbt => nbt["size"].map(x => +x)); // Stored as Number instances: https://github.com/Offroaders123/NBTify/issues/50
	let packName = config.PACK_NAME ?? getDefaultPackName(structureFiles);
	
	// Make the pack
	let loadedStuff = await loadStuff({
		packTemplate: {
			manifest: "manifest.json",
			hologramRenderControllers: "render_controllers/armor_stand.hologram.render_controllers.json",
			hologramGeo: "models/entity/armor_stand.hologram.geo.json", // this is where we put all the ghost blocks
			hologramMaterial: "materials/entity.material",
			hologramAnimationControllers: "animation_controllers/armor_stand.hologram.animation_controllers.json",
			hologramAnimations: "animations/armor_stand.hologram.animation.json",
			boundingBoxOutlineParticle: "particles/bounding_box_outline.json",
			blockValidationParticle: "particles/block_validation.json",
			savingBackupParticle: "particles/saving_backup.json",
			singleWhitePixelTexture: "textures/particle/single_white_pixel.png",
			exclamationMarkTexture: "textures/particle/exclamation_mark.png",
			saveIconTexture: "textures/particle/save_icon.png",
			itemTexture: config.RETEXTURE_CONTROL_ITEMS? "textures/item_texture.json" : undefined,
			terrainTexture: config.RETEXTURE_CONTROL_ITEMS? "textures/terrain_texture.json" : undefined,
			hudScreenUI: config.MATERIAL_LIST_ENABLED? "ui/hud_screen.json" : undefined,
			customEmojiFont: "font/glyph_E2.png",
			languagesDotJson: "texts/languages.json"
		},
		resources: {
			entityFile: "entity/armor_stand.entity.json",
			defaultPlayerRenderControllers: config.PLAYER_CONTROLS_ENABLED? "render_controllers/player.render_controllers.json" : undefined,
			resourceItemTexture: config.RETEXTURE_CONTROL_ITEMS? "textures/item_texture.json" : undefined
		},
		otherFiles: {
			packIcon: config.PACK_ICON_BLOB ?? makePackIcon(concatenateFiles(structureFiles)),
			itemIcons: config.RETEXTURE_CONTROL_ITEMS? fetch("data/itemIcons.json").then(res => res.jsonc()) : undefined
		},
		data: { // these will not be put into the pack
			blockMetadata: "metadata/vanilladata_modules/mojang-blocks.json",
			itemMetadata: "metadata/vanilladata_modules/mojang-items.json"
		}
	}, resourcePackStack);
	let { manifest, packIcon, entityFile, hologramRenderControllers, defaultPlayerRenderControllers, hologramGeo, hologramMaterial, hologramAnimationControllers, hologramAnimations, boundingBoxOutlineParticle, blockValidationParticle, savingBackupParticle, singleWhitePixelTexture, exclamationMarkTexture, saveIconTexture, itemTexture, hudScreenUI, customEmojiFont, languagesDotJson, resourceItemTexture, terrainTexture, itemIcons } = loadedStuff.files;
	let { blockMetadata, itemMetadata } = loadedStuff.data;
	let resourceLangFiles = (await loadStuff({
		resources: Object.fromEntries(languagesDotJson.map(language => [language, `texts/${language}.lang`])) // load the language file resources for each language
	}, resourcePackStack)).files;
	
	let structures = nbts.map(nbt => nbt["structure"]);
	
	let palettesAndIndices = await Promise.all(structures.map(structure => tweakBlockPalette(structure, config.IGNORED_BLOCKS)));
	let { palette: blockPalette, indices: allStructureIndicesByLayer } = mergeMultiplePalettesAndIndices(palettesAndIndices);
	if(desparseArray(blockPalette).length == 0) {
		throw new UserError(`Structure is empty! No blocks are inside the structure.`);
	}
	console.log("combined palette: ", blockPalette);
	console.log("remapped indices: ", allStructureIndicesByLayer);
	window.blockPalette = blockPalette;
	window.blockIndices = allStructureIndicesByLayer;
	
	let blockGeoMaker = await new BlockGeoMaker(config);
	// makeBoneTemplate() is an impure function and adds texture references to the textureRefs set property.
	let boneTemplatePalette = blockPalette.map(block => blockGeoMaker.makeBoneTemplate(block));
	console.info("Finished making block geometry templates!");
	console.log("Block geo maker:", blockGeoMaker);
	console.log("Bone template palette:", structuredClone(boneTemplatePalette));
	
	let textureAtlas = await new TextureAtlas(config, resourcePackStack);
	let textureRefs = [...blockGeoMaker.textureRefs];
	await textureAtlas.makeAtlas(textureRefs); // each texture reference will get added to the textureUvs array property
	let textureBlobs = textureAtlas.imageBlobs;
	let defaultTextureIndex = max(textureBlobs.length - 3, 0); // default to 80% opacity
	
	console.log("Texture UVs:", textureAtlas.textures);
	boneTemplatePalette.forEach(boneTemplate => {
		boneTemplate["cubes"].forEach(cube => {
			Object.keys(cube["uv"]).forEach(faceName => {
				let face = cube["uv"][faceName];
				let imageUv = structuredClone(textureAtlas.textures[face["index"]]);
				if(face["flip_horizontally"]) {
					imageUv["uv"][0] += imageUv["uv_size"][0];
					imageUv["uv_size"][0] *= -1;
				}
				if(face["flip_vertically"]) {
					imageUv["uv"][1] += imageUv["uv_size"][1];
					imageUv["uv_size"][1] *= -1;
				}
				cube["uv"][faceName] = {
					"uv": imageUv["uv"],
					"uv_size": imageUv["uv_size"]
				};
				if("crop" in imageUv) {
					let crop = imageUv["crop"];
					let cropXRem = 1 - crop["w"] - crop["x"]; // remaining horizontal space on the other side of the cropped region
					let cropYRem = 1 - crop["h"] - crop["y"];
					if(cube["size"][0] == 0) {
						cube["origin"][2] += cube["size"][2] * (face["flip_horizontally"]? cropXRem : crop["x"]);
						cube["origin"][1] += cube["size"][1] * (face["flip_vertically"]? crop["y"] : cropYRem); // the latter term is the distance from the bottom of the texture, which is upwards direction in 3D space.
						cube["size"][2] *= crop["w"];
						cube["size"][1] *= crop["h"];
					} else if(cube["size"][1] == 0) {
						cube["origin"][0] += cube["size"][0] * (face["flip_horizontally"]? cropXRem : crop["x"]);
						cube["origin"][2] += cube["size"][2] * (face["flip_vertically"]? cropYRem : crop["y"]);
						cube["size"][0] *= crop["w"];
						cube["size"][2] *= crop["h"];
					} else if(cube["size"][2] == 0) {
						cube["origin"][0] += cube["size"][0] * (face["flip_horizontally"]? cropXRem : crop["x"]);
						cube["origin"][1] += cube["size"][1] * (face["flip_vertically"]? crop["y"] : cropYRem);
						cube["size"][0] *= crop["w"];
						cube["size"][1] *= crop["h"];
					} else {
						console.error("Cannot crop bone template without zero size in one axis:", boneTemplate);
					}
				}
			});
		});
	});
	console.log("Bone template palette with resolved UVs:", boneTemplatePalette);
	
	let structureGeoTemplate = hologramGeo["minecraft:geometry"][0];
	hologramGeo["minecraft:geometry"].splice(0, 1);
	
	structureGeoTemplate["description"]["texture_width"] = textureAtlas.atlasWidth;
	structureGeoTemplate["description"]["texture_height"] = textureAtlas.atlasHeight;
	
	let structureWMolang = arrayToMolang(structureSizes.map(structureSize => structureSize[0]), "v.hologram.structure_index");
	let structureHMolang = arrayToMolang(structureSizes.map(structureSize => structureSize[1]), "v.hologram.structure_index");
	let structureDMolang = arrayToMolang(structureSizes.map(structureSize => structureSize[2]), "v.hologram.structure_index");
	
	if(!config.SPAWN_ANIMATION_ENABLED) {
		// Totally empty animation
		delete hologramAnimations["animations"]["animation.armor_stand.hologram.spawn"]["loop"];
		delete hologramAnimations["animations"]["animation.armor_stand.hologram.spawn"]["bones"];
	}
	
	let layerAnimationStates = hologramAnimationControllers["animation_controllers"]["controller.animation.armor_stand.hologram.layers"]["states"];
	let topLayer = max(...structureSizes.map(structureSize => structureSize[1])) - 1;
	layerAnimationStates["default"]["transitions"].push(
		{
			"l_0": `v.hologram.layer > -1 && v.hologram.layer != ${topLayer} && v.hologram.layer_mode == ${HOLOGRAM_LAYER_MODES.SINGLE}`
		},
		{
			[`l_${topLayer}`]: `v.hologram.layer == ${topLayer} && v.hologram.layer_mode == ${HOLOGRAM_LAYER_MODES.SINGLE}`
		}
	);
	if(topLayer > 0) {
		layerAnimationStates["default"]["transitions"].push(
			{
				"l_0-": `v.hologram.layer > -1 && v.hologram.layer != ${topLayer - 1} && v.hologram.layer_mode == ${HOLOGRAM_LAYER_MODES.ALL_BELOW}`
			},
			{
				[`l_${topLayer - 1}-`]: `v.hologram.layer == ${topLayer - 1} && v.hologram.layer_mode == ${HOLOGRAM_LAYER_MODES.ALL_BELOW}`
			}
		);
	}
	let entityDescription = entityFile["minecraft:client_entity"]["description"];
	
	let totalBlockCount = 0;
	let totalBlocksToValidateByStructure = [];
	let totalBlocksToValidateByStructureByLayer = [];
	let uniqueBlocksToValidate = new Set();
	
	let materialList = await new MaterialList(blockMetadata, itemMetadata);
	allStructureIndicesByLayer.forEach((structureIndicesByLayer, structureI) => {
		let structureSize = structureSizes[structureI];
		let geoShortName = `hologram_${structureI}`;
		let geoIdentifier = `geometry.armor_stand.hologram_${structureI}`;
		let geo = structuredClone(structureGeoTemplate);
		geo["description"]["identifier"] = geoIdentifier;
		entityDescription["geometry"][geoShortName] = geoIdentifier;
		hologramRenderControllers["render_controllers"]["controller.render.armor_stand.hologram"]["arrays"]["geometries"]["Array.geometries"].push(`Geometry.${geoShortName}`);
		let blocksToValidate = [];
		let blocksToValidateByLayer = [];
		
		let getSpawnAnimationDelay;
		let animationTimingFunc;
		let makeHologramSpawnAnimation;
		let spawnAnimationAnimatedBones = [];
		if(config.SPAWN_ANIMATION_ENABLED) {
			let totalVolume = structureSize.reduce((a, b) => a * b);
			let totalAnimationLength = 0;
			getSpawnAnimationDelay = (x, y, z) => {
				let randomness = 2 - 1.9 * exp(-0.005 * totalVolume); // 100 -> ~0.85, 1000 -> ~1.99, asymptotic to 2
				return config.SPAWN_ANIMATION_LENGTH * 0.25 * (structureSize[0] - x + y + structureSize[2] - z + Math.random() * randomness);
			};
			animationTimingFunc = x => 1 - (1 - x) ** 3;
			makeHologramSpawnAnimation = (delay, bonePos) => {
				let animationEnd = Number((delay + config.SPAWN_ANIMATION_LENGTH).toFixed(2));
				totalAnimationLength = max(totalAnimationLength, animationEnd);
				hologramAnimations["animations"]["animation.armor_stand.hologram.spawn"]["animation_length"] = totalAnimationLength;
				let keyframes = [0, 0.2, 0.4, 0.6, 0.8, 1]; // this is smooth enough
				let positionOffset = [-bonePos[0] - 8, -bonePos[1], -bonePos[2] - 8];
				let createAnimFromKeyframes = timingFunc => Object.fromEntries(keyframes.map(keyframe => [`${+(delay + keyframe * config.SPAWN_ANIMATION_LENGTH).toFixed(2)}`, timingFunc(keyframe)]));
				return {
					"scale": createAnimFromKeyframes(keyframe => (new Array(3)).fill(+animationTimingFunc(keyframe).toFixed(2))), // has to be an array here...
					"position": createAnimFromKeyframes(keyframe => positionOffset.map(x => +(x * (1 - animationTimingFunc(keyframe))).toFixed(2)))
				};
			};
		}
		for(let y = 0; y < structureSize[1]; y++) {
			let layerName = `l_${y}`;
			geo["bones"].push({
				"name": layerName,
				"parent": "hologram_offset_wrapper",
				"pivot": [8, 0, -8]
			});
			layerAnimationStates[layerName] = {
				"animations": [`hologram.l_${y}`],
				"blend_transition": 0.1,
				"blend_via_shortest_path": true,
				"transitions": [
					{
						[y == topLayer? "default" : `${layerName}-`]: `v.hologram.layer_mode == ${HOLOGRAM_LAYER_MODES.ALL_BELOW}`
					},
					{
						[y == 0? "default" : `l_${y - 1}`]: `v.hologram.layer < ${y}${y == topLayer? " && v.hologram.layer != -1" : ""}`
					},
					(y == topLayer? {
						"default": "v.hologram.layer == -1"
					} : {
						[`l_${y + 1}`]: `v.hologram.layer > ${y}`
					})
				]
			};
			hologramAnimations["animations"][`animation.armor_stand.hologram.l_${y}`] ??= {};
			let layerAnimation = hologramAnimations["animations"][`animation.armor_stand.hologram.l_${y}`];
			layerAnimation["loop"] = "hold_on_last_frame";
			layerAnimation["bones"] ??= {};
			for(let otherLayerY = 0; otherLayerY < structureSize[1]; otherLayerY++) {
				if(otherLayerY == y) {
					continue;
				}
				layerAnimation["bones"][`l_${otherLayerY}`] = {
					"scale": config.MINI_SCALE
				};
			}
			if(Object.entries(layerAnimation["bones"]).length == 0) {
				delete layerAnimation["bones"];
			}
			entityDescription["animations"][`hologram.l_${y}`] = `animation.armor_stand.hologram.l_${y}`;
			if(y < topLayer) { // top layer with all layers below is the default view, so the animation + animation controller state doesn't need to be made for it
				layerAnimationStates[`${layerName}-`] = {
					"animations": [`hologram.l_${y}-`],
					"blend_transition": 0.1,
					"blend_via_shortest_path": true,
					"transitions": [
						{
							[layerName]: `v.hologram.layer_mode == ${HOLOGRAM_LAYER_MODES.SINGLE}`
						},
						{
							[y == 0? "default" : `l_${y - 1}-`]: `v.hologram.layer < ${y}${y == topLayer - 1? " && v.hologram.layer != -1" : ""}`
						},
						(y >= topLayer - 1? {
							"default": "v.hologram.layer == -1"
						} : {
							[`l_${y + 1}-`]: `v.hologram.layer > ${y}`
						})
					]
				};
				hologramAnimations["animations"][`animation.armor_stand.hologram.l_${y}-`] ??= {};
				let layerAnimationAllBelow = hologramAnimations["animations"][`animation.armor_stand.hologram.l_${y}-`];
				layerAnimationAllBelow["loop"] = "hold_on_last_frame";
				layerAnimationAllBelow["bones"] ??= {};
				for(let otherLayerY = 0; otherLayerY < structureSize[1]; otherLayerY++) {
					if(otherLayerY <= y) {
						continue;
					}
					layerAnimationAllBelow["bones"][`l_${otherLayerY}`] = {
						"scale": config.MINI_SCALE
					};
				}
				if(Object.entries(layerAnimationAllBelow["bones"]).length == 0) {
					delete layerAnimationAllBelow["bones"];
				}
				entityDescription["animations"][`hologram.l_${y}-`] = `animation.armor_stand.hologram.l_${y}-`;
			}
			
			let blocksToValidateCurrentLayer = 0; // "layer" in here refers to y-coordinate, NOT structure layer
			for(let x = 0; x < structureSize[0]; x++) {
				for(let z = 0; z < structureSize[2]; z++) {
					let blockI = (x * structureSize[1] + y) * structureSize[2] + z;
					let firstBoneForThisCoordinate = true; // second-layer blocks (e.g. water in waterlogged blocks) will be at the same position
					structureIndicesByLayer.forEach((blockPaletteIndices, layerI) => {
						let paletteI = blockPaletteIndices[blockI];
						if(!(paletteI in boneTemplatePalette)) {
							if(paletteI in blockPalette) {
								console.error(`A bone template wasn't made for blockPalette[${paletteI}] = ${blockPalette[paletteI]["name"]}!`);
							}
							return;
						}
						let boneTemplate = boneTemplatePalette[paletteI];
						// console.table({x, y, z, i, paletteI, boneTemplate});
						
						let blockCoordinateName = `b_${x}_${y}_${z}`;
						let boneName = blockCoordinateName;
						if(!firstBoneForThisCoordinate) {
							boneName += `_${layerI}`;
						}
						if(config.SPAWN_ANIMATION_ENABLED && structureI == 0 && structureFiles.length > 1) {
							boneName += "_a"; // different bone name in order for the animation to not affect blocks in the same position in other structures
						}
						let bonePos = [-16 * x - 8, 16 * y, 16 * z - 8]; // I got these values from trial and error with blockbench (which makes the x negative I think. it's weird.)
						let positionedBoneTemplate = blockGeoMaker.positionBoneTemplate(boneTemplate, bonePos);
						let bonesToAdd = [{
							"name": boneName,
							"parent": layerName,
							"pivot": bonePos.map(x => x + 8), // prevent flickering
							...positionedBoneTemplate
						}];
						let rotWrapperBones = new JSONMap();
						let extraRotCounter = 0;
						bonesToAdd[0]["cubes"] = bonesToAdd[0]["cubes"].filter(cube => {
							if("extra_rots" in cube) { // cubes that copy with rotation in both the cube and the copied cube need wrapper bones to handle multiple rotations
								let extraRots = cube["extra_rots"];
								delete cube["extra_rots"];
								if(!rotWrapperBones.has(extraRots)) { // some rotations may be the same, so we use a map to cache the wrapper bone this cube should be added to
									let wrapperBones = [];
									let parentBoneName = boneName;
									extraRots.forEach(extraRot => {
										let wrapperBoneName = `${boneName}_rot_wrapper_${extraRotCounter++}`;
										wrapperBones.push({
											"name": wrapperBoneName,
											"parent": parentBoneName,
											"rotation": extraRot["rot"],
											"pivot": extraRot["pivot"]
										});
										parentBoneName = wrapperBoneName;
									});
									bonesToAdd.push(...wrapperBones);
									wrapperBones.at(-1)["cubes"] = [];
									rotWrapperBones.set(extraRots, wrapperBones.at(-1));
								}
								rotWrapperBones.get(extraRots)["cubes"].push(cube);
								return false;
							} else {
								return true;
							}
						});
						geo["bones"].push(...bonesToAdd);
						
						if(firstBoneForThisCoordinate) { // we only need 1 locator for each block position, even though there may be 2 bones in this position because of the 2nd layer
							hologramGeo["minecraft:geometry"][2]["bones"][1]["locators"][blockCoordinateName] ??= bonePos.map(x => x + 8);
						}
						if(config.SPAWN_ANIMATION_ENABLED && structureI == 0) {
							spawnAnimationAnimatedBones.push([boneName, getSpawnAnimationDelay(x, y, z), bonePos]);
						}
						
						let block = blockPalette[paletteI];
						if(!config.IGNORED_MATERIAL_LIST_BLOCKS.includes(block["name"])) {
							materialList.add(block);
						}
						if(layerI == 0) { // particle_expire_if_in_blocks only works on the first layer :(
							blocksToValidate.push({
								"locator": blockCoordinateName,
								"block": block["name"],
								"pos": [x, y, z]
							});
							blocksToValidateCurrentLayer++;
							uniqueBlocksToValidate.add(block["name"]);
						}
						firstBoneForThisCoordinate = false;
						totalBlockCount++;
					});
				}
			}
			blocksToValidateByLayer.push(blocksToValidateCurrentLayer);
		}
		hologramGeo["minecraft:geometry"].push(geo);
		
		if(config.SPAWN_ANIMATION_ENABLED && structureI == 0) {
			let minDelay = arrayMin(spawnAnimationAnimatedBones.map(([, delay]) => delay));
			spawnAnimationAnimatedBones.forEach(([boneName, delay, bonePos]) => {
				delay -= minDelay - 0.05;
				delay = Number(delay.toFixed(2));
				hologramAnimations["animations"]["animation.armor_stand.hologram.spawn"]["bones"][boneName] = makeHologramSpawnAnimation(delay, bonePos);
			});
		}
		
		addBoundingBoxParticles(hologramAnimationControllers, structureI, structureSize);
		addBlockValidationParticles(hologramAnimationControllers, structureI, blocksToValidate, structureSize);
		totalBlocksToValidateByStructure.push(blocksToValidate.length);
		totalBlocksToValidateByStructureByLayer.push(blocksToValidateByLayer);
	});
	
	entityDescription["materials"]["hologram"] = "holoprint_hologram";
	entityDescription["materials"]["hologram.wrong_block_overlay"] = "holoprint_hologram.wrong_block_overlay";
	entityDescription["textures"]["hologram.overlay"] = "textures/entity/overlay";
	entityDescription["textures"]["hologram.save_icon"] = "textures/particle/save_icon";
	entityDescription["animations"]["hologram.align"] = "animation.armor_stand.hologram.align";
	entityDescription["animations"]["hologram.offset"] = "animation.armor_stand.hologram.offset";
	entityDescription["animations"]["hologram.spawn"] = "animation.armor_stand.hologram.spawn";
	entityDescription["animations"]["hologram.wrong_block_overlay"] = "animation.armor_stand.hologram.wrong_block_overlay";
	entityDescription["animations"]["controller.hologram.spawn_animation"] = "controller.animation.armor_stand.hologram.spawn_animation";
	entityDescription["animations"]["controller.hologram.layers"] = "controller.animation.armor_stand.hologram.layers";
	entityDescription["animations"]["controller.hologram.bounding_box"] = "controller.animation.armor_stand.hologram.bounding_box";
	entityDescription["animations"]["controller.hologram.block_validation"] = "controller.animation.armor_stand.hologram.block_validation";
	entityDescription["animations"]["controller.hologram.saving_backup_particles"] = "controller.animation.armor_stand.hologram.saving_backup_particles";
	entityDescription["scripts"]["animate"] ??= [];
	entityDescription["scripts"]["animate"].push("hologram.align", "hologram.offset", "hologram.wrong_block_overlay", "controller.hologram.spawn_animation", "controller.hologram.layers", "controller.hologram.bounding_box", "controller.hologram.block_validation", "controller.hologram.saving_backup_particles");
	entityDescription["scripts"]["should_update_bones_and_effects_offscreen"] = true; // makes backups work when offscreen (from my testing it helps a bit). this also makes it render when you're facing away, removing the need for visible_bounds_width/visible_bounds_height in the geometry file. (when should_update_effects_offscreen is set, it renders when facing away, but doesn't seem to have access to v. variables.)
	entityDescription["scripts"]["initialize"] ??= [];
	entityDescription["scripts"]["initialize"].push(functionToMolang(entityScripts.armorStandInitialization, {
		structureSize: structureSizes[0],
		initialOffset: config.INITIAL_OFFSET,
		defaultTextureIndex,
		singleLayerMode: HOLOGRAM_LAYER_MODES.SINGLE,
		structureCount: structureFiles.length
	}));
	entityDescription["scripts"]["pre_animation"] ??= [];
	entityDescription["scripts"]["pre_animation"].push(functionToMolang(entityScripts.armorStandPreAnimation, {
		textureBlobsCount: textureBlobs.length,
		totalBlocksToValidate: arrayToMolang(totalBlocksToValidateByStructure, "v.hologram.structure_index"),
		totalBlocksToValidateByLayer: array2DToMolang(totalBlocksToValidateByStructureByLayer, "v.hologram.structure_index", "v.hologram.layer"),
		backupSlotCount: config.BACKUP_SLOT_COUNT,
		structureWMolang,
		structureHMolang,
		structureDMolang,
		toggleRendering: itemCriteriaToMolang(config.CONTROLS.TOGGLE_RENDERING),
		changeOpacity: itemCriteriaToMolang(config.CONTROLS.CHANGE_OPACITY),
		toggleTint: itemCriteriaToMolang(config.CONTROLS.TOGGLE_TINT),
		toggleValidating: itemCriteriaToMolang(config.CONTROLS.TOGGLE_VALIDATING),
		changeLayer: itemCriteriaToMolang(config.CONTROLS.CHANGE_LAYER),
		decreaseLayer: itemCriteriaToMolang(config.CONTROLS.DECREASE_LAYER),
		changeLayerMode: itemCriteriaToMolang(config.CONTROLS.CHANGE_LAYER_MODE),
		rotateHologram: itemCriteriaToMolang(config.CONTROLS.ROTATE_HOLOGRAM),
		disablePlayerControls: itemCriteriaToMolang(config.CONTROLS.DISABLE_PLAYER_CONTROLS),
		backupHologram: itemCriteriaToMolang(config.CONTROLS.BACKUP_HOLOGRAM),
		singleLayerMode: HOLOGRAM_LAYER_MODES.SINGLE,
		ACTIONS: entityScripts.ACTIONS
	}));
	entityDescription["geometry"]["hologram.wrong_block_overlay"] = "geometry.armor_stand.hologram.wrong_block_overlay";
	entityDescription["geometry"]["hologram.valid_structure_overlay"] = "geometry.armor_stand.hologram.valid_structure_overlay";
	entityDescription["geometry"]["hologram.particle_alignment"] = "geometry.armor_stand.hologram.particle_alignment";
	entityDescription["render_controllers"] ??= [];
	entityDescription["render_controllers"].push({
		"controller.render.armor_stand.hologram": "v.hologram.rendering"
	}, {
		"controller.render.armor_stand.hologram.wrong_block_overlay": "v.hologram.show_wrong_block_overlay"
	}, {
		"controller.render.armor_stand.hologram.valid_structure_overlay": "v.hologram.validating && v.wrong_blocks == 0"
	}, "controller.render.armor_stand.hologram.particle_alignment");
	entityDescription["particle_effects"] ??= {};
	entityDescription["particle_effects"]["bounding_box_outline"] = "holoprint:bounding_box_outline";
	entityDescription["particle_effects"]["saving_backup"] = "holoprint:saving_backup";
	
	textureBlobs.forEach(([textureName]) => {
		entityDescription["textures"][textureName] = `textures/entity/${textureName}`;
		hologramRenderControllers["render_controllers"]["controller.render.armor_stand.hologram"]["arrays"]["textures"]["Array.textures"].push(`Texture.${textureName}`);
	});
	
	let tintColorChannels = hexColorToClampedTriplet(config.TINT_COLOR);
	hologramRenderControllers["render_controllers"]["controller.render.armor_stand.hologram"]["overlay_color"] = {
		"r": +tintColorChannels[0].toFixed(4),
		"g": +tintColorChannels[1].toFixed(4),
		"b": +tintColorChannels[2].toFixed(4),
		"a": `v.hologram.show_tint? ${config.TINT_OPACITY} : 0`
	};
	
	let overlayTexture = await singleWhitePixelTexture.setOpacity(config.WRONG_BLOCK_OVERLAY_COLOR[3]);
	
	let totalMaterialCount = materialList.totalMaterialCount;
	
	// add the particles' short names, and then reference them in the animation controller
	uniqueBlocksToValidate.forEach(blockName => {
		let particleName = `validate_${blockName.replace(":", ".")}`;
		entityDescription["particle_effects"][particleName] = `holoprint:${particleName}`;
	});
	
	let playerRenderControllers = defaultPlayerRenderControllers && addPlayerControlsToRenderControllers(config, defaultPlayerRenderControllers);
	
	console.log("Block counts map:", materialList.materials);
	let finalisedMaterialLists = Object.fromEntries(languagesDotJson.map(language => {
		materialList.setLanguage(resourceLangFiles[language]); // we could make the material list export to multiple languages simultaneously, but I'm assuming here that there could be gaps between language files so they have to be done separately (for whatever reason... maybe international relations deteriorate and they refuse to translate the new update to Chinese... idk)
		return [language, materialList.export()];
	}));
	let finalisedMaterialList = finalisedMaterialLists["en_US"]; // all languages have the same translation keys, which are used in the material list UI. the translated item names (which are different for every language) are used in the pack description only.
	console.log("Finalised material list:", finalisedMaterialList);
	
	// console.log(partitionedBlockCounts);
	let highestItemCount;
	if(config.MATERIAL_LIST_ENABLED) {
		let missingItemAux = blockMetadata["data_items"].find(block => block.name == "minecraft:reserved6")?.["raw_id"] ?? 0;
		hudScreenUI["material_list_entries"]["controls"].push(...finalisedMaterialList.map(({ translationKey, partitionedCount, auxId }, i) => ({
			[`material_list_${i}@hud.material_list_entry`]: {
				"$item_translation_key": translationKey,
				"$item_count": partitionedCount,
				"$item_id_aux": auxId ?? missingItemAux,
				"$background_opacity": i % 2 * 0.2
			}
		})));
		highestItemCount = max(...finalisedMaterialList.map(({ count }) => count));
		let longestItemNameLength = max(...finalisedMaterialList.map(({ translatedName }) => translatedName.length));
		let longestCountLength = max(...finalisedMaterialList.map(({ partitionedCount }) => partitionedCount.length));
		if(longestItemNameLength + longestCountLength >= 43) {
			hudScreenUI["material_list"]["size"][0] = "50%"; // up from 40%
			hudScreenUI["material_list"]["max_size"][0] = "50%";
		}
		hudScreenUI["material_list"]["size"][1] = finalisedMaterialList.length * 12 + 12; // 12px for each item + 12px for the heading
		hudScreenUI["material_list_entry"]["controls"][0]["content"]["controls"][3]["item_name"]["size"][0] += `${round(longestCountLength * 4.2 + 10)}px`;
	}
	
	manifest["header"]["name"] = packName;
	manifest["header"]["uuid"] = crypto.randomUUID();
	let packVersion = VERSION.match(/^v(\d+)\.(\d+)\.(\d+)$/)?.slice(1)?.map(x => +x) ?? [1, 0, 0];
	manifest["header"]["version"] = packVersion;
	manifest["modules"][0]["uuid"] = crypto.randomUUID();
	manifest["modules"][0]["version"] = packVersion;
	manifest["metadata"]["generated_with"]["holoprint"] = [packVersion.join(".")];
	if(config.AUTHORS.length) {
		manifest["metadata"]["authors"].push(...config.AUTHORS);
	}
	if(config.DESCRIPTION) {
		let labelsAndLinks = findLinksInDescription(config.DESCRIPTION);
		labelsAndLinks.forEach(([label, link], i) => {
			manifest["settings"].push({
				"type": "input",
				"text": label,
				"default": link,
				"name": `link_${i}`
			});
		});
	}
	
	let controlsHaveBeenCustomised = JSON.stringify(config.CONTROLS) != JSON.stringify(DEFAULT_PLAYER_CONTROLS);
	let pmmpBedrockDataFetcher = config.RENAME_CONTROL_ITEMS || config.RETEXTURE_CONTROL_ITEMS? await createPmmpBedrockDataFetcher() : undefined;
	let itemTags = config.RENAME_CONTROL_ITEMS || config.RETEXTURE_CONTROL_ITEMS? await pmmpBedrockDataFetcher.fetch("item_tags.json").then(res => res.json()) : undefined;
	let { inGameControls, controlItemTranslations } = controlsHaveBeenCustomised || config.RENAME_CONTROL_ITEMS? await translateControlItems(config, blockMetadata, itemMetadata, languagesDotJson, resourceLangFiles, itemTags) : {};
	
	let packGenerationTime = (new Date()).toLocaleString();
	const disabledFeatureTranslations = { // these look at the .lang RP files
		"SPAWN_ANIMATION_ENABLED": "spawn_animation_disabled",
		"PLAYER_CONTROLS_ENABLED": "player_controls_disabled",
		"MATERIAL_LIST_ENABLED": "material_list_disabled",
		"RETEXTURE_CONTROL_ITEMS": "retextured_control_items_disabled",
		"RENAME_CONTROL_ITEMS": "renamed_control_items_disabled"
	};
	let languageFiles = await Promise.all(languagesDotJson.map(async language => {
		let languageFile = (await fetch(`packTemplate/texts/${language}.lang`).then(res => res.text())).replaceAll("\r\n", "\n"); // I hate windows sometimes (actually quite often now because of windows 11)
		languageFile = languageFile.replaceAll("{PACK_NAME}", packName);
		languageFile = languageFile.replaceAll("{PACK_GENERATION_TIME}", packGenerationTime);
		languageFile = languageFile.replaceAll("{TOTAL_MATERIAL_COUNT}", totalMaterialCount);
		languageFile = languageFile.replaceAll("{MATERIAL_LIST}", finalisedMaterialLists[language].map(({ translatedName, count }) => `${count} ${translatedName}`).join(", "));
		
		// now substitute in the extra bits into the main description if needed
		if(config.AUTHORS.length) {
			languageFile = languageFile.replaceAll(/\{STRUCTURE_AUTHORS\[([^)]+)\]\}/g, (useless, delimiter) => config.AUTHORS.join(delimiter));
			languageFile = languageFile.replaceAll("{AUTHORS_SECTION}", languageFile.match(/pack\.description\.authors=([^\t#\n]+)/)[1]);
		} else {
			languageFile = languageFile.replaceAll("{AUTHORS_SECTION}", "");
		}
		if(config.DESCRIPTION) {
			languageFile = languageFile.replaceAll("{DESCRIPTION}", config.DESCRIPTION.replaceAll("\n", "\\n"));
			languageFile = languageFile.replaceAll("{DESCRIPTION_SECTION}", languageFile.match(/pack\.description\.description=([^\t#\n]+)/)[1]);
		} else {
			languageFile = languageFile.replaceAll("{DESCRIPTION_SECTION}", "");
		}
		let translatedDisabledFeatures = Object.entries(disabledFeatureTranslations).filter(([feature]) => !config[feature]).map(([feature, translationKey]) => languageFile.match(new RegExp(`pack\\.description\\.${translationKey}=([^\\t#\\n]+)`))[1]).join("\\n");
		if(translatedDisabledFeatures) {
			languageFile = languageFile.replaceAll("{DISABLED_FEATURES}", translatedDisabledFeatures);
			languageFile = languageFile.replaceAll("{DISABLED_FEATURES_SECTION}", languageFile.match(/pack\.description\.disabled_features=([^\t#\n]+)/)[1]);
		} else {
			languageFile = languageFile.replaceAll("{DISABLED_FEATURES_SECTION}", "");
		}
		if(controlsHaveBeenCustomised) {
			languageFile = languageFile.replaceAll("{CONTROLS}", inGameControls[language].replaceAll("\n", "\\n"));
			languageFile = languageFile.replaceAll("{CONTROLS_SECTION}", languageFile.match(/pack\.description\.controls=([^\t#\n]+)/)[1]);
		} else {
			languageFile = languageFile.replaceAll("{CONTROLS_SECTION}", "");
		}
		
		languageFile = languageFile.replaceAll(/pack\.description\..+\s*/g, ""); // remove all the description template sections
		languageFile = languageFile.replaceAll(/\t*#.+/g, ""); // remove comments
		
		if(config.RENAME_CONTROL_ITEMS) {
			languageFile += controlItemTranslations[language];
		}
		
		return [language, languageFile];
	}));
	
	let hasModifiedTerrainTexture = false;
	let controlItemTextures = [];
	if(config.RETEXTURE_CONTROL_ITEMS) {
		let legacyItemMappings;
		let loadingLegacyItemMappingsPromise;
		let itemIconPatterns = Object.entries(itemIcons).filter(([key]) => key.startsWith("/") && key.endsWith("/")).map(([pattern, itemName]) => [new RegExp(pattern.slice(1, -1), "g"), itemName]);
		await Promise.all(Object.entries(config.CONTROLS).map(async ([control, itemCriteria]) => {
			let controlTexturePath = `textures/items/~${control.toLowerCase()}.png`; // because texture compositing works alphabetically not in array order, the ~ forces the control texture to always go on top of the actual item texture
			let controlTexture = await fetch(`packTemplate/${controlTexturePath}`).then(res => res.toImage());
			let paddedTexture = await addPaddingToImage(controlTexture, { // make it small in the top-left corner
				right: 16,
				bottom: 16
			});
			let controlItemTextureSizes = new Set();
			let allItems = expandItemCriteria(itemCriteria, itemTags);
			await Promise.all(allItems.map(async itemName => {
				if(itemName in itemIcons) {
					itemName = itemIcons[itemName];
				} else {
					let matchingPatternAndReplacement = itemIconPatterns.find(([pattern]) => pattern.test(itemName));
					if(matchingPatternAndReplacement) {
						itemName = itemName.replaceAll(...matchingPatternAndReplacement);
					}
				}
				let variant = -1;
				if(itemName.includes(".")) {
					let dotIndex = itemName.indexOf(".");
					variant = +itemName.slice(dotIndex + 1);
					itemName = itemName.slice(0, dotIndex);
				}
				let usingTerrainAtlas = false;
				let originalTexturePath = resourceItemTexture["texture_data"][itemName]?.["textures"];
				if(originalTexturePath) {
					if(Array.isArray(originalTexturePath)) {
						if(originalTexturePath.length == 1) {
							variant = 0;
						}
					}
				} else if(itemName in textureAtlas.blocksDotJson) {
					if(typeof textureAtlas.blocksDotJson[itemName]["carried_textures"] == "string" && textureAtlas.terrainTexture["texture_data"][textureAtlas.blocksDotJson[itemName]["carried_textures"]]["textures"].startsWith?.("textures/items/")) {
						hasModifiedTerrainTexture = true;
						usingTerrainAtlas = true;
						originalTexturePath = textureAtlas.terrainTexture["texture_data"][textureAtlas.blocksDotJson[itemName]["carried_textures"]]["textures"];
						itemName = textureAtlas.blocksDotJson[itemName]["carried_textures"];
					} else {
						console.warn(`Cannot retexture control item "${itemName}" because it is a block, and retexturing block items is currently unsupported.`);
						return;
					}
				} else {
					loadingLegacyItemMappingsPromise ??= new Promise(async (res, rej) => {
						try {
							// these mappings are from the old ids to the new ids. we want to go the other way, because bugrock still uses some old ids in item_texture.json
							legacyItemMappings = new Map();
							let updateMappings = await pmmpBedrockDataFetcher.fetch("r16_to_current_item_map.json").then(res => res.json());
							Object.entries(updateMappings["simple"]).forEach(([oldName, newName]) => {
								legacyItemMappings.set(newName.slice(10), [oldName.slice(10), -1]); // first 10 characters are "minecraft:"
							});
							Object.entries(updateMappings["complex"]).forEach(([oldName, newNames]) => { // complex mappings have indices, used in boats among others
								Object.entries(newNames).forEach(([index, newName]) => {
									legacyItemMappings.set(newName.slice(10), [oldName.slice(10), index]);
								});
							});
							res();
						} catch(e) {
							rej(e);
						}
					});
					try {
						await loadingLegacyItemMappingsPromise;
					} catch(e) {
						console.error("Somehow failed loading legacy item mappings. Please report this on GitHub!", e);
						return;
					}
					if(!legacyItemMappings.has(itemName)) {
						console.warn(`Can't find control item texture for ${itemName}`);
						return;
					}
					let [oldItemName, legacyVariant] = legacyItemMappings.get(itemName);
					variant = legacyVariant;
					originalTexturePath = resourceItemTexture["texture_data"][oldItemName]?.["textures"];
					if(!originalTexturePath) {
						console.warn(`Can't find control item texture for ${itemName} (${oldItemName})`);
						return;
					}
					itemName = oldItemName; // if the legacy item id has a single item_texture.json texture, we're fine here - just use the old name
				}
				
				if(Array.isArray(originalTexturePath)) { // if it's an array (like boats), we need to load the item texture and manually edit it here.
					if(variant == -1) {
						console.warn(`Don't know which texture to use for control item texture for ${itemName}: [${originalTexturePath}]`);
						return;
					}
					if(!(variant in originalTexturePath)) {
						console.error(`Item texture variant ${variant} for ${itemName} does not exist!`);
						return;
					}
					itemTexture["texture_data"][itemName] ??= {
						"textures": [...originalTexturePath] // clone the whole thing here. this is so we can edit it directly, which means that if we're modifying multiple textures in the same array all can be applied.
					};
					let specificOriginalTexturePath = `${itemTexture["texture_data"][itemName]["textures"][variant]}.png`;
					let originalImage;
					try {
						originalImage = await resourcePackStack.fetchResource(specificOriginalTexturePath).then(res => res.toImage());
					} catch(e) {
						console.warn(`Failed to load texture ${specificOriginalTexturePath} for control item retexturing!`);
						return;
					}
					let overlayedImageBlob = await overlaySquareImages(originalImage, paddedTexture);
					let newTexturePath = `${specificOriginalTexturePath.slice(0, -4)}_${control.toLowerCase()}.png`;
					controlItemTextures.push([newTexturePath, overlayedImageBlob]);
					itemTexture["texture_data"][itemName]["textures"][variant] = newTexturePath.slice(0, -4);
					console.debug(`Overlayed control texture for ${control} onto ${specificOriginalTexturePath}`);
				} else {
					let itemTextureSize = 16;
					if(resourcePackStack.hasResourcePacks) {
						try {
							let originalImage = await resourcePackStack.fetchResource(`${originalTexturePath}.png`).then(res => res.toImage());
							itemTextureSize = originalImage.width;
						} catch(e) {
							console.warn(`Could not load item texture ${originalTexturePath} for overlay texture scaling calculations!`, e);
						}
					}
					let safeSize = lcm(paddedTexture.width, itemTextureSize) * config.CONTROL_ITEM_TEXTURE_SCALE; // When compositing textures, MCBE scales all textures to the maximum, so the size of the overlay control texture has to be the LCM of itself and in-game items. Hence, if in-game items have a higher resolution than expected, they will probably be scaled wrong. The control item texture scale setting will scale them more (but they get reaaaaally big and make the item texture atlas huuuge)
					controlItemTextureSizes.add(safeSize);
					(usingTerrainAtlas? terrainTexture : itemTexture)["texture_data"][itemName] = {
						"textures": [originalTexturePath, `${controlTexturePath.slice(0, -4)}_${safeSize}`],
						"additive": true // texture compositing means resource packs that change the item textures will still work
					};
				}
			}));
			await Promise.all([...controlItemTextureSizes].map(async size => {
				let resizedImagePath = `${controlTexturePath.slice(0, -4)}_${size}.png`;
				let resizedTextureBlob = await resizeImageToBlob(paddedTexture, size);
				controlItemTextures.push([resizedImagePath, resizedTextureBlob]);
			}));
		}));
	}
	
	console.info("Finished making all pack files!");
	
	let packFileWriter = new BlobWriter();
	let pack = new ZipWriter(packFileWriter);
	let packFiles = [];
	if(structureFiles.length == 1) {
		packFiles.push([".mcstructure", structureFiles[0], structureFiles[0].name]);
	} else {
		packFiles.push(...structureFiles.map((structureFile, i) => [`${i}.mcstructure`, structureFile, structureFile.name]));
	}
	packFiles.push(["manifest.json", JSON.stringify(manifest)]);
	packFiles.push(["pack_icon.png", packIcon]);
	packFiles.push(["entity/armor_stand.entity.json", JSON.stringify(entityFile).replaceAll("HOLOGRAM_INITIAL_ACTIVATION", true)]);
	packFiles.push(["subpacks/punch_to_activate/entity/armor_stand.entity.json", JSON.stringify(entityFile).replaceAll("HOLOGRAM_INITIAL_ACTIVATION", false)]);
	packFiles.push(["render_controllers/armor_stand.hologram.render_controllers.json", JSON.stringify(hologramRenderControllers)]);
	if(config.PLAYER_CONTROLS_ENABLED) {
		packFiles.push(["render_controllers/player.render_controllers.json", JSON.stringify(playerRenderControllers)]);
	}
	packFiles.push(["models/entity/armor_stand.hologram.geo.json", stringifyWithFixedDecimals(hologramGeo)]);
	packFiles.push(["materials/entity.material", JSON.stringify(hologramMaterial)]);
	packFiles.push(["animation_controllers/armor_stand.hologram.animation_controllers.json", JSON.stringify(hologramAnimationControllers)]);
	packFiles.push(["particles/bounding_box_outline.json", JSON.stringify(boundingBoxOutlineParticle)]);
	uniqueBlocksToValidate.forEach(blockName => {
		let particleName = `validate_${blockName.replace(":", ".")}`; // file names can't have : in them
		let particle = structuredClone(blockValidationParticle);
		particle["particle_effect"]["description"]["identifier"] = `holoprint:${particleName}`;
		particle["particle_effect"]["components"]["minecraft:particle_expire_if_in_blocks"] = [blockName.includes(":")? blockName : `minecraft:${blockName}`]; // add back minecraft: namespace if it's missing
		packFiles.push([`particles/${particleName}.json`, JSON.stringify(particle)]);
	});
	packFiles.push(["particles/saving_backup.json", JSON.stringify(savingBackupParticle)]);
	packFiles.push(["textures/particle/single_white_pixel.png", await singleWhitePixelTexture.toBlob()]);
	packFiles.push(["textures/particle/exclamation_mark.png", await exclamationMarkTexture.toBlob()]);
	packFiles.push(["textures/particle/save_icon.png", await saveIconTexture.toBlob()]);
	packFiles.push(["textures/entity/overlay.png", await overlayTexture.toBlob()]);
	packFiles.push(["animations/armor_stand.hologram.animation.json", JSON.stringify(hologramAnimations)]);
	textureBlobs.forEach(([textureName, blob]) => {
		packFiles.push([`textures/entity/${textureName}.png`, blob]);
	});
	if(config.RETEXTURE_CONTROL_ITEMS) {
		packFiles.push(["textures/item_texture.json", JSON.stringify(itemTexture)]);
		if(hasModifiedTerrainTexture) {
			packFiles.push(["textures/terrain_texture.json", JSON.stringify(terrainTexture)]);
		}
		packFiles.push(...controlItemTextures);
	}
	if(config.MATERIAL_LIST_ENABLED) {
		packFiles.push(["ui/hud_screen.json", JSON.stringify(hudScreenUI)]);
		if(highestItemCount >= 1728) {
			packFiles.push(["font/glyph_E2.png", await customEmojiFont.toBlob()]);
		}
	}
	packFiles.push(["texts/languages.json", JSON.stringify(languagesDotJson)]);
	languageFiles.forEach(([language, languageFile]) => {
		packFiles.push([`texts/${language}.lang`, languageFile]);
	});
	
	await Promise.all(packFiles.map(([fileName, fileContents, comment]) => {
		/** @type {import("@zip.js/zip.js").ZipWriterAddDataOptions} */
		let options = {
			comment,
			level: config.COMPRESSION_LEVEL
		};
		if(fileContents instanceof Blob) {
			return pack.add(fileName, new BlobReader(fileContents), options);
		} else {
			return pack.add(fileName, new TextReader(fileContents), options);
		}
	}));
	let zippedPack = await pack.close();
	
	console.info(`Finished creating pack in ${(performance.now() - startTime).toFixed(0) / 1000}s!`);
	
	if(previewCont) {
		let showPreview = () => {
			hologramGeo["minecraft:geometry"].filter(geo => geo["description"]["identifier"].startsWith("geometry.armor_stand.hologram_")).map(geo => {
				(new PreviewRenderer(previewCont, textureAtlas, geo, hologramAnimations, config.SHOW_PREVIEW_SKYBOX)).catch(e => console.error("Preview renderer error:", e)); // is async but we won't wait for it
			});
		};
		if(totalBlockCount < config.PREVIEW_BLOCK_LIMIT) {
			showPreview();
		} else {
			let message = document.createElement("div");
			message.classList.add("previewMessage", "clickToView");
			let p = document.createElement("p");
			p.dataset.translationSubTotalBlockCount = totalBlockCount;
			if(structureFiles.length == 1) {
				p.dataset.translate = "preview.click_to_view";
			} else {
				p.dataset.translate = "preview.click_to_view_multiple";
			}
			message.appendChild(p);
			message.onEvent("click", () => {
				message.remove();
				showPreview();
			});
			previewCont.appendChild(message);
		}
	}
	
	return new File([zippedPack], `${packName}.holoprint.mcpack`, {
		type: "application/mcpack"
	});
}
/**
 * Retrieves the structure files from a completed HoloPrint resource pack.
 * @param {File} resourcePack HoloPrint resource pack (`*.mcpack)
 * @returns {Promise<Array<File>>}
 */
export async function extractStructureFilesFromPack(resourcePack) {
	let packFileReader = new BlobReader(resourcePack);
	let packFolder = new ZipReader(packFileReader);
	let structureFileEntries = (await packFolder.getEntries()).filter(entry => entry.filename.endsWith(".mcstructure"));
	packFolder.close();
	let structureBlobs = await Promise.all(structureFileEntries.map(entry => entry.getData(new BlobWriter())));
	let packName = resourcePack.name.slice(0, resourcePack.name.indexOf("."));
	if(structureBlobs.length == 1) {
		return [new File([structureBlobs[0]], structureFileEntries[0].comment || `${packName}.mcstructure`)];
	} else {
		return await Promise.all(structureBlobs.map(async (structureBlob, i) => new File([structureBlob], structureFileEntries[i].comment || `${packName}_${i}.mcstructure`)));
	}
}
/**
 * Updates a HoloPrint resource pack by remaking it.
 * @param {File} resourcePack HoloPrint resource pack to update (`*.mcpack`)
 * @param {HoloPrintConfig} [config]
 * @param {ResourcePackStack} [resourcePackStack]
 * @param {HTMLElement} [previewCont]
 * @returns {Promise<File>}
 */
export async function updatePack(resourcePack, config, resourcePackStack, previewCont) {
	let structureFiles = extractStructureFilesFromPack(resourcePack);
	if(!structureFiles) {
		throw new UserError(`No structure files found inside resource pack ${resourcePack.name}; cannot update pack!`);
	}
	return await makePack(structureFiles, config, resourcePackStack, previewCont);
}
/**
 * Returns the default pack name that would be used if no pack name is specified.
 * @param {Array<File>} structureFiles
 * @returns {String}
 */
export function getDefaultPackName(structureFiles) {
	let defaultName = structureFiles.map(structureFile => structureFile.name.replace(/(\.holoprint)?\.[^.]+$/, "")).join(", ");
	if(defaultName.length > 40) {
		defaultName = `${defaultName.slice(0, 19)}...${defaultName.slice(-19)}`
	}
	if(defaultName.trim() == "") {
		defaultName = "hologram";
	}
	return defaultName;
}
/**
 * Finds all labels and links in a description section that will be put in the settings links section.
 * @param {String} description
 * @returns {Array<[String, String]>}
 */
export function findLinksInDescription(description) {
	let links = [];
	Array.from(description.matchAll(/(.*?)\n?\s*(https?:\/\/[^\s]+)/g)).forEach(match =>  {
		let label = match[1].trim();
		let url = match[2].trim();
		links.push([label, url]);
	});
	return links;
}
/**
 * Creates an ItemCriteria from arrays of names and tags.
 * @param {String|Array<String>} names
 * @param {String|Array<String>} [tags]
 * @returns {ItemCriteria}
 */
export function createItemCriteria(names, tags = []) { // IDK why I haven't made this a class
	if(!Array.isArray(names)) {
		names = [names];
	}
	if(!Array.isArray(tags)) {
		tags = [tags];
	}
	return { names, tags };
}
/**
 * Adds default config options to a potentially incomplete config object.
 * @param {Partial<HoloPrintConfig>} config
 * @returns {HoloPrintConfig}
 */
export function addDefaultConfig(config) {
	return Object.freeze({
		...{ // defaults
			IGNORED_BLOCKS: [],
			IGNORED_MATERIAL_LIST_BLOCKS: [],
			SCALE: 0.95,
			OPACITY: 0.9,
			MULTIPLE_OPACITIES: true,
			TINT_COLOR: "#579EFA",
			TINT_OPACITY: 0.2,
			MINI_SCALE: 0.125, // size of ghost blocks when in the mini view for layers
			TEXTURE_OUTLINE_WIDTH: 0.25, // pixels, x ∈ [0, 1], x ∈ 2^ℝ
			TEXTURE_OUTLINE_COLOR: "#00F",
			TEXTURE_OUTLINE_OPACITY: 0.65,
			SPAWN_ANIMATION_ENABLED: true,
			SPAWN_ANIMATION_LENGTH: 0.4, // in seconds
			PLAYER_CONTROLS_ENABLED: true,
			CONTROLS: {},
			MATERIAL_LIST_ENABLED: true,
			RETEXTURE_CONTROL_ITEMS: true,
			CONTROL_ITEM_TEXTURE_SCALE: 1,
			RENAME_CONTROL_ITEMS: true,
			WRONG_BLOCK_OVERLAY_COLOR: [1, 0, 0, 0.3],
			INITIAL_OFFSET: [0, 0, 0],
			BACKUP_SLOT_COUNT: 10,
			PACK_NAME: undefined,
			PACK_ICON_BLOB: undefined,
			AUTHORS: [],
			DESCRIPTION: undefined,
			COMPRESSION_LEVEL: 5, // level 9 was 8 bytes larger than level 5 when I tested... :0
			PREVIEW_BLOCK_LIMIT: 500,
			SHOW_PREVIEW_SKYBOX: true
		},
		...config,
		...{ // overrides (applied after)
			IGNORED_BLOCKS: IGNORED_BLOCKS.concat(config.IGNORED_BLOCKS ?? []),
			CONTROLS: {
				...DEFAULT_PLAYER_CONTROLS,
				...config.CONTROLS
			}
		}
	});
}
/**
 * Creates a CachingFetcher to read pmmp/BedrockData.
 * @returns {Promise<CachingFetcher>}
 */
export async function createPmmpBedrockDataFetcher() {
	const pmmpBedrockDataVersion = "4.1.0+bedrock-1.21.70";
	return await new CachingFetcher(`BedrockData@${pmmpBedrockDataVersion}`, `https://cdn.jsdelivr.net/gh/pmmp/BedrockData@${pmmpBedrockDataVersion}/`);
}

/**
 * Reads the NBT of a structure file, returning a JSON object.
 * @param {File} structureFile `*.mcstructure`
 * @returns {Promise<Object>}
 */
async function readStructureNBT(structureFile) {
	if(structureFile.size == 0) {
		throw new UserError(`"${structureFile.name}" is an empty file! Please try exporting your structure again.\nIf you play on a version below 1.20.50, exporting to OneDrive will cause your structure file to be empty.`);
	}
	let arrayBuffer = await structureFile.arrayBuffer().catch(e => { throw new Error(`Could not read contents of structure file "${structureFile.name}"!\n${e}`); });
	let nbt = await NBT.read(arrayBuffer).catch(e => { throw new Error(`Invalid NBT in structure file "${structureFile.name}"!\n${e}`); });
	return nbt.data;
}
/**
 * Loads many files from different sources.
 * @template TPackTemplate
 * @template TResources
 * @template TOtherFiles
 * @template TData
 * @param {{ packTemplate?: TPackTemplate, resources?: TResources, otherFiles?: TOtherFiles, data?: TData }} stuff
 * @param {ResourcePackStack} resourcePackStack
 * @returns {Promise<{ files: { [K in keyof TPackTemplate | keyof TResources | keyof TOtherFiles]?: String|Blob|Record<String, any>|Array<any>|HTMLImageElement }, data: { [K in keyof TData]?: String|Blob|Record<String, any>|Array<any>|HTMLImageElement } }>}
*/
async function loadStuff(stuff, resourcePackStack) {
	let filePromises = {};
	Object.entries(stuff.packTemplate ?? {}).forEach(([name, path]) => {
		filePromises[name] = path && getResponseContents(fetch(`packTemplate/${path}`), path);
	});
	Object.entries(stuff.resources ?? {}).forEach(([name, path]) => {
		filePromises[name] = path && getResponseContents(resourcePackStack.fetchResource(path), path);
	});
	Object.assign(filePromises, stuff.otherFiles ?? {});
	let dataPromises = {};
	Object.entries(stuff.data ?? {}).forEach(([name, path]) => {
		dataPromises[name] = path && getResponseContents(resourcePackStack.fetchData(path), path);
	});
	return await awaitAllEntries({
		files: awaitAllEntries(filePromises),
		data: awaitAllEntries(dataPromises)
	});
}
/**
 * Gets the contents of a response based on the requested file extension (e.g. object from .json, image from .png, etc.).
 * @overload
 * @param {Promise<Response>} resPromise
 * @param {`${String}.${"json"|"material"}`} filePath
 * @returns {Promise<Record<String, any>|Array<any>>}
 */
/**
 * Gets the contents of a response based on the requested file extension (e.g. object from .json, image from .png, etc.).
 * @overload
 * @param {Promise<Response>} resPromise
 * @param {`${String}.lang`} filePath
 * @returns {Promise<String>}
 */
/**
 * Gets the contents of a response based on the requested file extension (e.g. object from .json, image from .png, etc.).
 * @overload
 * @param {Promise<Response>} resPromise
 * @param {`${String}.png`} filePath
 * @returns {Promise<HTMLImageElement>}
 */
/**
 * Gets the contents of a response based on the requested file extension (e.g. object from .json, image from .png, etc.).
 * @overload
 * @param {Promise<Response>} resPromise
 * @param {String} filePath
 * @returns {Promise<Blob>}
 */
async function getResponseContents(resPromise, filePath) {
	let res = await resPromise;
	if(res.status >= 400) {
		throw new Error(`HTTP error ${res.status} for ${res.url}`);
	}
	let fileExtension = getFileExtension(filePath);
	switch(fileExtension) {
		case "json":
		case "material": return await res.jsonc();
		case "lang": return await res.text();
		case "png": return await res.toImage();
	}
	return await res.blob();
}
/**
 * Removes ignored blocks from the block palette, updates old blocks, and adds block entities as separate entries.
 * @param {Record<String, any>} structure The de-NBT-ed structure file
 * @returns {{ palette: Array<Block>, indices: [Array<Number>, Array<Number>] }}
 */
async function tweakBlockPalette(structure, ignoredBlocks) {
	let palette = structuredClone(structure["palette"]["default"]["block_palette"]);
	
	let blockVersions = new Set(); // version should be constant for all blocks. just wanted to test this
	let blockUpdater = new BlockUpdater(true);
	let updatedBlocks = 0;
	for(let [i, block] of Object.entries(palette)) {
		blockVersions.add(+block["version"]);
		if(blockUpdater.blockNeedsUpdating(block)) {
			if(await blockUpdater.update(block)) {
				updatedBlocks++;
			}
		}
		block["name"] = block["name"].replace(/^minecraft:/, ""); // remove namespace here, right at the start
		if(ignoredBlocks.includes(block["name"])) {
			delete palette[i];
			continue;
		}
		delete block["version"];
		if(!Object.keys(block["states"]).length) {
			delete block["states"]; // easier viewing
		}
	}
	let blockVersionsStringified = [...blockVersions].map(v => BlockUpdater.parseBlockVersion(v).join("."));
	if(updatedBlocks > 0) {
		console.info(`Updated ${updatedBlocks} block${updatedBlocks > 1? "s" : ""} from ${blockVersionsStringified.join(", ")} to ${BlockUpdater.parseBlockVersion(BlockUpdater.LATEST_VERSION).join(".")}!`);
		console.info(`Note: Updated blocks may not be 100% accurate! If there are some errors, try loading the structure in the latest version of Minecraft then saving it again, so all blocks are up to date.`);
	}
	console.log("Block versions:", [...blockVersions], blockVersionsStringified);
	
	// add block entities into the block palette (on layer 0)
	let indices = structure["block_indices"].map(layer => structuredClone(layer).map(i => +i));
	let newIndexCache = new JSONMap();
	let entitylessBlockEntityIndices = new Set(); // contains all the block palette indices for blocks with block entities. since they don't have block entity data yet, and all block entities well be cloned and added to the end of the palette, we can remove all the entries in here from the palette.
	let blockPositionData = structure["palette"]["default"]["block_position_data"];
	for(let i in blockPositionData) {
		let oldPaletteI = indices[0][i];
		if(!(oldPaletteI in palette)) { // if the block is ignored, it will be deleted already, so there's no need to touch its block entities
			continue;
		}
		if(!("block_entity_data" in blockPositionData[i])) { // observers have tick_queue_data
			continue;
		}
		
		let blockEntityData = structuredClone(blockPositionData[i]["block_entity_data"]);
		if(IGNORED_BLOCK_ENTITIES.includes(blockEntityData["id"])) {
			continue;
		}
		delete blockEntityData["x"];
		delete blockEntityData["y"];
		delete blockEntityData["z"];
		
		// clone the old block and add the block entity data
		let newBlock = structuredClone(palette[oldPaletteI]);
		newBlock["block_entity_data"] = blockEntityData;
		
		// check that we haven't seen this block entity before. since in JS objects are compared by reference we have to stringify it first then check the cache.
		if(newIndexCache.has(newBlock)) {
			indices[0][i] = newIndexCache.get(newBlock);
		} else {
			let paletteI = palette.length;
			palette[paletteI] = newBlock;
			indices[0][i] = paletteI;
			newIndexCache.set(newBlock, paletteI);
			entitylessBlockEntityIndices.add(oldPaletteI); // we can schedule to delete the original block palette entry later, as it doesn't have any block entity data and all block entities clone it.
		}
	}
	for(let paletteI of entitylessBlockEntityIndices) {
		// console.log(`deleting entityless block entity ${paletteI} = ${JSON.stringify(blockPalette[paletteI])}`);
		delete palette[paletteI]; // this makes the blockPalette array discontinuous; when using native array methods, they skip over the empty slots.
	}
	
	return { palette, indices };
}
/**
 * Combines multiple block palettes into one, and updates indices for each.
 * @param {Array<{palette: Array<Block>, indices: Array<[Number, Number]>}>} palettesAndIndices
 * @returns {{palette: Array<Block>, indices: Array<Array<[Number, Number]>>}}
 */
function mergeMultiplePalettesAndIndices(palettesAndIndices) {
	if(palettesAndIndices.length == 1) {
		return {
			palette: palettesAndIndices[0].palette,
			indices: [palettesAndIndices[0].indices]
		};
	}
	let mergedPaletteSet = new JSONSet();
	let remappedIndices = [];
	palettesAndIndices.forEach(({ palette, indices }) => {
		let indexRemappings = [];
		palette.forEach((block, i) => {
			mergedPaletteSet.add(block);
			indexRemappings[i] = mergedPaletteSet.indexOf(block);
		});
		remappedIndices.push(indices.map(layer => layer.map(i => indexRemappings[i] ?? -1)));
	});
	return {
		palette: [...mergedPaletteSet],
		indices: remappedIndices
	};
}
/**
 * Adds bounding box particles for a single structure to the hologram animation controllers in-place.
 * @param {Record<String, any>} hologramAnimationControllers
 * @param {Number} structureI
 * @param {Vec3} structureSize
 */
function addBoundingBoxParticles(hologramAnimationControllers, structureI, structureSize) {
	let outlineParticleSettings = [
		`v.size = ${structureSize[0] / 2}; v.dir = 0; v.r = 1; v.g = 0; v.b = 0;`,
		`v.size = ${structureSize[1] / 2}; v.dir = 1; v.r = 1 / 255; v.g = 1; v.b = 0;`,
		`v.size = ${structureSize[2] / 2}; v.dir = 2; v.r = 0; v.g = 162 / 255; v.b = 1;`,
		`v.size = ${structureSize[0] / 2}; v.dir = 0; v.y = ${structureSize[1]}; v.r = 1; v.g = 1; v.b = 1;`,
		`v.size = ${structureSize[0] / 2}; v.dir = 0; v.z = ${structureSize[2]}; v.r = 1; v.g = 1; v.b = 1;`,
		`v.size = ${structureSize[0] / 2}; v.dir = 0; v.y = ${structureSize[1]}; v.z = ${structureSize[2]}; v.r = 1; v.g = 1; v.b = 1;`,
		`v.size = ${structureSize[1] / 2}; v.dir = 1; v.x = ${structureSize[0]}; v.r = 1; v.g = 1; v.b = 1;`,
		`v.size = ${structureSize[1] / 2}; v.dir = 1; v.z = ${structureSize[2]}; v.r = 1; v.g = 1; v.b = 1;`,
		`v.size = ${structureSize[1] / 2}; v.dir = 1; v.x = ${structureSize[0]}; v.z = ${structureSize[2]}; v.r = 1; v.g = 1; v.b = 1;`,
		`v.size = ${structureSize[2] / 2}; v.dir = 2; v.x = ${structureSize[0]}; v.r = 1; v.g = 1; v.b = 1;`,
		`v.size = ${structureSize[2] / 2}; v.dir = 2; v.y = ${structureSize[1]}; v.r = 1; v.g = 1; v.b = 1;`,
		`v.size = ${structureSize[2] / 2}; v.dir = 2; v.x = ${structureSize[0]}; v.y = ${structureSize[1]}; v.r = 1; v.g = 1; v.b = 1;`
	];
	let boundingBoxAnimation = {
		"particle_effects": [],
		"transitions": [
			{
				"hidden": `!v.hologram.rendering || v.hologram.structure_index != ${structureI}`
			}
		]
	};
	outlineParticleSettings.forEach(particleMolang => {
		boundingBoxAnimation["particle_effects"].push({
			"effect": "bounding_box_outline",
			"locator": "hologram_root",
			"pre_effect_script": particleMolang.replaceAll(/\s/g, "")
		});
	});
	let animationStateName = `visible_${structureI}`;
	hologramAnimationControllers["animation_controllers"]["controller.animation.armor_stand.hologram.bounding_box"]["states"][animationStateName] = boundingBoxAnimation;
	hologramAnimationControllers["animation_controllers"]["controller.animation.armor_stand.hologram.bounding_box"]["states"]["hidden"]["transitions"].push({
		[animationStateName]: `v.hologram.rendering && v.hologram.structure_index == ${structureI}`
	});
}
/**
 * Adds block validation particles for a single structure to the hologram animation controllers in-place.
 * @param {Record<String, any>} hologramAnimationControllers
 * @param {Number} structureI
 * @param {Array<Record<String, any>>} blocksToValidate
 * @param {Vec3} structureSize
 */
function addBlockValidationParticles(hologramAnimationControllers, structureI, blocksToValidate, structureSize) {
	let validateAllState = {
		"particle_effects": [],
		"transitions": [
			{
				"default": "!v.hologram.validating" // when changing structure it will always stop validating, so there's no need to check v.hologram.structure_index
			}
		]
	};
	let validateAllStateName = `validate_${structureI}`;
	let validationStates = hologramAnimationControllers["animation_controllers"]["controller.animation.armor_stand.hologram.block_validation"]["states"];
	validationStates[validateAllStateName] = validateAllState;
	let validateAllStateTransition = {
		[validateAllStateName]: `v.hologram.validating && v.hologram.structure_index == ${structureI} && v.hologram.layer == -1`
	};
	validationStates["default"]["transitions"].push(validateAllStateTransition);
	let layersWithBlocksToValidate = [];
	blocksToValidate.forEach(blockToValidate => {
		let [x, y, z] = blockToValidate["pos"];
		let animationStateName = `validate_${structureI}_l_${y}`;
		if(!(animationStateName in validationStates)) {
			let layerAnimationState = {
				"particle_effects": [],
				"transitions": [
					{
						"default": "!v.hologram.validating"
					},
					validateAllStateTransition
				]
			};
			layersWithBlocksToValidate.forEach(layerY => { // add transitions from this layer state to others
				layerAnimationState["transitions"].push({
					[`validate_${structureI}_l_${layerY}`]: `v.hologram.validating && v.hologram.structure_index == ${structureI} && v.hologram.layer == ${layerY}`
				});
			});
			Object.values(validationStates).forEach(state => { // add transitions from other layer states (+ default/all layers) to this layer
				state["transitions"].push({
					[animationStateName]: `v.hologram.validating && v.hologram.structure_index == ${structureI} && v.hologram.layer == ${y}`
				});
			});
			validationStates[animationStateName] = layerAnimationState;
			layersWithBlocksToValidate.push(y);
		}
		let particleEffect = {
			"effect": `validate_${blockToValidate["block"].replace(":", ".")}`,
			"locator": blockToValidate["locator"],
			"pre_effect_script": `
				v.x = ${x};
				v.y = ${y};
				v.z = ${z};
			`.replaceAll(/\s/g, "") // this is only used for setting the wrong block overlay position; the particle's position is set using the locator
		};
		validateAllState["particle_effects"].push(particleEffect);
		validationStates[animationStateName]["particle_effects"].push(particleEffect);
	});
	for(let y = 0; y < structureSize[1]; y++) { // layers with no blocks to validate don't have an animation controller state, so transitions to the default state need to be added for when it's on these empty layers
		if(!layersWithBlocksToValidate.includes(y)) {
			Object.entries(validationStates).forEach(([validationStateName, validationState]) => {
				if(validationStateName.startsWith(`validate_${structureI}`)) {
					validationState["transitions"][0]["default"] += ` || v.hologram.layer == ${y}`;
				}
			});
		}
	}
}

/**
 * Add player controls. These are done entirely in the render controller so character creator skins aren't disabled.
 * @param {HoloPrintConfig} config
 * @param {Record<String, any>} defaultPlayerRenderControllers
 * @returns {Record<String, any>}
 */
function addPlayerControlsToRenderControllers(config, defaultPlayerRenderControllers) {
	let initVariables = functionToMolang(entityScripts.playerInitVariables);
	let renderingControls = functionToMolang(entityScripts.playerRenderingControls, {
		toggleRendering: itemCriteriaToMolang(config.CONTROLS.TOGGLE_RENDERING),
		changeOpacity: itemCriteriaToMolang(config.CONTROLS.CHANGE_OPACITY),
		toggleTint: itemCriteriaToMolang(config.CONTROLS.TOGGLE_TINT),
		toggleValidating: itemCriteriaToMolang(config.CONTROLS.TOGGLE_VALIDATING),
		changeLayer: itemCriteriaToMolang(config.CONTROLS.CHANGE_LAYER),
		decreaseLayer: itemCriteriaToMolang(config.CONTROLS.DECREASE_LAYER),
		changeLayerMode: itemCriteriaToMolang(config.CONTROLS.CHANGE_LAYER_MODE),
		moveHologram: itemCriteriaToMolang(config.CONTROLS.MOVE_HOLOGRAM),
		rotateHologram: itemCriteriaToMolang(config.CONTROLS.ROTATE_HOLOGRAM),
		changeStructure: itemCriteriaToMolang(config.CONTROLS.CHANGE_STRUCTURE),
		backupHologram: itemCriteriaToMolang(config.CONTROLS.BACKUP_HOLOGRAM),
		ACTIONS: entityScripts.ACTIONS
	});
	let broadcastActions = functionToMolang(entityScripts.playerBroadcastActions, {
		backupSlotCount: config.BACKUP_SLOT_COUNT
	});
	return patchRenderControllers(defaultPlayerRenderControllers, {
		"controller.render.player.first_person": functionToMolang(entityScripts.playerFirstPerson, { initVariables, renderingControls, broadcastActions }),
		"controller.render.player.third_person": functionToMolang(entityScripts.playerThirdPerson, { initVariables, renderingControls, broadcastActions })
	});
}
/**
 * Patches a set of render controllers with some extra Molang code. Returns a new set of render controllers.
 * @param {Record<String, any>} renderControllers
 * @param {Record<String, any>} patches
 * @returns {Record<String, any>}
 */
function patchRenderControllers(renderControllers, patches) {
	return {
		"format_version": renderControllers["format_version"],
		"render_controllers": Object.fromEntries(Object.entries(patches).map(([controllerId, patch]) => {
			let controller = renderControllers["render_controllers"][controllerId];
			if(!controller) {
				console.error(`No render controller ${controllerId} found!`, renderControllers);
				return;
			}
			let originalTexture0 = controller["textures"][0];
			patch = patch.replace(/\n|\t/g, "");
			if(originalTexture0.endsWith(";")) {
				patch += originalTexture0;
			} else {
				patch += `return ${originalTexture0};`;
			}
			return [controllerId, {
				...controller,
				"textures": [patch, ...controller["textures"].slice(1)]
			}];
		}).removeFalsies())
	};
}
/**
 * Translates control items by making a fake material list.
 * @param {HoloPrintConfig} config
 * @param {Record<String, any>} blockMetadata
 * @param {Record<String, any>} itemMetadata
 * @param {Array<String>} languagesDotJson
 * @param {Record<String, String>} resourceLangFiles
 * @param {Record<String, Array<String>>} itemTags
 * @returns {Promise<{ inGameControls: Record<String, String>, controlItemTranslations: Record<String, String> }>}
 */
async function translateControlItems(config, blockMetadata, itemMetadata, languagesDotJson, resourceLangFiles, itemTags) {
	// make a fake material list for the in-game control items (just to translate them lol)
	let controlsMaterialList = await new MaterialList(blockMetadata, itemMetadata);
	let inGameControls = {};
	let controlItemTranslations = {};
	await Promise.all(languagesDotJson.map(language => loadTranslationLanguage(language)));
	languagesDotJson.forEach(language => {
		inGameControls[language] = "";
		let translatedControlNames = {};
		let translatedControlItems = {};
		/** @type {Record<String, Set<String>>} */
		let controlItemTranslationKeys = {};
		Object.entries(config.CONTROLS).forEach(([control, itemCriteria]) => {
			controlsMaterialList.clear();
			controlsMaterialList.setLanguage(resourceLangFiles[language]);
			itemCriteria["names"].forEach(itemName => controlsMaterialList.addItem(itemName));
			
			let itemInfo = controlsMaterialList.export();
			let translatedControlName = translate(PLAYER_CONTROL_NAMES[control], language);
			translatedControlNames[control] = translatedControlName;
			inGameControls[language] += `\n${translatedControlName}: ${[itemInfo.map(item => `§3${item.translatedName}§r`).join(", "), itemCriteria.tags.map(tag => `§p${tag}§r`).join(", ")].removeFalsies().join("; ")}`;
			
			let itemsInTags = itemCriteria.tags.filter(tag => !tag.includes(":")).map(tag => itemTags[`minecraft:${tag}`]).removeFalsies().flat().map(itemName => itemName.replace(/^minecraft:/, ""));
			itemsInTags.forEach(itemName => controlsMaterialList.addItem(itemName));
			controlItemTranslationKeys[control] = new Set();
			controlsMaterialList.export().forEach(({ translationKey, translatedName }) => {
				controlItemTranslationKeys[control].add(translationKey);
				translatedControlItems[translationKey] = translatedName;
			}); // these items will be renamed, and includes all the items in the tags specified. e.g. if "planks" is added as a tag for a control, then all plank types need to be renamed.
		});
		controlItemTranslations[language] = "";
		Object.entries(controlItemTranslationKeys).forEach(([control, itemTranslationKeys]) => {
			itemTranslationKeys.forEach(itemTranslationKey => {
				controlItemTranslations[language] += `\n${itemTranslationKey}=${translatedControlItems[itemTranslationKey]}\\n§u${translatedControlNames[control]}§r`; // don't question, it works
			});
		});
	});
	return { inGameControls, controlItemTranslations };
}
/**
 * Makes a blob for pack_icon.png based on a structure file's SHA256 hash
 * @param {File} structureFile
 * @returns {Promise<Blob>}
 */
async function makePackIcon(structureFile) {
	let fileHashBytes = [...await sha256(structureFile)]; // I feel like I should wrap the async expression in brackets...
	let fileHashBits = fileHashBytes.map(byte => [7, 6, 5, 4, 3, 2, 1, 0].map(bitI => byte >> bitI & 0x1)).flat();
	
	const ICON_RESOLUTION = [4, 6][fileHashBytes[1] % 2]; // either 4x4 or 6x6 large tiles
	const ICON_TILE_SIZE = 200 / ICON_RESOLUTION;
	const MORE_TILE_TYPES = false; // adds circles and crosses
	
	let can = new OffscreenCanvas(256, 256);
	// let can = document.createElement("canvas"); can.width = can.height = 256; document.body.appendChild(can);
	let ctx = can.getContext("2d");
	
	ctx.lineWidth = 8;
	ctx.lineCap = "round";
	
	let padding = (can.width - ICON_RESOLUTION * ICON_TILE_SIZE) / 2;
	let drawArc = (x, y, startAngle, endAngle) => {
		ctx.beginPath();
		ctx.arc(x * ICON_TILE_SIZE + padding, y * ICON_TILE_SIZE + padding, ICON_TILE_SIZE / 2, startAngle, endAngle);
		ctx.stroke();
	};
	let drawLine = (x, y, w, h) => {
		ctx.beginPath();
		ctx.moveTo(x * ICON_TILE_SIZE + padding, y * ICON_TILE_SIZE + padding);
		ctx.lineTo((x + w) * ICON_TILE_SIZE + padding, (y + h) * ICON_TILE_SIZE + padding);
		ctx.stroke();
	};
	
	// Truchet pattern
	for(let x = 0; x < ICON_RESOLUTION; x++) {
		for(let y = 0; y < ICON_RESOLUTION; y++) {
			let i = min(x, ICON_RESOLUTION - 1 - x) * ICON_RESOLUTION + y; // x is reflected
			i *= 4;
			let bit = fileHashBits[i];
			if(MORE_TILE_TYPES) {
				if(fileHashBits[i] && fileHashBits[i + 1] && fileHashBits[i + 2] && fileHashBits[i + 3]) {
					drawArc(x + 0.5, y + 0.5, 0, pi * 2);
					continue;
				}
				if(!fileHashBits[i] && !fileHashBits[i + 1] && !fileHashBits[i + 2] && !fileHashBits[i + 3]) {
					drawLine(x, y + 0.5, 1, 0);
					drawLine(x + 0.5, y, 0, 1);
					continue;
				}
			}
			if(bit == x >= ICON_RESOLUTION / 2) {
				drawArc(x, y, 0, pi / 2);
				drawArc(x + 1, y + 1, pi, pi * 3 / 2);
			} else {
				drawArc(x + 1, y, pi / 2, pi);
				drawArc(x, y + 1, pi * 3 / 2, pi * 2);
			}
		}
	}
	
	let hue = fileHashBytes[0] / 256 * 360;
	let grad = ctx.createRadialGradient(can.width / 2, can.height / 2, 0, can.width / 2, can.height / 2, ICON_RESOLUTION * ICON_TILE_SIZE / 2 * Math.SQRT2);
	grad.addColorStop(0, `hsl(${hue}deg, 70%, 50%)`);
	grad.addColorStop(1, `hsl(${hue + 20}deg, 60%, 60%)`);
	ctx.globalCompositeOperation = "source-in"; // draw only where the truchet is
	ctx.fillStyle = grad;
	ctx.fillRect(0, 0, can.width, can.height);
	
	ctx.globalCompositeOperation = "destination-over"; // draw the background underneath
	ctx.fillStyle = `hsl(${hue}deg, 40%, 85%)`;
	ctx.fillRect(0, 0, can.width, can.height);
	
	return await can.convertToBlob();
}
/**
 * Expands item criteria into an array of item names by expanding all item tags.
 * @param {ItemCriteria} itemCriteria
 * @param {Record<String, Array<String>>} itemTags
 * @returns {Array<String>}
 */
function expandItemCriteria(itemCriteria, itemTags) {
	let minecraftTags = itemCriteria["tags"].filter(tag => !tag.includes(":")); // we can't find which items are used in custom tags
	let namespacedItemsFromTags = minecraftTags.map(tag => itemTags[`minecraft:${tag}`]).flat().removeFalsies();
	return [...itemCriteria["names"], ...namespacedItemsFromTags.map(itemName => itemName.replace(/^minecraft:/, ""))];
}
/**
 * Converts an item filter into a Molang expression representation.
 * @param {ItemCriteria} itemCriteria
 * @returns {String}
 */
function itemCriteriaToMolang(itemCriteria, slot = "slot.weapon.mainhand") {
	let names = itemCriteria["names"].map(name => name.includes(":")? name : `minecraft:${name}`);
	let tags = itemCriteria["tags"].map(tag => tag.includes(":")? tag : `minecraft:${tag}`);
	let nameQuery = names.length > 0? `q.is_item_name_any('${slot}',${names.map(name => `'${name}'`).join(",")})` : undefined;
	let tagQuery = tags.length > 0? `q.equipped_item_any_tag('${slot}',${tags.map(tag => `'${tag}'`).join(",")})` : undefined;
	return [nameQuery, tagQuery].removeFalsies().join("||") || "false";
}
/**
 * Creates a Molang expression that mimics array access. Defaults to the last element if nothing is found.
 * @param {Array} array A continuous array
 * @param {String} indexVar
 * @returns {String}
 */
export function arrayToMolang(array, indexVar) {
	let arrayEntries = Object.entries(array); // to handle splitting, original indices need to be preserved, hence looking at index-value pairs
	return arrayEntriesToMolang(arrayEntries, indexVar);
}
function arrayEntriesToMolang(entries, indexVar) {
	const splittingThreshold = 50;
	if(entries.length > splittingThreshold) { // large arrays cause Molang stack overflows, so this splits them in half in such a situation.
		let middle = floor(entries.length / 2);
		return `${indexVar}<${entries[middle][0]}?(${arrayEntriesToMolang(entries.slice(0, middle), indexVar)}):(${arrayEntriesToMolang(entries.slice(middle), indexVar)})`;
	}
	return entries.map(([index, value], i) => i == entries.length - 1? value : `${i > 0? "(" : ""}${indexVar}==${index}?${value}:`).join("") + ")".repeat(max(entries.length - 2, 0));
}
/**
 * Creates a Molang expression that mimics 2D array access.
 * @param {Array<Array>} array
 * @param {String} indexVar1
 * @param {String} indexVar2
 * @returns {String}
 */
function array2DToMolang(array, indexVar1, indexVar2) {
	return arrayToMolang(array.map(subArray => `(${arrayToMolang(subArray, indexVar2)})`), indexVar1);
}
/**
 * Converts a function into minified Molang code. Variables can be referenced with $[...].
 * @param {Function} func
 * @param {Record<String, any>} [vars]
 * @returns {String} Molang code
 */
function functionToMolang(func, vars = {}) {
	let funcCode = func.toString();
	let minifiedFuncBody = funcCode.slice(funcCode.indexOf("{") + 1, funcCode.lastIndexOf("}")).replaceAll(/\/\/.+/g, "").replaceAll(/(?<!return)\s/g, "");
	// else if() {...} statements must be expanded to be else { if() {...} }
	let expandedElseIfCode = "";
	for(let i = 0; i < minifiedFuncBody.length; i++) {
		if(minifiedFuncBody.slice(i, i + 7) == "elseif(") {
			expandedElseIfCode += "else{if(";
			let inIfBlock = false;
			let braceCounter = 0;
			i += 6;
			let j = i;
			for(; braceCounter > 0 || !inIfBlock; j++) {
				if(minifiedFuncBody[j] == "{") {
					braceCounter++;
					inIfBlock = true;
				} else if(minifiedFuncBody[j] == "}") {
					braceCounter--;
				}
				if(braceCounter == 0 && inIfBlock && minifiedFuncBody.slice(j, j + 5) == "}else") {
					inIfBlock = false; // keep the final else clause included
				}
			}
			minifiedFuncBody = minifiedFuncBody.slice(0, j) + "}" + minifiedFuncBody.slice(j);
			continue;
		}
		expandedElseIfCode += minifiedFuncBody[i];
	}
	let mathedCode = expandedElseIfCode.replaceAll(`"`, `'`).replaceAll(/([\w\.]+)(\+|-){2};/g, "$1=$1$21;").replaceAll(/([\w\.]+)--;/g, "$1=$1-1;").replaceAll(/([\w\.\$\[\]]+)(\+|-|\*|\/|\?\?)=([^;]+);/g, "$1=$1$2$3;");
	
	// Yay more fun regular expressions, this time to work with variable substitution ($[...])
	let substituteInVariables = (code, vars) => code.replaceAll(/\$\[(\w+)(?:\[(\d+)\]|\.(\w+))?(?:(\+|-|\*|\/)(\d+))?\]/g, (match, varName, index, key, operator, operand) => {
		if(varName in vars) {
			let value = vars[varName];
			index ??= key;
			if(index != undefined) {
				if(index in value) {
					value = value[index];
				} else {
					throw new RangeError(`Index out of bounds: [${value.join(", ")}][${index}] does not exist`);
				}
			}
			switch(operator) {
				case "+": return +value + +operand; // must cast operands to numbers to avoid string concatenation
				case "-": return value - operand;
				case "*": return value * operand;
				case "/": return value / operand;
				default: return value;
			}
		} else {
			throw new ReferenceError(`Variable "${varName}" was not passed to function -> Molang converter!`);
		}
	});
	// I have no idea how to make this smaller. I really wish JS had a native AST conversion API
	let conditionedCode = "";
	let parenthesisCounter = 0;
	let inIfCondition = false;
	let needsExtraBracketAtEndOfIfCondition = false; // short variable names are for slow typers :)
	for(let i = 0; i < mathedCode.length; i++) {
		let char = mathedCode[i];
		if(mathedCode.slice(i, i + 3) == "if(") {
			inIfCondition = true;
			parenthesisCounter++;
			needsExtraBracketAtEndOfIfCondition = /^if\([^()]+\?\?/.test(mathedCode.slice(i)); // null coalescing operator is the only operator with lower precedence than the ternary conditional operator, so if a conditional expression in if() has ?? without any brackets around it, brackets are needed around the entire conditional expression
			if(needsExtraBracketAtEndOfIfCondition) {
				conditionedCode += "(";
			}
			i += 2;
			continue;
		} else if(mathedCode.slice(i, i + 4) == "else") {
			conditionedCode = conditionedCode.slice(0, -1) + ":"; // replace the ; with :
			i += 3;
			continue;
		} else if(/^for\([^)]+\)/.test(mathedCode.slice(i))) {
			let forStatement = substituteInVariables(mathedCode.slice(i).match(/^for\([^)]+\)/)[0], vars);
			let [, forVarName, initialValue, upperBound] = forStatement.match(/^for\(let(\w+)=(\d+);\w+<(\d+);\w+\+\+\)/);
			let forBlockStartI = mathedCode.slice(i).indexOf("{") + i;
			let forBlockEndI = forBlockStartI + 1;
			let braceCounter = 1;
			while(braceCounter > 0) {
				if(mathedCode[forBlockEndI] == "{") {
					braceCounter++;
				} else if(mathedCode[forBlockEndI] == "}") {
					braceCounter--;
				}
				forBlockEndI++;
			}
			let forBlockContent = mathedCode.slice(forBlockStartI + 1, forBlockEndI - 1);
			let expandedForCode = "";
			for(let forI = +initialValue; forI < upperBound; forI++) {
				expandedForCode += substituteInVariables(forBlockContent, {
					...vars,
					...{
						[forVarName]: forI
					}
				});
			}
			mathedCode = mathedCode.slice(0, i) + expandedForCode + mathedCode.slice(forBlockEndI);
			i--;
			continue;
		} else if(char == "(") {
			parenthesisCounter++;
		} else if(char == ")") {
			parenthesisCounter--;
			if(parenthesisCounter == 0 && inIfCondition) {
				inIfCondition = false;
				if(needsExtraBracketAtEndOfIfCondition) {
					conditionedCode += ")";
				}
				conditionedCode += "?";
				continue;
			}
		} else if(char == "}") {
			conditionedCode += "};";
			continue;
		}
		conditionedCode += char;
	}
	let variabledCode = substituteInVariables(conditionedCode, vars);
	return variabledCode;
}
/**
 * JSON.stringify(), but shortens numbers to at most 4 decimal places to avoid JS floating-point errors making stringified numbers long.
 * @param {*} value
 * @returns {String}
 */
function stringifyWithFixedDecimals(value) {
	const NUMBER_OF_DECIMALS = 4;
	return JSON.stringify(value, (key, x) => {
		if(typeof x == "number") {
			// let oldNumber = x;
			x = Number(x.toFixed(NUMBER_OF_DECIMALS));
			// if(abs(x - oldNumber) > 10 ** (-NUMBER_OF_DECIMALS - 1)) {
			// 	console.debug(`Turned long number ${oldNumber} into ${x} when stringifying JSON`);
			// }
		}
		return x;
	});
}

/**
 * An object for storing HoloPrint config options.
 * @typedef {Object} HoloPrintConfig
 * @property {Array<String>} IGNORED_BLOCKS
 * @property {Array<String>} IGNORED_MATERIAL_LIST_BLOCKS
 * @property {Number} SCALE
 * @property {Number} OPACITY
 * @property {Boolean} MULTIPLE_OPACITIES Whether to generate multiple opacity images and allow in-game switching, or have a constant opacity
 * @property {String} TINT_COLOR Hex RGB #xxxxxx
 * @property {Number} TINT_OPACITY 0-1
 * @property {Number} MINI_SCALE Size of ghost blocks when in the mini view for layers
 * @property {Number} TEXTURE_OUTLINE_WIDTH Measured in pixels, x ∈ [0, 1], x ∈ 2^ℝ
 * @property {String} TEXTURE_OUTLINE_COLOR A colour string
 * @property {Number} TEXTURE_OUTLINE_OPACITY 0-1
 * @property {Boolean} SPAWN_ANIMATION_ENABLED
 * @property {Number} SPAWN_ANIMATION_LENGTH Length of each individual block's spawn animation (seconds)
 * @property {Boolean} PLAYER_CONTROLS_ENABLED
 * @property {HoloPrintControlsConfig} CONTROLS
 * @property {Boolean} MATERIAL_LIST_ENABLED
 * @property {Boolean} RETEXTURE_CONTROL_ITEMS
 * @property {Number} CONTROL_ITEM_TEXTURE_SCALE How much to scale control item overlay textures. When compositing textures, MCBE scales all textures to the maximum, so the size of the overlay control texture has to be the LCM of itself and in-game items. Hence, if in-game items have a higher resolution than expected, they will probably be scaled wrong. The solution is to scale the overlay textures even more, which can be adjusted with this.
 * @property {Boolean} RENAME_CONTROL_ITEMS
 * @property {Array<Number>} WRONG_BLOCK_OVERLAY_COLOR Clamped colour quartet
 * @property {Vec3} INITIAL_OFFSET
 * @property {Number} BACKUP_SLOT_COUNT
 * @property {String|undefined} PACK_NAME The name of the completed pack; will default to the structure file names
 * @property {Blob} PACK_ICON_BLOB Blob for `pack_icon.png`
 * @property {Array<String>} AUTHORS
 * @property {String|undefined} DESCRIPTION
 * @property {Number} COMPRESSION_LEVEL
 * @property {Number} PREVIEW_BLOCK_LIMIT The maximum number of blocks a structure can have for rendering a preview
 * @property {Boolean} SHOW_PREVIEW_SKYBOX
 */
/**
 * Controls which items are used for in-game controls.
 * @typedef {Object} HoloPrintControlsConfig
 * @property {ItemCriteria} TOGGLE_RENDERING
 * @property {ItemCriteria} CHANGE_OPACITY
 * @property {ItemCriteria} TOGGLE_TINT
 * @property {ItemCriteria} TOGGLE_VALIDATING
 * @property {ItemCriteria} CHANGE_LAYER Both for players and armour stands
 * @property {ItemCriteria} DECREASE_LAYER
 * @property {ItemCriteria} CHANGE_LAYER_MODE Single layer or all layers below
 * @property {ItemCriteria} MOVE_HOLOGRAM
 * @property {ItemCriteria} ROTATE_HOLOGRAM
 * @property {ItemCriteria} CHANGE_STRUCTURE For players only
 * @property {ItemCriteria} DISABLE_PLAYER_CONTROLS
 * @property {ItemCriteria} BACKUP_HOLOGRAM Force armour stands to try and backup the hologram state for 30s.
 */
/**
 * Stores item names and tags for checking items. Leaving everything empty will check for nothing being held.
 * @typedef {Object} ItemCriteria
 * @property {Array<String>} names Item names the matching item could have. The `minecraft:` namespace will be used if no namespace is specified.
 * @property {Array<String>} tags Item tags the matching item could have. The `minecraft:` namespace will be used if no namespace is specified.
 */
/**
 * A block as stored in NBT.
 * @typedef {Object} NBTBlock
 * @property {String} name The block's ID
 * @property {Record<String, Number|String>} states Block states
 * @property {Number} version
 */
/**
 * A block palette entry, similar to how it appears in the NBT, as used in HoloPrint.
 * @typedef {Object} Block
 * @property {String} name The block's ID
 * @property {Record<String, Number|String>} [states] Block states
 * @property {Object} [block_entity_data] Block entity data
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
/**
 * A texture reference, made in BlockGeoMaker.js and turned into a texture in TextureAtlas.js.
 * @typedef {Object} TextureReference
 * @property {Vec2} uv UV coordinates
 * @property {Vec2} uv_size	UV size
 * @property {String} block_name Block ID to get the texture from
 * @property {String} texture_face Which face's texture to use
 * @property {Number} variant Which terrain_texture.json variant to use
 * @property {Boolean} croppable If a texture can be cropped automatically
 * @property {String} [texture_path_override] An overriding texture file path to look at
 * @property {String} [terrain_texture_override] A terrain texture key override; will override block_name and texture_face
 * @property {Vec3} [tint] A tint override
 */
/**
 * An unresolved texture fragment containing an image path, tint, and UV position and size.
 * @typedef {Object} TextureFragment
 * @property {String} texturePath
 * @property {Vec3} [tint]
 * @property {Boolean} [tint_like_png]
 * @property {Number} opacity
 * @property {Vec2} uv
 * @property {Vec2} uv_size
 * @property {Boolean} croppable If a texture can be cropped automatically
 */
/**
 * An image fragment containing an image, UV position, and UV size.
 * @typedef {Object} ImageFragment
 * @property {Image} image
 * @property {Number} w Width
 * @property {Number} h Height
 * @property {Number} sourceX
 * @property {Number} sourceY
 * @property {{ x: Number, y: Number, w: Number, h: Number }} crop
 */
/**
 * An entry in a material list.
 * @typedef {Object} MaterialListEntry
 * @property {String} itemName
 * @property {String} translationKey
 * @property {String} translatedName
 * @property {Number} count How many of this item is required
 * @property {String} partitionedCount A formatted string representing partitions of the total count
 * @property {Number|undefined} auxId The item's aux ID
 */
/**
 * @typedef {Object} TypedBlockStateProperty
 * @property {Number} [int] - An integer property.
 * @property {String} [string] - A string property.
 * @property {Number} [byte] - A byte property.
 */
/**
 * @typedef {Object} BlockUpdateSchemaFlattenRule
 * @property {String} prefix - The prefix for the flattened property.
 * @property {String} flattenedProperty - The name of the flattened property.
 * @property {"int"|"string"|"byte"} [flattenedPropertyType] - The type of the flattened property.
 * @property {String} suffix - The suffix for the flattened property.
 * @property {Record<String, String>} [flattenedValueRemaps] - A mapping of flattened values.
 */
/**
 * @typedef {Object} BlockUpdateSchemaRemappedState
 * @property {Record<String, TypedBlockStateProperty>|null} oldState - The property values before the remapping.
 * @property {String} [newName] - An optional new name for the block.
 * @property {BlockUpdateSchemaFlattenRule} [newFlattenedName] - An optional flattened property rule providing a new name.
 * @property {Record<String, TypedBlockStateProperty>|null} newState - The new property values after the remapping.
 * @property {Array<String>} [copiedState] - Optional list of property names to copy from the old state.
 */

/**
 * @typedef {Object} BlockUpdateSchemaSkeleton
 * @property {String} filename
 * @property {Number} maxVersionMajor - The major version (must be >= 0).
 * @property {Number} maxVersionMinor - The minor version (must be >= 0).
 * @property {Number} maxVersionPatch - The patch version (must be >= 0).
 * @property {Number} maxVersionRevision - The revision version (must be >= 0).
 */
/**
 * @typedef {Object} BlockUpdateSchema
 * @property {Number} maxVersionMajor - The major version (must be >= 0).
 * @property {Number} maxVersionMinor - The minor version (must be >= 0).
 * @property {Number} maxVersionPatch - The patch version (must be >= 0).
 * @property {Number} maxVersionRevision - The revision version (must be >= 0).
 * @property {Record<String, String>} [renamedIds] - Mapping of renamed IDs.
 * @property {Record<String, Record<String, TypedBlockStateProperty>>} [addedProperties] - Mapping of added properties.
 * @property {Record<String, Record<String, String>>} [renamedProperties] - Mapping of renamed properties.
 * @property {Record<String, Array<String>>} [removedProperties] - Mapping of removed properties.
 * @property {Record<String, Record<String, String>>} [remappedPropertyValues] - Mapping of remapped property values.
 * @property {Record<String, Array<{ old: TypedBlockStateProperty, new: TypedBlockStateProperty }>>} [remappedPropertyValuesIndex] - Index of remapped property values.
 * @property {Record<String, BlockUpdateSchemaFlattenRule>} [flattenedProperties] - Mapping of flattened properties.
 * @property {Record<String, Array<BlockUpdateSchemaRemappedState>>} [remappedStates] - Mapping of remapped states.
 */
/**
 * 2D vector.
 * @typedef {[Number, Number]} Vec2
 */
/**
 * 3D vector.
 * @typedef {[Number, Number, Number]} Vec3
 */