import * as NBT from "https://esm.run/nbtify@2.0.0";
import JSZip from "https://esm.run/jszip@3.10.1";

import BlockGeoMaker from "./BlockGeoMaker.js";
import TextureAtlas from "./TextureAtlas.js";
import MaterialList from "./MaterialList.js";
import PreviewRenderer from "./PreviewRenderer.js";

import { awaitAllEntries, concatenateFiles, JSONMap, JSONSet, max, min, pi, sha256 } from "./essential.js";
import ResourcePackStack from "./ResourcePackStack.js";

export const IGNORED_BLOCKS = ["air", "piston_arm_collision", "sticky_piston_arm_collision"]; // blocks to be ignored when scanning the structure file
export const IGNORED_MATERIAL_LIST_BLOCKS = ["bubble_column"]; // blocks that will always be hidden on the material list
const IGNORED_BLOCK_ENTITIES = ["Beacon", "Beehive", "Bell", "BrewingStand", "ChiseledBookshelf", "CommandBlock", "Comparator", "Conduit", "EnchantTable", "EndGateway", "JigsawBlock", "Lodestone", "SculkCatalyst", "SculkShrieker", "SculkSensor", "CalibratedSculkSensor", "StructureBlock", "BrushableBlock", "TrialSpawner", "Vault"];

/**
 * Makes a HoloPrint resource pack from a structure file.
 * @param {File|Array<File>} structureFiles Either a singular structure file (`*.mcstructure`), or an array of structure files
 * @param {HoloPrintConfig} [config]
 * @param {ResourcePackStack} [resourcePackStack]
 * @param {HTMLElement} [previewCont]
 * @returns {Promise<File>} Resource pack (`*.mcpack`)
 */
