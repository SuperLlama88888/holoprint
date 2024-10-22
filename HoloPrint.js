import * as NBT from "https://esm.run/nbtify@2.0.0";
import JSZip from "https://esm.run/jszip@3.10.1";

import BlockGeoMaker from "./BlockGeoMaker.js";
import TextureAtlas from "./TextureAtlas.js";
import MaterialList from "./MaterialList.js";
import PreviewRenderer from "./PreviewRenderer.js";

import { abs, awaitAllEntries, blobToImage, max, min, pi, sha256, sha256text } from "./essential.js";
import ResourcePackStack from "./ResourcePackStack.js";

export default class HoloPrint {
	static #IGNORED_BLOCKS = ["air", "piston_arm_collision", "sticky_piston_arm_collision"]; // blocks to be ignored when scanning the structure file
	static #IGNORED_MATERIAL_LIST_BLOCKS = []; // blocks that will always be hidden on the material list
	
	static #IGNORED_BLOCK_ENTITIES = ["Beacon", "Beehive", "Bell", "BrewingStand", "ChiseledBookshelf", "CommandBlock", "Comparator", "Conduit", "EnchantTable", "EndGateway", "JigsawBlock", "Lodestone", "SculkCatalyst", "SculkShrieker", "SculkSensor", "CalibratedSculkSensor", "StructureBlock", "BrushableBlock", "TrialSpawner", "Vault"];
	
	resourcePackStack;
	config;
	