export async function makePack(structureFiles, config = {}, resourcePackStack, previewCont) {
	if(!resourcePackStack) {
		console.debug("Waiting for resource pack stack initialisation...");
		resourcePackStack = await new ResourcePackStack()
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
			singleWhitePixelTexture: "textures/particle/single_white_pixel.png",
			hudScreenUI: "ui/hud_screen.json",
		},
		resources: {
			entityFile: "entity/armor_stand.entity.json",
			defaultPlayerRenderControllers: "render_controllers/player.render_controllers.json",
			armorStandGeo: "models/entity/armor_stand.geo.json", // for visible bounds. I don't think we need this
			translationFile: `texts/${config.MATERIAL_LIST_LANGUAGE}.lang`
		},
		otherFiles: {
			packIcon: config.PACK_ICON_BLOB ?? makePackIcon(concatenateFiles(structureFiles)),
		},
		data: { // these will not be put into the pack
			blockMetadata: "metadata/vanilladata_modules/mojang-blocks.json",
			itemMetadata: "metadata/vanilladata_modules/mojang-items.json"
		}
	}, resourcePackStack);
	let { manifest, packIcon, entityFile, hologramRenderControllers, defaultPlayerRenderControllers, hologramGeo, armorStandGeo, hologramMaterial, hologramAnimationControllers, hologramAnimations, boundingBoxOutlineParticle, blockValidationParticle, singleWhitePixelTexture, hudScreenUI, translationFile } = loadedStuff.files;
	let { blockMetadata, itemMetadata } = loadedStuff.data;
	
	let structures = nbts.map(nbt => nbt["structure"]);
	
	let palettesAndIndices = structures.map(structure => tweakBlockPalette(structure, config.IGNORED_BLOCKS));
	let { palette: blockPalette, indices: allStructureIndicesByLayer } = mergeMultiplePalettesAndIndices(palettesAndIndices);
	console.log("combined palette: ", blockPalette);
	console.log("remapped indices: ", allStructureIndicesByLayer);
	window.blockPalette = blockPalette;
	window.blockIndices = allStructureIndicesByLayer;
	
	let blockGeoMaker = await new BlockGeoMaker(config);
	// makeBoneTemplate() is an impure function and adds texture references to the textureRefs set property.
	let boneTemplatePalette = blockPalette.map(block => blockGeoMaker.makeBoneTemplate(block));
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
						cube["origin"][2] += cube["size"][2] * (face["flip_vertically"]? cropYRem: crop["y"]);
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
	
	// I have no idea if these visible bounds actually influence anything...
	let visibleBoundsWidth = 16 * max(...structureSizes.map(structureSize => max(structureSize[0], structureSize[2])));
	let visibleBoundsHeight = 16 * max(...structureSizes.map(structureSize => structureSize[1]));
	armorStandGeo["minecraft:geometry"][0]["description"]["visible_bounds_width"] = visibleBoundsWidth;
	armorStandGeo["minecraft:geometry"][0]["description"]["visible_bounds_height"] = visibleBoundsHeight;
	let structureGeoTemplate = hologramGeo["minecraft:geometry"][0];
	hologramGeo["minecraft:geometry"].splice(0, 1);
	structureGeoTemplate["description"]["visible_bounds_width"] = visibleBoundsWidth;
	structureGeoTemplate["description"]["visible_bounds_height"] = visibleBoundsHeight;
	
	structureGeoTemplate["description"]["texture_width"] = textureAtlas.atlasWidth;
	structureGeoTemplate["description"]["texture_height"] = textureAtlas.atlasHeight;
	
	let structureWMolang = arrayToMolang(structureSizes.map(structureSize => structureSize[0]), "v.structure_index");
	let structureHMolang = arrayToMolang(structureSizes.map(structureSize => structureSize[1]), "v.structure_index");
	let structureDMolang = arrayToMolang(structureSizes.map(structureSize => structureSize[2]), "v.structure_index");
	let makeHologramSpawnAnimation;
	if(config.DO_SPAWN_ANIMATION) {
		let totalAnimationLength = 0;
		makeHologramSpawnAnimation = (x, y, z, structureSize) => {
			let delay = config.SPAWN_ANIMATION_LENGTH * 0.25 * (structureSize[0] - x + y + structureSize[2] - z + Math.random() * 2) + 0.05;
			delay = Number(delay.toFixed(2));
			let animationEnd = Number((delay + config.SPAWN_ANIMATION_LENGTH).toFixed(2));
			totalAnimationLength = max(totalAnimationLength, animationEnd);
			hologramAnimations["animations"]["animation.armor_stand.hologram.spawn"]["animation_length"] = totalAnimationLength;
			return {
				"scale": `q.anim_time <= ${delay}? 0 : (q.anim_time >= ${animationEnd}? 1 : (1 - math.pow(1 - (q.anim_time - ${delay}) / ${config.SPAWN_ANIMATION_LENGTH}, 3)))`.replaceAll(" ", "")
			};
		};
	} else {
		// Totally empty animation
		delete hologramAnimations["animations"]["animation.armor_stand.hologram.spawn"]["loop"];
		delete hologramAnimations["animations"]["animation.armor_stand.hologram.spawn"]["bones"];
	}
	
	let layerAnimationStates = hologramAnimationControllers["animation_controllers"]["controller.animation.armor_stand.hologram.layers"]["states"];
	let topLayer = max(...structureSizes.map(structureSize => structureSize[1])) - 1;
	layerAnimationStates["default"]["transitions"].push(
		{
			"l_0": `v.hologram_layer > -1 && v.hologram_layer != ${topLayer}`
		},
		{
			[`l_${topLayer}`]: `v.hologram_layer == ${topLayer}`
		}
	);
	let entityDescription = entityFile["minecraft:client_entity"]["description"];
	
	let totalBlocksToValidateByStructure = [];
	let uniqueBlocksToValidate = new Set();
	
	let materialList = new MaterialList(blockMetadata, itemMetadata, translationFile);
	allStructureIndicesByLayer.forEach((structureIndicesByLayer, structureI) => {
		let structureSize = structureSizes[structureI];
		let geoShortName = `hologram_${structureI}`;
		let geoIdentifier = `geometry.armor_stand.hologram_${structureI}`;
		let geo = structuredClone(structureGeoTemplate);
		geo["description"]["identifier"] = geoIdentifier;
		entityDescription["geometry"][geoShortName] = geoIdentifier;
		hologramRenderControllers["render_controllers"]["controller.render.armor_stand.hologram"]["arrays"]["geometries"]["Array.geometries"].push(`Geometry.${geoShortName}`);
		let blocksToValidate = [];
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
						[y == 0? "default" : `l_${y - 1}`]: `v.hologram_layer < ${y}${y == topLayer? " && v.hologram_layer != -1" : ""}`
					},
					(y == topLayer? {
						"default": "v.hologram_layer == -1"
					} : {
						[`l_${y + 1}`]: `v.hologram_layer > ${y}`
					})
				]
			};
			hologramAnimations["animations"][`animation.armor_stand.hologram.l_${y}`] ??= {};
			let layerAnimation = hologramAnimations["animations"][`animation.armor_stand.hologram.l_${y}`];
			layerAnimation["loop"] = "hold_on_last_frame";
			layerAnimation["bones"] ??= {};
			for(let otherLayerY = 0; otherLayerY < structureSize[1]; otherLayerY++) {
				if(otherLayerY == y || config.LAYER_MODE == "all_below" && otherLayerY < y) {
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
			
			for(let x = 0; x < structureSize[0]; x++) {
				for(let z = 0; z < structureSize[2]; z++) {
					let blockI = (x * structureSize[1] + y) * structureSize[2] + z;
					let firstBoneForThisBlock = true;
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
						
						let boneName = `b_${x}_${y}_${z}`;
						if(!firstBoneForThisBlock) {
							boneName += `_${layerI}`;
						}
						let bonePos = [-16 * x - 8, 16 * y, 16 * z - 8]; // I got these values from trial and error with blockbench (which makes the x negative I think. it's weird.)
						let positionedBoneTemplate = blockGeoMaker.positionBoneTemplate(boneTemplate, bonePos);
						let bonesToAdd = [{
							"name": boneName,
							"parent": layerName,
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
						
						if(firstBoneForThisBlock) { // we only need 1 locator for each block position, even though there may be 2 bones in this position because of the 2nd layer
							hologramGeo["minecraft:geometry"][2]["bones"][1]["locators"][boneName] ??= bonePos.map(x => x + 8);
						}
						if(config.DO_SPAWN_ANIMATION) {
							hologramAnimations["animations"]["animation.armor_stand.hologram.spawn"]["bones"][boneName] = makeHologramSpawnAnimation(x, y, z, structureSize);
						}
						
						let blockName = blockPalette[paletteI]["name"];
						if(!config.IGNORED_MATERIAL_LIST_BLOCKS.includes(blockName)) {
							materialList.add(blockName);
						}
						if(layerI == 0) { // particle_expire_if_in_blocks only works on the first layer :(
							blocksToValidate.push({
								"bone_name": boneName,
								"block": blockName,
								"pos": [x, y, z]
							});
							uniqueBlocksToValidate.add(blockName);
						}
						firstBoneForThisBlock = false;
					});
				}
			}
		}
		hologramGeo["minecraft:geometry"].push(geo);
		
		addBoundingBoxParticles(hologramAnimationControllers, structureI, structureSize);
		addBlockValidationParticles(hologramAnimationControllers, structureI, blocksToValidate);
		totalBlocksToValidateByStructure.push(blocksToValidate.length);
	});
	
	entityDescription["materials"]["hologram"] = "holoprint_hologram";
	entityDescription["materials"]["hologram.wrong_block_overlay"] = "holoprint_hologram.wrong_block_overlay";
	entityDescription["textures"]["hologram.overlay"] = "textures/entity/overlay";
	entityDescription["animations"]["hologram.align"] = "animation.armor_stand.hologram.align";
	entityDescription["animations"]["hologram.offset"] = "animation.armor_stand.hologram.offset";
	entityDescription["animations"]["hologram.spawn"] = "animation.armor_stand.hologram.spawn";
	entityDescription["animations"]["hologram.wrong_block_overlay"] = "animation.armor_stand.hologram.wrong_block_overlay";
	entityDescription["animations"]["controller.hologram.layers"] = "controller.animation.armor_stand.hologram.layers";
	entityDescription["animations"]["controller.hologram.bounding_box"] = "controller.animation.armor_stand.hologram.bounding_box";
	entityDescription["animations"]["controller.hologram.block_validation"] = "controller.animation.armor_stand.hologram.block_validation";
	entityDescription["scripts"]["animate"] ??= [];
	entityDescription["scripts"]["animate"].push("hologram.align", "hologram.offset", "hologram.spawn", "hologram.wrong_block_overlay", "controller.hologram.layers", "controller.hologram.bounding_box", "controller.hologram.block_validation");
	entityDescription["scripts"]["initialize"] ??= [];
	entityDescription["scripts"]["initialize"].push(functionToMolang((v, structureSize, structureCount) => {
		v.hologram_offset_x = 0;
		v.hologram_offset_y = 0;
		v.hologram_offset_z = 0;
		v.structure_w = $[structureSize[0]];
		v.structure_h = $[structureSize[1]];
		v.structure_d = $[structureSize[2]];
		v.render_hologram = true;
		v.hologram_texture_index = $[defaultTextureIndex];
		v.hologram_layer = -1;
		v.validate_hologram = false;
		v.show_wrong_block_overlay = false;
		v.wrong_blocks = -1;
		v.wrong_block_x = 0;
		v.wrong_block_y = 0;
		v.wrong_block_z = 0;
		
		v.structure_index = 0;
		v.structure_count = $[structureCount];
		
		// v.last_held_item = q.get_equipped_item_name ?? "";
		v.last_held_item = "";
		v.last_hurt_direction = 1;
		// v.player_action_counter = t.player_action_counter ?? 0;
		v.player_action_counter = 0;
	}, { structureSize: structureSizes[0], defaultTextureIndex, structureCount: structureFiles.length }));
	entityDescription["scripts"]["pre_animation"] ??= [];
	entityDescription["scripts"]["pre_animation"].push(functionToMolang((v, q, t, textureBlobsCount, totalBlocksToValidate) => {
		v.hologram_dir = Math.floor(q.body_y_rotation / 90) + 2; // [south, west, north, east] (since it goes from -180 to 180)
		
		t.process_action = false; // this is the only place I'm using temp variables for their intended purpose
		t.action = "";
		t.check_layer_validity = false;
		t.changed_structure = false;
		if(v.last_held_item != q.get_equipped_item_name) {
			v.last_held_item = q.get_equipped_item_name;
			t.process_action = true;
		}
		if(v.last_hurt_direction != q.hurt_direction) { // hitting the armour stand changes this: https://wiki.bedrock.dev/entities/non-mob-runtime-identifiers.html#notable-queries-3
			v.last_hurt_direction = q.hurt_direction;
			t.process_action = true;
			if(!q.is_item_equipped) { // change structure on hit when holding nothing
				t.action = "next_structure";
			}
		}
		
		v.last_pose ??= v.armor_stand.pose_index;
		if(v.last_pose != v.armor_stand.pose_index) {
			v.last_pose = v.armor_stand.pose_index;
			if(v.render_hologram) {
				t.action = "increase_layer";
			}
		}
		
		if(t.process_action) {
			if(q.is_item_name_any("slot.weapon.mainhand", "minecraft:stone")) {
				t.action = "toggle_rendering";
			} else if(q.is_item_name_any("slot.weapon.mainhand", "minecraft:glass")) {
				t.action = "increase_opacity";
			} else if(q.is_item_name_any("slot.weapon.mainhand", "minecraft:iron_ingot")) {
				t.action = "toggle_validating";
			} else if(q.equipped_item_any_tag("slot.weapon.mainhand", "minecraft:planks")) {
				t.action = "increase_layer";
			} else if(q.equipped_item_any_tag("slot.weapon.mainhand", "minecraft:logs")) {
				t.action = "decrease_layer";
			} else if(q.is_item_name_any("slot.weapon.mainhand", "minecraft:white_wool")) { // Movement controls (I hate that I'm having to do this)
				t.action = "move_y-";
			} else if(q.is_item_name_any("slot.weapon.mainhand", "minecraft:red_wool")) {
				t.action = "move_y+";
			} else if(q.is_item_name_any("slot.weapon.mainhand", "minecraft:orange_wool")) {
				t.action = "move_z-";
			} else if(q.is_item_name_any("slot.weapon.mainhand", "minecraft:yellow_wool")) {
				t.action = "move_z+";
			} else if(q.is_item_name_any("slot.weapon.mainhand", "minecraft:lime_wool")) {
				t.action = "move_x+";
			} else if(q.is_item_name_any("slot.weapon.mainhand", "minecraft:light_blue_wool")) {
				t.action = "move_x-";
			}
		}
		t.player_action_counter ??= 0;
		if(v.player_action_counter != t.player_action_counter && t.player_action_counter > 0 && t.player_action != "") {
			v.player_action_counter = t.player_action_counter;
			if(!q.is_item_name_any("slot.weapon.mainhand", "minecraft:bone")) {
				t.action = t.player_action;
			}
		}
		if(t.action != "") {
			if(t.action == "toggle_rendering") {
				v.render_hologram = !v.render_hologram;
			} else if(t.action == "toggle_validating") {
				v.validate_hologram = !v.validate_hologram;
				if(v.validate_hologram) {
					v.wrong_blocks = $[totalBlocksToValidate];
					t.wrong_blocks = $[totalBlocksToValidate];
				} else {
					v.show_wrong_block_overlay = false;
				}
			} else if(v.render_hologram) { // opacity, layer, movement, and structure controls require the hologram to be visible, otherwise it could be confusing if you accidentally change something when it's invisible
				if(t.action == "increase_opacity") {
					v.hologram_texture_index++;
					if(v.hologram_texture_index >= $[textureBlobsCount]) {
						v.hologram_texture_index = 0;
					}
				} else if(t.action == "decrease_opacity") {
					v.hologram_texture_index--;
					if(v.hologram_texture_index < 0) {
						v.hologram_texture_index = $[textureBlobsCount - 1];
					}
				} else if(t.action == "increase_layer") {
					v.hologram_layer++;
					t.check_layer_validity = true;
				} else if(t.action == "decrease_layer") {
					v.hologram_layer--;
					t.check_layer_validity = true;
				} else if(t.action == "move_x-") {
					v.hologram_offset_x--;
				} else if(t.action == "move_x+") {
					v.hologram_offset_x++;
				} else if(t.action == "move_y-") {
					v.hologram_offset_y--;
				} else if(t.action == "move_y+") {
					v.hologram_offset_y++;
				} else if(t.action == "move_z-") {
					v.hologram_offset_z--;
				} else if(t.action == "move_z+") {
					v.hologram_offset_z++;
				} else if(t.action == "next_structure" && v.structure_count > 1) {
					v.structure_index++;
					t.changed_structure = true;
				} else if(t.action == "previous_structure" && v.structure_count > 1) {
					v.structure_index--;
					t.changed_structure = true;
				}
			}
		}
		
		if(t.check_layer_validity) {
			if(v.hologram_layer < -1) {
				v.hologram_layer = v.structure_h - 1;
			}
			if(v.hologram_layer >= v.structure_h) {
				v.hologram_layer = -1;
			}
		}
		if(t.changed_structure) {
			if(v.structure_index < 0) {
				v.structure_index = v.structure_count - 1;
			}
			if(v.structure_index >= v.structure_count) {
				v.structure_index = 0;
			}
			v.structure_w = $[structureWMolang];
			v.structure_h = $[structureHMolang];
			v.structure_d = $[structureDMolang];
			v.hologram_layer = -1;
			v.validate_hologram = false;
			v.show_wrong_block_overlay = false;
		}
		
		if(v.validate_hologram) {
			// block validation particles rely on temp variables. this code checks if the temp variables are defined; if they are, it updates the internal state; if not, it sets the temp variables to its internal state.
			if((t.wrong_blocks ?? -1) == -1) {
				t.wrong_blocks = v.wrong_blocks;
			} else {
				v.wrong_blocks = t.wrong_blocks;
			}
			if((t.show_wrong_block_overlay ?? -1) == -1) {
				t.show_wrong_block_overlay = v.show_wrong_block_overlay;
			} else {
				v.show_wrong_block_overlay = t.show_wrong_block_overlay;
			}
			if((t.wrong_block_x ?? -1) == -1) {
				t.wrong_block_x = v.wrong_block_x;
			} else {
				v.wrong_block_x = t.wrong_block_x;
			}
			if((t.wrong_block_y ?? -1) == -1) {
				t.wrong_block_y = v.wrong_block_y;
			} else {
				v.wrong_block_y = t.wrong_block_y;
			}
			if((t.wrong_block_z ?? -1) == -1) {
				t.wrong_block_z = v.wrong_block_z;
			} else {
				v.wrong_block_z = t.wrong_block_z;
			}
		}
	}, { textureBlobsCount: textureBlobs.length, totalBlocksToValidate: arrayToMolang(totalBlocksToValidateByStructure, "v.structure_index"), structureWMolang, structureHMolang, structureDMolang }));
	entityDescription["geometry"]["hologram.wrong_block_overlay"] = "geometry.armor_stand.hologram.wrong_block_overlay";
	entityDescription["geometry"]["hologram.valid_structure_overlay"] = "geometry.armor_stand.hologram.valid_structure_overlay";
	entityDescription["geometry"]["hologram.particle_alignment"] = "geometry.armor_stand.hologram.particle_alignment";
	entityDescription["render_controllers"] ??= [];
	entityDescription["render_controllers"].push({
		"controller.render.armor_stand.hologram": "v.render_hologram"
	}, {
		"controller.render.armor_stand.hologram.wrong_block_overlay": "v.show_wrong_block_overlay"
	}, {
		"controller.render.armor_stand.hologram.valid_structure_overlay": "v.validate_hologram && v.wrong_blocks == 0"
	}, "controller.render.armor_stand.hologram.particle_alignment");
	entityDescription["particle_effects"] ??= {};
	entityDescription["particle_effects"]["bounding_box_outline"] = "holoprint:bounding_box_outline";
	
	textureBlobs.forEach(([textureName]) => {
		entityDescription["textures"][textureName] = `textures/entity/${textureName}`;
		hologramRenderControllers["render_controllers"]["controller.render.armor_stand.hologram"]["arrays"]["textures"]["Array.textures"].push(`Texture.${textureName}`);
	});
	hologramRenderControllers["render_controllers"]["controller.render.armor_stand.hologram"]["textures"][0] = `Array.textures[v.hologram_texture_index ?? ${defaultTextureIndex}]`;
	
	if(config.TINT != undefined) {
		// By putting the overlay in the render controller instead of modifying the texture, the overlay isn't applied on transparent pixels. It also saves us the work of having to manipulate the image data directly :)
		hologramRenderControllers["render_controllers"]["controller.render.armor_stand.hologram"]["overlay_color"] = {
			"r": config.TINT[0],
			"g": config.TINT[1],
			"b": config.TINT[2],
			"a": config.TINT[3]
		};
	}
	
	let overlayTexture = await singleWhitePixelTexture.setOpacity(config.WRONG_BLOCK_OVERLAY_COLOR[3]);
	
	let totalBlocks = materialList.totalMaterialCount;
	
	// add the particles' short names, and then reference them in the animation controller
	uniqueBlocksToValidate.forEach(blockName => {
		let particleName = `validate_${blockName}`;
		entityDescription["particle_effects"][particleName] = `holoprint:${particleName}`;
	});
	
	// Add player controls. These are done entirely in the render controller so custom skins aren't disabled.
	let initVariables = functionToMolang(v => {
		v.player_action_counter ??= 0;
		v.last_player_action_time ??= 0;
		v.player_action ??= "";
		v.new_action = ""; // If we want to set a new player action, we put it here first so we can update the counter and record the time.
		
		v.last_attack_time ??= 0;
		v.attack = v.attack_time > 0 && (v.last_attack_time == 0 || v.attack_time < v.last_attack_time);
		v.last_attack_time = v.attack_time;
	});
	let renderingControls = functionToMolang((q, v) => {
		if(v.attack) {
			if(q.is_item_name_any("slot.weapon.mainhand", "minecraft:stone")) {
				v.new_action = "toggle_rendering";
			} else if(q.is_item_name_any("slot.weapon.mainhand", "minecraft:glass")) {
				if(q.is_sneaking) {
					v.new_action = "decrease_opacity";
				} else {
					v.new_action = "increase_opacity";
				}
			} else if(q.is_item_name_any("slot.weapon.mainhand", "minecraft:iron_ingot")) {
				v.new_action = "toggle_validating";
			} else if(q.equipped_item_any_tag("slot.weapon.mainhand", "minecraft:planks")) {
				if(q.is_sneaking) {
					v.new_action = "decrease_layer";
				} else {
					v.new_action = "increase_layer";
				}
			} else if(q.is_item_name_any("slot.weapon.mainhand", "minecraft:arrow")) {
				if(q.is_sneaking) {
					v.new_action = "previous_structure";
				} else {
					v.new_action = "next_structure";
				}
			}
		}
	});
	let movementControls = functionToMolang((q, v) => {
		if(v.attack && q.is_item_name_any("slot.weapon.mainhand", "minecraft:stick")) {
			if(q.cardinal_player_facing == 0) { // this query unfortunately doesn't work in armour stands
				v.new_action = "move_y-";
			} else if(q.cardinal_player_facing == 1) {
				v.new_action = "move_y+";
			} else if(q.cardinal_player_facing == 2) {
				v.new_action = "move_z-";
			} else if(q.cardinal_player_facing == 3) {
				v.new_action = "move_z+";
			} else if(q.cardinal_player_facing == 4) {
				v.new_action = "move_x+";
			} else if(q.cardinal_player_facing == 5) {
				v.new_action = "move_x-";
			}
		}
	});
	let broadcastActions = functionToMolang((v, t, q) => {
		if(v.new_action != "") {
			v.player_action = v.new_action;
			v.new_action = "";
			v.player_action_counter++;
			v.last_player_action_time = q.time_stamp;
		}
		if(q.time_stamp - v.last_player_action_time > 40) { // broadcast nothing after 2 seconds. this is so, if the player does an action a minute ago and it doesn't do anything, the armour stands don't suddenly update
			v.player_action = "";
		}
		t.player_action = v.player_action;
		t.player_action_counter = v.player_action_counter;
	});
	let playerRenderControllers = patchRenderControllers(defaultPlayerRenderControllers, {
		"controller.render.player.first_person": functionToMolang((q, v) => {
			if(!q.is_in_ui && !v.map_face_icon) {
				$[initVariables]
				$[renderingControls]
				$[broadcastActions]
			}
		}, { initVariables, renderingControls, broadcastActions }),
		"controller.render.player.third_person": functionToMolang(q => {
			if(!q.is_in_ui) {
				$[initVariables]
				$[renderingControls]
				$[movementControls] // in first person, since the player entity is always at the front of the screen, it's always facing south so movement controls only work in third person
				$[broadcastActions]
			}
		}, { initVariables, renderingControls, movementControls, broadcastActions })
	});
	
	console.log("Block counts map:", materialList.materials);
	
	let finalisedMaterialList = materialList.export();
	console.log("Finalised material list:", finalisedMaterialList);
	
	// console.log(partitionedBlockCounts);
	let missingItemAux = blockMetadata["data_items"].find(block => block.name == "minecraft:reserved6")["raw_id"];
	hudScreenUI["material_list_entries"]["controls"].push(...finalisedMaterialList.map(({ translationKey, partitionedCount, auxId }, i) => ({
		[`material_list_${i}@hud.material_list_entry`]: {
			"$item_translation_key": translationKey,
			"$item_count": partitionedCount,
			"$item_id_aux": auxId ?? missingItemAux,
			"$background_opacity": i % 2 * 0.2
		}
	})));
	hudScreenUI["material_list"]["size"][1] = finalisedMaterialList.length * 12 + 12; // 12px for each item + 12px for the heading
	hudScreenUI["material_list_heading"]["controls"][1]["pack_name"]["text"] += packName;
	
	manifest["header"]["name"] = packName;
	manifest["header"]["description"] = `§u★HoloPrint§r resource pack generated on §o${(new Date()).toLocaleString()}§r\nDeveloped by §l§6SuperLlama88888§r`;
	if(config.AUTHORS.length) {
		manifest["header"]["description"] += `\nStructure made by ${config.AUTHORS.join(" and ")}`;
		manifest["metadata"]["authors"].push(...config.AUTHORS);
	}
	if(config.DESCRIPTION) {
		manifest["header"]["description"] += `\n${config.DESCRIPTION}`;
	}
	manifest["header"]["uuid"] = crypto.randomUUID();
	manifest["modules"][0]["uuid"] = crypto.randomUUID();
	
	manifest["header"]["description"] += `\n\nTotal block count: ${totalBlocks}\n`;
	manifest["header"]["description"] += finalisedMaterialList.map(({ translatedName, count }) => `${count} ${translatedName}`).join(", ");
	
	console.info("Finished making all pack files!");
	
	let pack = new JSZip();
	if(structureFiles.length == 1) {
		pack.file(".mcstructure", structureFiles[0], {
			comment: structureFiles[0].name
		});
	} else {
		structureFiles.forEach((structureFile, i) => {
			pack.file(`${i}.mcstructure`, structureFile, {
				comment: structureFile.name
			});
		});
	}
	pack.file("manifest.json", JSON.stringify(manifest));
	pack.file("pack_icon.png", packIcon);
	pack.file("entity/armor_stand.entity.json", JSON.stringify(entityFile));
	pack.file("render_controllers/armor_stand.hologram.render_controllers.json", JSON.stringify(hologramRenderControllers));
	pack.file("render_controllers/player.render_controllers.json", JSON.stringify(playerRenderControllers));
	pack.file("models/entity/armor_stand.geo.json", JSON.stringify(armorStandGeo));
	pack.file("models/entity/armor_stand.hologram.geo.json", stringifyWithFixedDecimals(hologramGeo));
	pack.file("materials/entity.material", JSON.stringify(hologramMaterial));
	pack.file("animation_controllers/armor_stand.hologram.animation_controllers.json", JSON.stringify(hologramAnimationControllers));
	pack.file("particles/bounding_box_outline.json", JSON.stringify(boundingBoxOutlineParticle));
	uniqueBlocksToValidate.forEach(blockName => {
		let particleName = `validate_${blockName}`;
		let particle = structuredClone(blockValidationParticle);
		particle["particle_effect"]["description"]["identifier"] = `holoprint:${particleName}`;
		particle["particle_effect"]["components"]["minecraft:particle_expire_if_in_blocks"] = [`minecraft:${blockName}`];
		pack.file(`particles/${particleName}.json`, JSON.stringify(particle));
	});
	pack.file("textures/particle/single_white_pixel.png", await singleWhitePixelTexture.toBlob());
	pack.file("textures/entity/overlay.png", await overlayTexture.toBlob());
	pack.file("animations/armor_stand.hologram.animation.json", JSON.stringify(hologramAnimations));
	textureBlobs.forEach(([textureName, blob]) => {
		pack.file(`textures/entity/${textureName}.png`, blob);
	});
	pack.file("ui/hud_screen.json", JSON.stringify(hudScreenUI));
	
	let zippedPack = await pack.generateAsync({
		type: "blob",
		compression: "DEFLATE",
		compressionOptions: {
			level: 9 // too much???
		}
	});
	console.info(`Finished creating pack in ${(performance.now() - startTime).toFixed(0) / 1000}s!`);
	
	if(totalBlocks < config.PREVIEW_BLOCK_LIMIT && previewCont) {
		hologramGeo["minecraft:geometry"].filter(geo => geo["description"]["identifier"].startsWith("geometry.armor_stand.hologram_")).map(geo => {
			(new PreviewRenderer(previewCont, textureAtlas, geo, hologramAnimations, config.SHOW_PREVIEW_SKYBOX)).catch(e => console.error("Preview renderer error:", e)); // is async but we won't wait for it
		});
	}
	
	return new File([zippedPack], `${packName}.holoprint.mcpack`);
}
/**
 * Retrieves the structure files from a completed HoloPrint resource pack.
 * @param {File} resourcePack HoloPrint resource pack (`*.mcpack)
 * @returns {Promise<Array<File>>}
 */
export async function extractStructureFilesFromPack(resourcePack) {
	let packFolder = await JSZip.loadAsync(resourcePack);
	let structureZipObjects = Object.values(packFolder.files).filter(file => file.name.endsWith(".mcstructure"));
	let structureBlobs = await Promise.all(structureZipObjects.map(async zipObject => await zipObject.async("blob")));
	let packName = resourcePack.name.slice(0, resourcePack.name.indexOf("."));
	if(structureBlobs.length == 1) {
		return [new File([structureBlobs[0]], structureZipObjects[0].comment ?? `${packName}.mcstructure`)];
	} else {
		return await Promise.all(structureBlobs.map(async (structureBlob, i) => new File([structureBlob], structureZipObjects[i].comment ?? `${packName}_${i}.mcstructure`)));
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
		throw new Error(`No structure files found inside resource pack ${resourcePack.name}; cannot update pack!`);
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
	return defaultName;
}

/**
 * Adds default config options to a potentially incomplete config object.
 * @param {HoloPrintConfig} config
 * @returns {HoloPrintConfig}
 */
function addDefaultConfig(config) {
	return Object.freeze({
		...{ // defaults
			IGNORED_BLOCKS: [],
			IGNORED_MATERIAL_LIST_BLOCKS: [],
			SCALE: 0.95,
			OPACITY: 0.9,
			MULTIPLE_OPACITIES: true,
			// TINT = [0.53, 0.81, 0.98, 0.2], // to convert rgba to these, type 0x__ / 255 into any JS console
			TINT: undefined,
			MINI_SCALE: 0.125, // size of ghost blocks when in the mini view for layers
			LAYER_MODE: "single", // single | all_below
			TEXTURE_OUTLINE_WIDTH: 0.25, // pixels, x ∈ [0, 1], x ∈ 2^ℝ
			TEXTURE_OUTLINE_COLOR: "#00F9",
			TEXTURE_OUTLINE_ALPHA_DIFFERENCE_MODE: "threshold", // difference: will compare alpha channel difference; threshold: will only look at the second pixel
			TEXTURE_OUTLINE_ALPHA_THRESHOLD: 0, // if using difference mode, will draw outline between pixels with at least this much alpha difference; else, will draw outline on pixels next to pixels with an alpha less than or equal to this
			DO_SPAWN_ANIMATION: true,
			SPAWN_ANIMATION_LENGTH: 0.4, // in seconds
			WRONG_BLOCK_OVERLAY_COLOR: [1, 0, 0, 0.3],
			MATERIAL_LIST_LANGUAGE: "en_US",
			PACK_NAME: undefined,
			PACK_ICON_BLOB: undefined,
			AUTHORS: [],
			DESCRIPTION: undefined,
			PREVIEW_BLOCK_LIMIT: 1000,
			SHOW_PREVIEW_SKYBOX: true
		},
		...config,
		...{ // overrides (applied after)
			IGNORED_BLOCKS: IGNORED_BLOCKS.concat(config.IGNORED_BLOCKS ?? []),
			IGNORED_MATERIAL_LIST_BLOCKS: IGNORED_MATERIAL_LIST_BLOCKS.concat(config.IGNORED_MATERIAL_LIST_BLOCKS ?? []),
		}
	});
}
/**
 * Reads the NBT of a structure file, returning a JSON object.
 * @param {File} structureFile `*.mcstructure`
 * @returns {Promise<Object>}
 */
async function readStructureNBT(structureFile) {
	let arrayBuffer = await structureFile.arrayBuffer().catch(e => { throw new Error(`Could not read bytes of structure file ${structureFile.name}!\n${e}`); });
	let nbt = await NBT.read(arrayBuffer).catch(e => { throw new Error(`Could not parse NBT of structure file ${structureFile.name}!\n${e}`); });
	return nbt.data;
}
/**
 * Loads many files from different sources.
 * @param {Object} stuff
 * @param {ResourcePackStack} resourcePackStack
 * @returns {Promise<Object>}
 */
async function loadStuff(stuff, resourcePackStack) {
	let filePromises = {};
	Object.entries(stuff.packTemplate).forEach(([name, path]) => {
		filePromises[name] = getResponseContents(fetch(`packTemplate/${path}`));
	});
	Object.entries(stuff.resources).forEach(([name, path]) => {
		filePromises[name] = getResponseContents(resourcePackStack.fetchResource(path));
	});
	Object.assign(filePromises, stuff.otherFiles);
	let dataPromises = {};
	Object.entries(stuff.data).forEach(([name, path]) => {
		dataPromises[name] = getResponseContents(resourcePackStack.fetchData(path));
	});
	return await awaitAllEntries({
		files: awaitAllEntries(filePromises),
		data: awaitAllEntries(dataPromises)
	});
}
/**
 * Gets the contents of a response based on the requested file extension (e.g. object from .json, image from .png, etc.).
 * @param {Promise<Response>} resPromise
 * @returns {Promise<String|Blob|Object|HTMLImageElement>}
 */
async function getResponseContents(resPromise) {
	let res = await resPromise;
	if(res.status >= 400) {
		throw new Error(`HTTP error ${res.status} for ${res.url}`);
	}
	let fileExtension = res.url.slice(res.url.lastIndexOf(".") + 1);
	switch(fileExtension) {
		case "json":
		case "material": return await res.jsonc();
		case "lang": return await res.text();
		case "png": return await res.toImage();
	}
	return await res.blob();
}
/**
 * Removes ignored blocks from the block palette, and adds block entities as separate entries.
 * @param {Object} structure The de-NBT-ed structure file
 * @returns {{ palette: Array<Block>, indices: [Array<Number>, Array<Number>] }}
 */
function tweakBlockPalette(structure, ignoredBlocks) {
	let palette = structuredClone(structure["palette"]["default"]["block_palette"]);
	
	let blockVersions = new Set(); // version should be constant for all blocks. just wanted to test this
	palette.forEach((block, i) => {
		block["name"] = block["name"].replace(/^minecraft:/, ""); // remove namespace here, right at the start
		blockVersions.add(+block["version"]);
		if(ignoredBlocks.includes(block["name"])) {
			delete palette[i];
			return;
		}
		delete block["version"];
		if(!Object.keys(block["states"]).length) {
			delete block["states"]; // easier viewing
		}
	});
	console.log("Block versions:", [...blockVersions], [...blockVersions].map(v => v.toString(16).padStart(8, 0).match(/.{2}/g).map(x => parseInt(x, 16)).join(".")));
	
	// add block entities into the block palette (on layer 0)
	let indices = structure["block_indices"].map(layer => structuredClone(layer).map(i => +i));
	let newIndexCache = new Map();
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
		
		let stringifiedNewBlock = JSON.stringify(newBlock, (_, x) => typeof x == "bigint"? x.toString() : x);
		
		// check that we haven't seen this block entity before. since in JS objects are compared by reference we have to stringify it first then check the cache.
		if(newIndexCache.has(stringifiedNewBlock)) {
			indices[0][i] = newIndexCache.get(stringifiedNewBlock);
		} else {
			let paletteI = palette.length;
			palette[paletteI] = newBlock;
			indices[0][i] = paletteI;
			newIndexCache.set(stringifiedNewBlock, paletteI);
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
 * @param {Object} hologramAnimationControllers
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
				"hidden": `!v.render_hologram || v.structure_index != ${structureI}`
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
		[animationStateName]: `v.render_hologram && v.structure_index == ${structureI}`
	});
}
/**
 * Adds block validation particles for a single structure to the hologram animation controllers in-place.
 * @param {Object} hologramAnimationControllers
 * @param {Number} structureI
 * @param {Array<Object>} blocksToValidate
 */