	constructor({
		IGNORED_BLOCKS = [],
		IGNORED_MATERIAL_LIST_BLOCKS = [],
		SCALE = 0.95,
		OPACITY = 0.9,
		MULTIPLE_OPACITIES = true,
		// TINT = [0.53, 0.81, 0.98, 0.2], // to convert rgba to these, type 0x__ / 255 into any JS console
		TINT = null,
		MINI_SCALE = 0.125, // size of ghost blocks when in the mini view for layers
		LAYER_MODE = "single", // single | all_below
		TEXTURE_OUTLINE_WIDTH = 0.25, // pixels, x ∈ [0, 1], x ∈ 2^ℝ
		TEXTURE_OUTLINE_COLOUR = "#00F9",
		TEXTURE_OUTLINE_ALPHA_DIFFERENCE_MODE = "threshold", // difference: will compare alpha channel difference; threshold: will only look at the second pixel
		TEXTURE_OUTLINE_ALPHA_THRESHOLD = 0, // if using difference mode, will draw outline between pixels with at least this much alpha difference; else, will draw outline on pixels next to pixels with an alpha less than or equal to this
		DO_SPAWN_ANIMATION = true,
		SPAWN_ANIMATION_LENGTH = 0.4, // relative
		WRONG_BLOCK_OVERLAY_COLOR = [1, 0, 0, 0.3],
		MATERIAL_LIST_LANGUAGE = "en_US"
	} = {}, resourcePackStack = new ResourcePackStack(), previewCont) {
		this.config = {
			IGNORED_BLOCKS: HoloPrint.#IGNORED_BLOCKS.concat(IGNORED_BLOCKS),
			IGNORED_MATERIAL_LIST_BLOCKS: HoloPrint.#IGNORED_MATERIAL_LIST_BLOCKS.concat(IGNORED_MATERIAL_LIST_BLOCKS),
			SCALE,
			OPACITY,
			MULTIPLE_OPACITIES,
			TINT,
			MINI_SCALE,
			LAYER_MODE,
			TEXTURE_OUTLINE_WIDTH,
			TEXTURE_OUTLINE_COLOUR,
			TEXTURE_OUTLINE_ALPHA_DIFFERENCE_MODE,
			TEXTURE_OUTLINE_ALPHA_THRESHOLD,
			DO_SPAWN_ANIMATION,
			SPAWN_ANIMATION_LENGTH,
			WRONG_BLOCK_OVERLAY_COLOR,
			MATERIAL_LIST_LANGUAGE
		};
		Object.freeze(this.config);
		this.resourcePackStack = resourcePackStack;
		this.previewCont = previewCont;
	}
	/**
	 * Makes a HoloPrint resource pack from a structure file.
	 * @param {File} structureFile Structure file (.mcstructure)
	 * @returns {Promise<File>} Resource pack (.mcpack)
	 */
	async makePack(structureFile) {
		let startTime = performance.now();
		
		let arrayBuffer;
		try {
			arrayBuffer = await structureFile.arrayBuffer();
		} catch(e) {
			throw new Error(`Could not read bytes of structure file!\n${e}`);
		}
		let { data: nbt } = await NBT.read(arrayBuffer);
		console.info("Finished reading structure NBT!");
		console.log("NBT:", nbt);
		window.nbt = nbt;
		let structureSize = nbt["size"].map(x => +x); // Stored as Number instances: https://github.com/Offroaders123/NBTify/issues/50
		
		// Make the pack
		let { manifest, packIcon, entityFile, hologramRenderControllers, defaultPlayerRenderControllers, armorStandGeo, hologramMaterial, hologramAnimationControllers, boundingBoxOutlineParticle, blockValidationParticle, singleWhitePixelTexture, hudScreenUI, translationFile, blockMetadata, itemMetadata } = await awaitAllEntries({
			manifest: fetch("packTemplate/manifest.json").then(res => res.jsonc()),
			packIcon: this.#makePackIcon(structureFile),
			entityFile: this.resourcePackStack.fetchResource("entity/armor_stand.entity.json").then(res => res.jsonc()),
			hologramRenderControllers: fetch("packTemplate/render_controllers/armor_stand.hologram.render_controllers.json").then(res => res.jsonc()), // We add the overlay colour here. We could do it with the canvas but the advantage is that doing it with overlay_color in the render controller is it only renders the overlay on pixels where there's actually texture, whereas if we add it to the texture itself the overlay will render on transparent pixels as well (you could make it only add overlay on solid pixels with the canvas as well but this is easier and possibly changeable in-game).
			defaultPlayerRenderControllers: this.resourcePackStack.fetchResource("render_controllers/player.render_controllers.json").then(res => res.jsonc()),
			armorStandGeo: this.resourcePackStack.fetchResource("models/entity/armor_stand.geo.json").then(res => res.jsonc()), // we update the visible bounds in here
			hologramMaterial: fetch("packTemplate/materials/entity.material").then(res => res.jsonc()),
			hologramAnimationControllers: fetch("packTemplate/animation_controllers/armor_stand.hologram.animation_controllers.json").then(res => res.jsonc()),
			boundingBoxOutlineParticle: fetch("packTemplate/particles/bounding_box_outline.json").then(res => res.jsonc()),
			blockValidationParticle: fetch("packTemplate/particles/block_validation.json").then(res => res.jsonc()),
			singleWhitePixelTexture: fetch("packTemplate/textures/particle/single_white_pixel.png").then(res => res.toImage()),
			hudScreenUI: fetch("packTemplate/ui/hud_screen.json").then(res => res.jsonc()),
			translationFile: this.resourcePackStack.fetchResource(`texts/${this.config.MATERIAL_LIST_LANGUAGE}.lang`).then(res => res.text()),
			blockMetadata: this.resourcePackStack.fetchData("metadata/vanilladata_modules/mojang-blocks.json").then(res => res.json()),
			itemMetadata: this.resourcePackStack.fetchData("metadata/vanilladata_modules/mojang-items.json").then(res => res.json())
		});
		let structure = nbt["structure"];
		
		let { palette: blockPalette, indices: blockPaletteIndicesByLayer } = this.#tweakBlockPalette(structure);
		// console.log("indices: ", blockIndices);
		
		let blockGeoMaker = await new BlockGeoMaker(this.config);
		// makeBoneTemplate() is an impure function and adds texture references to the textureRefs set property.
		let boneTemplatePalette = blockPalette.map(block => blockGeoMaker.makeBoneTemplate(block));
		console.log("Block geo maker:", blockGeoMaker);
		console.log("Bone template palette:", structuredClone(boneTemplatePalette));
		
		let textureAtlas = await new TextureAtlas(this.config, this.resourcePackStack);
		let textureRefs = [...blockGeoMaker.textureRefs];
		await textureAtlas.makeAtlas(textureRefs); // each texture reference will get added to the textureUvs array property
		
		// console.clear();
		console.log("Texture UVs:", textureAtlas.textures);
		boneTemplatePalette.forEach(boneTemplate => {
			boneTemplate["cubes"].forEach(cube => {
				Object.keys(cube["uv"]).forEach(face => {
					let i = cube["uv"][face];
					let imageUv = textureAtlas.textures[i];
					cube["uv"][face] = {
						"uv": imageUv["uv"],
						"uv_size": imageUv["uv_size"]
					};
					if("crop" in imageUv) {
						let crop = imageUv["crop"];
						if(cube["size"][0] == 0) {
							cube["origin"][2] += cube["size"][2] * crop["x"];
							cube["origin"][1] += cube["size"][1] * (1 - crop["h"] - crop["y"]); // the latter term gives the distance from the bottom of the texture, which is upwards direction in 3D space.
							cube["size"][2] *= crop["w"];
							cube["size"][1] *= crop["h"];
						} else if(cube["size"][1] == 0) {
							cube["origin"][0] += cube["size"][0] * crop["x"];
							cube["origin"][2] += cube["size"][2] * crop["y"];
							cube["size"][0] *= crop["w"];
							cube["size"][2] *= crop["h"];
						} else if(cube["size"][2] == 0) {
							cube["origin"][0] += cube["size"][0] * crop["x"];
							cube["origin"][1] += cube["size"][1] * (1 - crop["h"] - crop["y"]);
							cube["size"][0] *= crop["w"];
							cube["size"][1] *= crop["h"];
						} else {
							console.error(`Cannot crop bone template without zero size in one axis:`, boneTemplate);
						}
					}
				});
			});
		});
		console.log("Bone template palette with resolved UVs:", boneTemplatePalette);
		
		let entityDescription = entityFile["minecraft:client_entity"]["description"];
		entityDescription["materials"]["hologram"] = "holoprint_hologram";
		entityDescription["materials"]["hologram.wrong_block_overlay"] = "holoprint_hologram_wrong_block_overlay";
		entityDescription["textures"]["hologram.overlay"] = "textures/entity/overlay";
		entityDescription["animations"]["hologram.align"] = "animation.armor_stand.hologram.align";
		entityDescription["animations"]["hologram.offset"] = "animation.armor_stand.hologram.offset";
		entityDescription["animations"]["hologram.spawn"] = "animation.armor_stand.hologram.spawn";
		entityDescription["animations"]["hologram.wrong_block_overlay"] = "animation.armor_stand.hologram.wrong_block_overlay";
		entityDescription["animations"]["controller.hologram.layers"] = "controller.animation.armor_stand.hologram.layers";
		entityDescription["animations"]["controller.hologram.bounding_box"] = "controller.animation.armor_stand.hologram.bounding_box";
		entityDescription["animations"]["controller.hologram.block_validation"] = "controller.animation.armor_stand.hologram.block_validation";
		entityDescription["scripts"]["animate"].push("hologram.align", "hologram.offset", "hologram.spawn", "hologram.wrong_block_overlay", "controller.hologram.layers", "controller.hologram.bounding_box", "controller.hologram.block_validation");
		entityDescription["scripts"]["initialize"].push(this.#functionToMolang((q, t) => {
			t.hologram_offset_x ??= 0;
			t.hologram_offset_y ??= 0;
			t.hologram_offset_z ??= 0;
			t.structure_w = $[structureSize[0]];
			t.structure_h = $[structureSize[1]];
			t.structure_d = $[structureSize[2]];
			if(q.distance_from_camera <= 10) {
				t.render_hologram = true;
				t.hologram_layer = -1;
				t.validate_hologram = false;
				t.show_wrong_block_overlay = false;
				t.wrong_block_x = 0;
				t.wrong_block_y = 0;
				t.wrong_block_z = 0;
			} else {
				t.render_hologram ??= true;
				t.hologram_layer ??= -1;
				t.validate_hologram ??= false;
				t.show_wrong_block_overlay ??= false;
				t.wrong_block_x ??= 0;
				t.wrong_block_y ??= 0;
				t.wrong_block_z ??= 0;
			}
		}, { structureSize })); // particles need to access structure dimensions later, but their `v.` scope is different to the armour stand's, so these have to be temp variables.
		entityDescription["scripts"]["pre_animation"] ??= [];
		entityDescription["scripts"]["pre_animation"].push(this.#functionToMolang((v, q) => {
			v.hologram_dir = Math.floor(q.body_y_rotation / 90) + 2; // [south, west, north, east] (since it goes from -180 to 180)
		}));
		entityDescription["geometry"]["hologram"] = "geometry.armor_stand.hologram";
		entityDescription["geometry"]["hologram.wrong_block_overlay"] = "geometry.armor_stand.hologram.wrong_block_overlay";
		entityDescription["geometry"]["hologram.valid_structure_overlay"] = "geometry.armor_stand.hologram.valid_structure_overlay";
		entityDescription["render_controllers"].push({
			"controller.render.armor_stand.hologram": this.#functionToMolang((v, t) => {
				v.last_pose ??= v.armor_stand.pose_index;
				if(v.armor_stand.pose_index != v.last_pose) {
					if(t.render_hologram) {
						t.armor_stand_interaction = true;
					}
					v.last_pose = v.armor_stand.pose_index;
				}
				return t.render_hologram;
			})
		}, {
			"controller.render.armor_stand.hologram.wrong_block_overlay": "t.show_wrong_block_overlay"
		}, {
			"controller.render.armor_stand.hologram.valid_structure_overlay": "t.validate_hologram && t.wrong_blocks == 0"
		});
		let outlineParticleSettings = [
			"v.size = t.structure_w / 2; v.dir = 0; v.r = 1; v.g = 0; v.b = 0;",
			"v.size = t.structure_h / 2; v.dir = 1; v.r = 1 / 255; v.g = 1; v.b = 0;",
			"v.size = t.structure_d / 2; v.dir = 2; v.r = 0; v.g = 162 / 255; v.b = 1;",
			"v.size = t.structure_w / 2; v.dir = 0; v.y = t.structure_h; v.r = 1; v.g = 1; v.b = 1;",
			"v.size = t.structure_w / 2; v.dir = 0; v.z = t.structure_d; v.r = 1; v.g = 1; v.b = 1;",
			"v.size = t.structure_w / 2; v.dir = 0; v.y = t.structure_h; v.z = t.structure_d; v.r = 1; v.g = 1; v.b = 1;",
			"v.size = t.structure_h / 2; v.dir = 1; v.x = t.structure_w; v.r = 1; v.g = 1; v.b = 1;",
			"v.size = t.structure_h / 2; v.dir = 1; v.z = t.structure_d; v.r = 1; v.g = 1; v.b = 1;",
			"v.size = t.structure_h / 2; v.dir = 1; v.x = t.structure_w; v.z = t.structure_d; v.r = 1; v.g = 1; v.b = 1;",
			"v.size = t.structure_d / 2; v.dir = 2; v.x = t.structure_w; v.r = 1; v.g = 1; v.b = 1;",
			"v.size = t.structure_d / 2; v.dir = 2; v.y = t.structure_h; v.r = 1; v.g = 1; v.b = 1;",
			"v.size = t.structure_d / 2; v.dir = 2; v.x = t.structure_w; v.y = t.structure_h; v.r = 1; v.g = 1; v.b = 1;"
		];
		entityDescription["particle_effects"] ??= {};
		outlineParticleSettings.forEach((particleMolang, i) => {
			let particleName = `bounding_box_outline_${i}`;
			entityDescription["particle_effects"][particleName] = `holoprint:${particleName}`;
			hologramAnimationControllers["animation_controllers"]["controller.animation.armor_stand.hologram.bounding_box"]["states"]["default"]["particle_effects"].push({
				"effect": particleName,
				"locator": "hologram_root"
			});
		});
		
		let overlayTexture = await singleWhitePixelTexture.setOpacity(this.config.WRONG_BLOCK_OVERLAY_COLOR[3]);
		
		let { hologramGeo, hologramAnimations } = await awaitAllEntries({
			hologramGeo: fetch("packTemplate/models/entity/armor_stand.hologram.geo.json").then(res => res.jsonc()), // this is where we put all the ghost blocks
			hologramAnimations: fetch("packTemplate/animations/armor_stand.hologram.animation.json").then(res => res.jsonc())
		});
		
		hologramGeo["minecraft:geometry"][0]["description"]["texture_width"] = textureAtlas.atlasWidth;
		hologramGeo["minecraft:geometry"][0]["description"]["texture_height"] = textureAtlas.atlasHeight;
		
		hologramGeo["minecraft:geometry"][2]["bones"][1]["cubes"][0]["origin"][0] = 8 - structureSize[0] * 16;
		hologramGeo["minecraft:geometry"][2]["bones"][1]["cubes"][0]["size"] = structureSize.map(x => x * 16);
		
		let makeHologramSpawnAnimation;
		if(this.config.DO_SPAWN_ANIMATION) {
			makeHologramSpawnAnimation = (x, y, z) => {
				let delay = this.config.SPAWN_ANIMATION_LENGTH * 0.25 * (structureSize[0] - x + y + structureSize[2] - z + Math.random() * 2) + 0.05;
				delay = Number(delay.toFixed(2));
				// return {
				// 	"scale": `${this.config.MINI_SCALE} + ${1 - this.config.MINI_SCALE} * (1 - math.pow(1 - math.clamp((q.anim_time - ${delay}) / ${this.config.SPAWN_ANIMATION_LENGTH}, 0, 1), 3))`
				// };
				return {
					"scale": `1 - math.pow(1 - math.clamp((q.anim_time - ${delay}) / ${this.config.SPAWN_ANIMATION_LENGTH}, 0, 1), 3)` // requires pivot to be block center
				};
			};
			hologramAnimations["animations"]["animation.armor_stand.hologram.spawn"]["animation_length"] = this.config.SPAWN_ANIMATION_LENGTH * (1 + 0.25 * (structureSize.reduce((a, b) => a + b) * 2) + 0.05); // very janky
		} else {
			// Totally empty animation
			delete hologramAnimations["animations"]["animation.armor_stand.hologram.spawn"]["loop"];
			delete hologramAnimations["animations"]["animation.armor_stand.hologram.spawn"]["bones"];
		}
		
		let layerAnimations = hologramAnimationControllers["animation_controllers"]["controller.animation.armor_stand.hologram.layers"]["states"];
		let topLayer = structureSize[1] - 1;
		layerAnimations["default"]["transitions"].push(
			{
				"l_0": `t.hologram_layer > -1 && t.hologram_layer != ${topLayer}`
			},
			{
				[`l_${structureSize[1] - 1}`]: `t.hologram_layer == ${topLayer}`
			}
		);
		
		let blocksToValidate = [];
		let uniqueBlocksToValidate = new Set();
		
		let materialList = new MaterialList(blockMetadata, itemMetadata, translationFile);
		for(let y = 0; y < structureSize[1]; y++) {
			let layerName = `l_${y}`;
			hologramGeo["minecraft:geometry"][0]["bones"].push({
				"name": layerName,
				"parent": "hologram_root",
				"pivot": [8, 0, -8]
			});
			layerAnimations[layerName] = {
				"animations": [`hologram.l_${y}`],
				"blend_transition": 0.1,
				"blend_via_shortest_path": true,
				"transitions": [
					{
						[y == 0? "default" : `l_${y - 1}`]: `t.hologram_layer < ${y}${y == topLayer? " && t.hologram_layer != -1" : ""}`
					},
					(y == topLayer? {
						"default": "t.hologram_layer == -1"
					} : {
						[`l_${y + 1}`]: `t.hologram_layer > ${y}`
					})
				]
			};
			hologramAnimations["animations"][`animation.armor_stand.hologram.l_${y}`] = {};
			let layerAnimation = hologramAnimations["animations"][`animation.armor_stand.hologram.l_${y}`];
			layerAnimation["loop"] = "hold_on_last_frame";
			layerAnimation["bones"] = {};
			for(let otherLayerY = 0; otherLayerY < structureSize[1]; otherLayerY++) {
				if(otherLayerY == y || this.config.LAYER_MODE == "all_below" && otherLayerY < y) {
					continue;
				}
				layerAnimation["bones"][`l_${otherLayerY}`] = {
					"scale": this.config.MINI_SCALE
				};
			}
			if(Object.entries(layerAnimation["bones"]).length == 0) {
				delete layerAnimation["bones"];
			}
			entityDescription["animations"][`hologram.l_${y}`] = `animation.armor_stand.hologram.l_${y}`;
			
			for(let x = 0; x < structureSize[0]; x++) {
				for(let z = 0; z < structureSize[2]; z++) {
					let i = (x * structureSize[1] + y) * structureSize[2] + z;
					blockPaletteIndicesByLayer.forEach((blockPaletteIndices, layerI) => {
						let paletteI = blockPaletteIndices[i];
						if(!(paletteI in boneTemplatePalette)) {
							if(paletteI in blockPalette) {
								console.error(`A bone template wasn't made for blockPalette[${paletteI}] = ${blockPalette[paletteI]["name"]}!`);
							}
							return;
						}
						let boneTemplate = boneTemplatePalette[paletteI];
						// console.table({x, y, z, i, paletteI, boneTemplate});
						
						let boneName = `b_${x}_${y}_${z}`;
						let firstBoneForThisBlock = true;
						if(boneName == hologramGeo["minecraft:geometry"][0]["bones"].at(-1)["name"]) {
							boneName += `_${layerI}`;
							firstBoneForThisBlock = false;
						}
						let bonePos = [-16 * x - 8, 16 * y, 16 * z - 8]; // I got these values from trial and error with blockbench (which makes the x negative I think. it's weird.)
						let positionedBoneTemplate = blockGeoMaker.positionBoneTemplate(boneTemplate, bonePos);
						hologramGeo["minecraft:geometry"][0]["bones"].push({
							"name": boneName,
							"parent": layerName,
							...positionedBoneTemplate
						});
						if(firstBoneForThisBlock) { // we only need 1 locator for each block position, even though there may be 2 bones in this position because of the 2nd layer
							hologramGeo["minecraft:geometry"][0]["bones"][1]["locators"][boneName] = bonePos.map(x => x + 8);
						}
						
						if(this.config.DO_SPAWN_ANIMATION) {
							hologramAnimations["animations"]["animation.armor_stand.hologram.spawn"]["bones"][boneName] = makeHologramSpawnAnimation(x, y, z);
						}
						
						let blockName = blockPalette[paletteI]["name"];
						materialList.add(blockName);
						
						if(layerI == 0) { // particle_expire_if_in_blocks only works on the first layer :(
							blocksToValidate.push({
								"bone_name": boneName,
								"block": blockName,
								"pos": [x, y, z]
							});
							uniqueBlocksToValidate.add(blockName);
						}
					});
				}
			}
		}
		let totalBlocks = materialList.totalMaterialCount;
		let totalBlocksToValidate = blocksToValidate.length;
		
		// add the particles' short names, and then reference them in the animation controller
		uniqueBlocksToValidate.forEach(blockName => {
			let particleName = `validate_${blockName}`;
			entityDescription["particle_effects"][particleName] = `holoprint:${particleName}`;
		});
		blocksToValidate.forEach(blockToValidate => {
			hologramAnimationControllers["animation_controllers"]["controller.animation.armor_stand.hologram.block_validation"]["states"]["validate"]["particle_effects"].push({
				"effect": `validate_${blockToValidate["block"]}`,
				"locator": blockToValidate["bone_name"],
				"pre_effect_script": `
					v.x = ${blockToValidate["pos"][0]};
					v.y = ${blockToValidate["pos"][1]};
					v.z = ${blockToValidate["pos"][2]};
				`.replaceAll(/\s/g, "")
			});
		});
		
		let textureBlobs = textureAtlas.imageBlobs;
		
		if(totalBlocks < 1000) {
			new PreviewRenderer(this.previewCont, textureAtlas, hologramGeo, hologramAnimations); // is async but we won't wait for it
		}
		
		let structureName = structureFile.name.match(/(.+)\.[^.]+$/)[1];
		
		manifest["header"]["name"] = `§uHoloPrint:§r ${structureName}`;
		manifest["header"]["description"] = `§u★HoloPrint§r resource pack generated on §o${(new Date()).toLocaleString()}§r\nDeveloped by §l§6SuperLlama88888§r`;
		manifest["header"]["uuid"] = crypto.randomUUID();
		manifest["modules"][0]["uuid"] = crypto.randomUUID();
		
		let defaultTextureIndex = max(textureBlobs.length - 3, 0); // default to 80% opacity
		textureBlobs.forEach(([textureName]) => {
			entityDescription["textures"][textureName] = `textures/entity/${textureName}`;
			hologramRenderControllers["render_controllers"]["controller.render.armor_stand.hologram"]["arrays"]["textures"]["Array.textures"].push(`Texture.${textureName}`);
		});
		hologramRenderControllers["render_controllers"]["controller.render.armor_stand.hologram"]["textures"][0] = `Array.textures[t.hologram_texture_index ?? ${defaultTextureIndex}]`
		
		if(this.config.TINT != null) {
			// By putting the overlay in the render controller instead of modifying the texture, the overlay isn't applied on transparent pixels. It also saves us the work of having to manipulate the image data directly :)
			hologramRenderControllers["render_controllers"]["controller.render.armor_stand.hologram"]["overlay_color"] = {
				"r": this.config.TINT[0],
				"g": this.config.TINT[1],
				"b": this.config.TINT[2],
				"a": this.config.TINT[3]
			};
		}
		
		let initVariables = this.#functionToMolang((v, t) => {
			v.last_attack_time ??= 0;
			t.render_hologram ??= true;
			t.hologram_offset_x ??= 0;
			t.hologram_offset_y ??= 0;
			t.hologram_offset_z ??= 0;
			t.hologram_texture_index ??= $[defaultTextureIndex];
			t.validate_hologram ??= false;
			t.hologram_layer ??= -1;
			t.show_wrong_block_overlay ??= false;
			t.wrong_blocks ??= $[totalBlocksToValidate];
			t.armor_stand_interaction ??= false;
			
			v.attack = v.attack_time > 0 && (v.last_attack_time == 0 || v.attack_time < v.last_attack_time);
			v.last_attack_time = v.attack_time;
		}, { defaultTextureIndex, totalBlocksToValidate });
		let totalLayers = structureSize[1];
		let renderingControls = this.#functionToMolang((q, t, v, textureBlobsCount) => {
			if(v.attack) {
				if(q.is_item_name_any("slot.weapon.mainhand", "minecraft:stone")) {
					t.render_hologram = !t.render_hologram;
				}
				if(t.render_hologram) {
					if(q.is_item_name_any("slot.weapon.mainhand", "minecraft:glass")) {
						t.hologram_texture_index = Math.clamp(t.hologram_texture_index + (q.is_sneaking? -1 : 1), 0, $[textureBlobsCount - 1]);
					}
				}
				if(q.is_item_name_any("slot.weapon.mainhand", "minecraft:iron_ingot")) {
					t.validate_hologram = !t.validate_hologram;
					if(t.validate_hologram) {
						t.wrong_blocks = $[totalBlocksToValidate];
					}
				}
			}
			if(t.render_hologram && ((v.attack && q.equipped_item_any_tag("slot.weapon.mainhand", "minecraft:planks")) || t.armor_stand_interaction)) {
				t.hologram_layer = t.hologram_layer + (q.is_sneaking && !t.armor_stand_interaction? -1 : 1);
				if(t.hologram_layer < -1) {
					t.hologram_layer = $[totalLayers - 1];
				}
				if(t.hologram_layer >= $[totalLayers]) {
					t.hologram_layer = -1;
				}
				t.armor_stand_interaction = false;
			}
		}, { totalLayers, textureBlobsCount: textureBlobs.length, totalBlocksToValidate });
		let movementControls = this.#functionToMolang((q, t, v) => {
			if(v.attack && q.is_item_name_any("slot.weapon.mainhand", "minecraft:stick")) {
				if(q.cardinal_player_facing == 0) {
					t.hologram_offset_y--;
				}
				if(q.cardinal_player_facing == 1) {
					t.hologram_offset_y++;
				}
				if(q.cardinal_player_facing == 2) {
					t.hologram_offset_z--;
				}
				if(q.cardinal_player_facing == 3) {
					t.hologram_offset_z++;
				}
				if(q.cardinal_player_facing == 4) {
					t.hologram_offset_x++;
				}
				if(q.cardinal_player_facing == 5) {
					t.hologram_offset_x--;
				}
			}
		});
		let playerRenderControllers = this.#patchRenderControllers(defaultPlayerRenderControllers, {
			"controller.render.player.first_person": this.#functionToMolang((q, v) => {
				if(!q.is_in_ui && !v.map_face_icon) {
					$[initVariables]
					$[renderingControls]
				}
			}, { initVariables, renderingControls }),
			"controller.render.player.third_person": this.#functionToMolang((q, v) => {
				if(!q.is_in_ui) {
					$[initVariables]
					$[renderingControls]
					$[movementControls] // in first person, since the player entity is always at the front of the screen, it's always facing south so movement controls don't work.
				}
			}, { initVariables, renderingControls, movementControls })
		});
		
		// I have no idea if these visible bounds actually influence anything...
		let visibleBoundsWidth = 16 * max(structureSize[0], structureSize[2]);
		let visibleBoundsHeight = 16 * structureSize[1];
		armorStandGeo["minecraft:geometry"][0]["description"]["visible_bounds_width"] = visibleBoundsWidth;
		armorStandGeo["minecraft:geometry"][0]["description"]["visible_bounds_height"] = visibleBoundsHeight;
		hologramGeo["minecraft:geometry"][0]["description"]["visible_bounds_width"] = visibleBoundsWidth;
		hologramGeo["minecraft:geometry"][0]["description"]["visible_bounds_height"] = visibleBoundsHeight;
		
		console.log("Block counts map:", materialList.materials);
		
		let finalisedMaterialList = materialList.export();
		console.log("Finalised material list:", finalisedMaterialList);
		
		// console.log(partitionedBlockCounts);
		let missingItemAux = blockMetadata["data_items"].find(block => block.name == "minecraft:reserved6")["raw_id"];
		hudScreenUI["material_list"]["controls"].push(...finalisedMaterialList.map(({ translationKey, partitionedCount, auxId }, i) => ({
			[`material_list_${i}@hud.material_list_entry`]: {
				"$item_translation_key": translationKey,
				"$item_count": partitionedCount,
				"$item_id_aux": auxId ?? missingItemAux,
				"$background_opacity": i % 2 * 0.2
			}
		})));
		hudScreenUI["material_list_wrapper"]["size"][1] = finalisedMaterialList.length * 12 + 12; // 12px for each item + 12px for the heading
		hudScreenUI["material_list_heading"]["controls"][1]["pack_name"]["text"] += structureName;
		
		manifest["header"]["description"] += `\n\nTotal block count: ${totalBlocks}\n`;
		manifest["header"]["description"] += finalisedMaterialList.map(({ translatedName, count }) => `${count} ${translatedName}`).join(", ");
		
		console.info("Finished making all pack files!");
		
		let pack = new JSZip();
		pack.file(".mcstructure", structureFile);
		pack.file("manifest.json", JSON.stringify(manifest));
		pack.file("pack_icon.png", packIcon);
		pack.file("entity/armor_stand.entity.json", JSON.stringify(entityFile));
		pack.file("render_controllers/armor_stand.hologram.render_controllers.json", JSON.stringify(hologramRenderControllers));
		pack.file("render_controllers/player.render_controllers.json", JSON.stringify(playerRenderControllers));
		pack.file("models/entity/armor_stand.geo.json", JSON.stringify(armorStandGeo));
		pack.file("models/entity/armor_stand.hologram.geo.json", this.#stringifyWithFixedDecimals(hologramGeo));
		pack.file("materials/entity.material", JSON.stringify(hologramMaterial));
		pack.file("animation_controllers/armor_stand.hologram.animation_controllers.json", JSON.stringify(hologramAnimationControllers));
		outlineParticleSettings.forEach((particleMolang, i) => {
			let particle = structuredClone(boundingBoxOutlineParticle);
			particle["particle_effect"]["description"]["identifier"] = `holoprint:bounding_box_outline_${i}`;
			particle["particle_effect"]["components"]["minecraft:emitter_initialization"]["creation_expression"] = particleMolang.replaceAll(/\s/g, "");
			pack.file(`particles/bounding_box_outline_${i}.json`, JSON.stringify(particle));
		});
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
		return new File([zippedPack], `${structureName}.holoprint.mcpack`);
	}
	/**
	 * Retrieves the structure file from a completed HoloPrint resource pack
	 * @param {File} resourcePack HoloPrint resource pack (.mcpack)
	 * @returns {Promise<File>}
	 */
	static async extractStructureFileFromPack(resourcePack) {
		let packFolder = await JSZip.loadAsync(resourcePack);
		console.log(packFolder.file(".mcstructure"))
		let structureBlob = await packFolder.file(".mcstructure")?.async("blob");
		if(!structureBlob) {
			return undefined;
		}
		let packName = resourcePack.name.slice(0, resourcePack.name.indexOf("."));
		return new File([structureBlob], `${packName}.mcstructure`);
	}
	/**
	 * Updates a HoloPrint resource pack by remaking it.
	 * @param {File} resourcePack HoloPrint resource pack to update (.mcpack)
	 * @returns {Promise<File>}
	 */
	async updatePack(resourcePack) {
		let structureFile = HoloPrint.extractStructureFileFromPack(resourcePack);
		if(!structureFile) {
			throw new Error(`No structure file found inside resource pack ${resourcePack.name}; cannot update pack!`);
		}
		return await this.makePack(structureFile);
	}
	
	/**
	 * Removes ignored blocks from the block palette, and adds block entities as separate entries.
	 * @param {Object} structure The de-NBT-ed structure file
	 * @returns {{ palette: Array<Number>, indices: [Array<Number>, Array<Number>] }}
	 */
	#tweakBlockPalette(structure) {
		let palette = structuredClone(structure["palette"]["default"]["block_palette"]);
		
		let blockVersions = new Set(); // version should be constant for all blocks. just wanted to test this
		palette.forEach((block, i) => {
			block["name"] = block["name"].replace(/^minecraft:/, ""); // remove namespace here, right at the start
			blockVersions.add(+block["version"]);
			if(this.config.IGNORED_BLOCKS.includes(block["name"])) {
				delete palette[i];
				return;
			}
			delete block["version"];
			if(!Object.keys(block["states"]).length) {
				delete block["states"]; // easier viewing
			}
		});
		console.log("Block versions:", [...blockVersions]);
		
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
			if(HoloPrint.#IGNORED_BLOCK_ENTITIES.includes(blockEntityData["id"])) {
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
		// console.log("palette: ", blockPalette, JSON.stringify(blockPalette));
		// console.log("indices: ", blockPaletteIndices, JSON.stringify(blockPaletteIndices));
		console.log("palette: ", palette);
		console.log("indices: ", indices);
		// blockIndices = blockIndices.map(i => blockPalette[i]);
		window.blockPalette = palette;
		window.blockIndices = indices;
		
		return { palette, indices };
	}
	#addPlayerControllers(defaultPlayerRenderControllers) {
		
		
		
		// return playerRenderControllers;
	}
	/**
	 * Patches a set of render controllers with some extra Molang code. Returns a new set of render controllers.
	 * @param {Object} renderControllers
	 * @param {Object} patches
	 * @returns {Object}
	 */
	#patchRenderControllers(renderControllers, patches) {
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
			}).filter(x => x))
		};
	}
	/**
	 * Makes a blob for pack_icon.png based on a structure file's SHA256 hash
	 * @param {File} structureFile
	 * @returns {Promise<Blob>}
	 */
	async #makePackIcon(structureFile) {
		let fileHashBytes = [...await sha256(structureFile)]; // I feel like I should wrap the async expression in brackets...
		let fileHashBits = fileHashBytes.map(byte => [7, 6, 5, 4, 3, 2, 1, 0].map(bitI => byte >> bitI & 0x1)).flat();
		window.fhb = fileHashBits;
		
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
	 * Converts a function into minified Molang code. Variables can be referenced with $[...].
	 * @param {Function} func
	 * @param {Object} [vars]
	 * @returns {String} Molang code
	 */
	#functionToMolang(func, vars = {}) {
		let funcCode = func.toString();
		let funcBody = funcCode.slice(funcCode.indexOf("{") + 1, funcCode.lastIndexOf("}")).replaceAll(/\/\/.+/g, "").replaceAll(/(?<!return)\s/g, "");
		let mathedCode = funcBody.replaceAll(`"`, `'`).replaceAll(/([\w\.]+)(\+|-){2};/g, "$1=$1$21;").replaceAll(/([\w\.]+)--;/g, "$1=$1-1;").replaceAll(/([\w\.]+)(\+|-|\*|\/|\?\?)=([^;]+);/g, "$1=$1$2$3;")
		
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
	#stringifyWithFixedDecimals(value) {
		const NUMBER_OF_DECIMALS = 4;
		return JSON.stringify(value, (key, x) => {
			if(typeof x == "number") {
				let oldNumber = x;
				x = Number(x.toFixed(NUMBER_OF_DECIMALS));
				if(abs(x - oldNumber) > 10 ** (-NUMBER_OF_DECIMALS - 1)) {
					console.debug(`Turned long number ${oldNumber} into ${x} when stringifying JSON`);
				}
			}
			return x;
		});
	}
}