function addBlockValidationParticles(hologramAnimationControllers, structureI, blocksToValidate) {
	let blockValidationAnimation = {
		"particle_effects": [],
		"transitions": [
			{
				"default": "!v.validate_hologram" // when changing structure it will always stop validating, so there's no need to check v.structure_index
			}
		]
	};
	blocksToValidate.forEach(blockToValidate => {
		blockValidationAnimation["particle_effects"].push({
			"effect": `validate_${blockToValidate["block"]}`,
			"locator": blockToValidate["bone_name"],
			"pre_effect_script": `
				v.x = ${blockToValidate["pos"][0]};
				v.y = ${blockToValidate["pos"][1]};
				v.z = ${blockToValidate["pos"][2]};
			`.replaceAll(/\s/g, "") // this is only used for setting the wrong block overlay position; the particle's position is set using a locator
		});
	});
	let animationStateName = `validate_${structureI}`;
	hologramAnimationControllers["animation_controllers"]["controller.animation.armor_stand.hologram.block_validation"]["states"][animationStateName] = blockValidationAnimation;
	hologramAnimationControllers["animation_controllers"]["controller.animation.armor_stand.hologram.block_validation"]["states"]["default"]["transitions"].push({
		[animationStateName]: `v.validate_hologram && v.structure_index == ${structureI}`
	});
}
/**
 * Patches a set of render controllers with some extra Molang code. Returns a new set of render controllers.
 * @param {Object} renderControllers
 * @param {Object} patches
 * @returns {Object}
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
 * Creates a Molang expression that mimics array access. Defaults to the last element if nothing is found.
 * @param {Array} array
 * @returns {String}
 */
function arrayToMolang(array, indexVar) {
	return array.map((el, i) => i == array.length - 1? el : `${i > 0? "(" : ""}${indexVar}==${i}?${el}:`).join("") + ")".repeat(max(array.length - 2, 0));
}
/**
 * Converts a function into minified Molang code. Variables can be referenced with $[...].
 * @param {Function} func
 * @param {Object} [vars]
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
	let mathedCode = expandedElseIfCode.replaceAll(`"`, `'`).replaceAll(/([\w\.]+)(\+|-){2};/g, "$1=$1$21;").replaceAll(/([\w\.]+)--;/g, "$1=$1-1;").replaceAll(/([\w\.]+)(\+|-|\*|\/|\?\?)=([^;]+);/g, "$1=$1$2$3;");
	
	// I have no idea how to make this smaller. I really wish JS had a native AST conversion API
	let conditionedCode = "";
	let parenthesisCounter = 0;
	let inIfCondition = false;
	for(let i = 0; i < mathedCode.length; i++) {
		let char = mathedCode[i];
		if(mathedCode.slice(i, i + 3) == "if(") {
			inIfCondition = true;
			parenthesisCounter++;
			i += 2;
			continue;
		} else if(mathedCode.slice(i, i + 4) == "else") {
			conditionedCode = conditionedCode.slice(0, -1) + ":"; // replace the ; with :
			i += 3;
			continue;
		} else if(char == "(") {
			parenthesisCounter++;
		} else if(char == ")") {
			parenthesisCounter--;
			if(parenthesisCounter == 0 && inIfCondition) {
				inIfCondition = false;
				conditionedCode += "?";
				continue;
			}
		} else if(char == "}") {
			conditionedCode += "};";
			continue;
		}
		conditionedCode += char;
	}
	// Yay more fun regular expressions, this time to work with variable substitution ($[...])
	let variabledCode = conditionedCode.replaceAll(/\$\[(\w+)(?:\[(\d+)\])?(?:(\+|-|\*|\/)(\d+))?\]/g, (match, varName, index, operator, operand) => {
		if(varName in vars) {
			let value = vars[varName];
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
 * @property {Array<Number>|undefined} TINT Clamped colour quartet
 * @property {Number} MINI_SCALE Size of ghost blocks when in the mini view for layers
 * @property {("single"|"all_below")} LAYER_MODE
 * @property {Number} TEXTURE_OUTLINE_WIDTH Measured in pixels, x ∈ [0, 1], x ∈ 2^ℝ
 * @property {String} TEXTURE_OUTLINE_COLOR A colour string
 * @property {("threshold"|"difference")} TEXTURE_OUTLINE_ALPHA_DIFFERENCE_MODE difference: will compare alpha channel difference; threshold: will only look at the second pixel
 * @property {Number} TEXTURE_OUTLINE_ALPHA_THRESHOLD If using difference mode, will draw outline between pixels with at least this much alpha difference; if using threshold mode, will draw outline on pixels next to pixels with an alpha less than or equal to this
 * @property {Boolean} DO_SPAWN_ANIMATION
 * @property {Number} SPAWN_ANIMATION_LENGTH Length of each individual block's spawn animation (seconds)
 * @property {Array<Number>} WRONG_BLOCK_OVERLAY_COLOR Clamped colour quartet
 * @property {String} MATERIAL_LIST_LANGUAGE The language code, as appearing in `texts/languages.json`
 * @property {String|undefined} PACK_NAME The name of the completed pack; will default to the structure file names
 * @property {Blob} PACK_ICON_BLOB Blob for `pack_icon.png`
 * @property {Array<String>} AUTHORS
 * @property {String|undefined} DESCRIPTION
 * @property {Number} PREVIEW_BLOCK_LIMIT The maximum number of blocks a structure can have for rendering a preview
 * @property {Boolean} SHOW_PREVIEW_SKYBOX
 */
/**
 * A block palette entry, similar to how it appears in the NBT, as used in HoloPrint.
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
 */
/**
 * An entry in a material list.
 * @typedef {Object} MaterialListEntry
 * @property {String} itemName
 * @property {String} translationKey
 * @property {String} translatedName
 * @property {Number} count How many of this item is required
 * @property {String} partitionedCount A formatted string representing partitions of the total count
 * @property {Number} auxId The item's aux ID
 */
/**
 * 2D vector.
 * @typedef {[Number, Number]} Vec2
 */
/**
 * 3D vector.
 * @typedef {[Number, Number, Number]} Vec3
 */