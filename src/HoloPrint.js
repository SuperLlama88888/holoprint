import * as NBT from "nbtify-readonly-typeless";
import { ZipWriter, TextReader, BlobWriter, BlobReader, ZipReader } from "@zip.js/zip.js";

import BlockGeoMaker from "./BlockGeoMaker.js";
import TextureAtlas from "./TextureAtlas.js";
import MaterialList from "./MaterialList.js";
import PreviewRenderer from "./PreviewRenderer.js";

import entityScripts from "./entityScripts.molang.js";
import { addPaddingToImage, array2DToMolang, arrayToMolang, awaitAllEntries, cacheUnaryFunc, concatenateFiles, createNumericEnum, desparseArray, functionToMolang, getFileExtension, hexColorToClampedTriplet, itemCriteriaToMolang, jsonc, JSONMap, JSONSet, lcm, loadTranslationLanguage, max, min, onEvent, overlaySquareImages, pi, removeFalsies, removeFileExtension, resizeImageToBlob, round, setImageOpacity, sha256, toBlob, toImage, translate, transposeMatrix, tuple, UserError } from "./utils.js";
import ResourcePackStack from "./ResourcePackStack.js";
import BlockUpdater from "./BlockUpdater.js";
import SpawnAnimationMaker from "./SpawnAnimationMaker.js";
import PolyMeshMaker from "./PolyMeshMaker.js";
import fetchers from "./fetchers.js";
import EntityGeoMaker from "./EntityGeoMaker.js";

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
 * @param {File | File[]} structureFiles Either a singular structure file (`*.mcstructure`), or an array of structure files
 * @param {HoloPrintConfig} [config]
 * @param {ResourcePackStack} [resourcePackStack]
 * @param {HTMLElement} [previewCont]
 * @param {(previews: PreviewRenderer[]) => void} [previewLoadedCallback] A function that will be called once the preview has finished loading
 * @returns {Promise<File>} Resource pack (`*.mcpack`)
 */
export async function makePack(structureFiles, config, resourcePackStack = new ResourcePackStack(), previewCont, previewLoadedCallback) {
	console.info(`Running HoloPrint ${VERSION}`);
	let startTime = performance.now();
	
	config = addDefaultConfig(config ?? {});
	if(!Array.isArray(structureFiles)) {
		structureFiles = [structureFiles];
	}
	let nbts = await Promise.all(structureFiles.map(structureFile => readStructureNBT(structureFile)));
	console.info("Finished reading structure NBTs!");
	console.log("NBTs:", nbts);
	let structureSizes = nbts.map(nbt => nbt["size"]);
	let packName = config.PACK_NAME ?? getDefaultPackName(structureFiles);
	
	// very hacky TypeScript magic. This makes it so that I can have types for all the data after they're fetched.
	/** @type {[PathToData<"textureAtlasMappings", Data.TextureAtlasMappings>, PathToData<"blockShapes", Data.BlockShapes>, PathToData<"blockShapeGeos", Data.BlockShapeGeos>, PathToData<"blockStateDefinitions", Data.BlockStateDefinitions>, PathToData<"blockEigenvariants", Data.BlockEigenvariants>, PathToData<"materialListMappings", Data.MaterialListMappings>, PathToData<"itemIcons", Data.ItemIcons>]} */
	// @ts-expect-error
	let dataFileNames = ["textureAtlasMappings", "blockShapes", "blockShapeGeos", "blockStateDefinitions", "blockEigenvariants", "materialListMappings"];
	if(config.RETEXTURE_CONTROL_ITEMS) {
		// @ts-ignore
		dataFileNames.push("itemIcons");
	}
	// utility so I don't have to type _1234 or $9876 all the time for loading files below.
	const _ = {
		__: 0,
		get _() {
			return `_${this.__++}`;
		},
		$$: 0,
		get $() {
			return `$${this.$$++}`;
		}
	};
	let packTemplatePromise = loadPackTemplate({
		manifest: "manifest.json",
		hologramRenderControllers: "render_controllers/holoprint.hologram.render_controllers.json",
		hologramGeo: "models/entity/holoprint.hologram.geo.json", // this is where we put all the ghost blocks
		[_.$]: "materials/entity.material",
		hologramAnimationControllers: "animation_controllers/holoprint.hologram.animation_controllers.json",
		hologramAnimations: "animations/holoprint.hologram.animation.json",
		[_.$]: "particles/bounding_box_outline.json",
		blockValidationParticle: "particles/block_validation.json",
		[_.$]: "particles/saving_backup.json",
		singleWhitePixelTexture: "textures/particle/single_white_pixel.png",
		[_._]: "textures/particle/exclamation_mark.png",
		[_._]: "textures/particle/save_icon.png",
		itemTexture: config.RETEXTURE_CONTROL_ITEMS? "textures/item_texture.json" : undefined,
		terrainTexture: config.RETEXTURE_CONTROL_ITEMS? "textures/terrain_texture.json" : undefined,
		...(config.UI_CONTROLS_ENABLED? {
			[_._]: "textures/ui/toggle_rendering.png",
			[_._]: "textures/ui/change_opacity.png",
			[_._]: "textures/ui/increase_opacity.png",
			[_._]: "textures/ui/toggle_tint.png",
			[_._]: "textures/ui/toggle_validating.png",
			[_._]: "textures/ui/change_layer.png",
			[_._]: "textures/ui/increase_layer.png",
			[_._]: "textures/ui/decrease_layer.png",
			[_._]: "textures/ui/change_layer_mode.png",
			[_._]: "textures/ui/move_hologram_x.png",
			[_._]: "textures/ui/move_hologram_y.png",
			[_._]: "textures/ui/move_hologram_z.png",
			[_._]: "textures/ui/rotate_hologram.png",
			[_._]: "textures/ui/change_structure.png",
			[_._]: "textures/ui/backup_hologram.png",
			[_._]: "textures/ui/menu_sliders_icon.png",
			[_._]: "textures/ui/menu_button_unpressed.png",
			[_._]: "textures/ui/menu_button_pressed.png",
			[_._]: "textures/ui/material_list_button_unpressed.png",
			[_._]: "textures/ui/material_list_button_pressed.png",
			[_._]: "textures/ui/white_circle.png",
			[_.$]: "textures/ui/white_circle.json",
			[_._]: "textures/ui/quick_input_keyboard_hints.png",
			[_.$]: "ui/_ui_defs.json",
			[_.$]: "ui/_global_variables.json",
			[_.$]: "ui/hud_screen.json",
			materialListUI: "ui/holoprint_material_list.json",
			[_.$]: "ui/holoprint_keybinds.json",
			[_.$]: "ui/holoprint_touch_buttons.json",
			[_.$]: "ui/holoprint_common.json"
		} : {}),
		[_._]: "font/glyph_E2.png",
		languagesDotJson: "texts/languages.json"
	});
	let resourcesPromise = loadResources({
		entityFile: "entity/armor_stand.entity.json",
		blocksDotJson: "blocks.json",
		vanillaTerrainTexture: "textures/terrain_texture.json",
		flipbookTextures: "textures/flipbook_textures.json",
		defaultPlayerRenderControllers: config.PLAYER_CONTROLS_ENABLED? "render_controllers/player.render_controllers.json" : undefined,
		resourceItemTexture: config.RETEXTURE_CONTROL_ITEMS? "textures/item_texture.json" : undefined
	}, resourcePackStack);
	
	let controlsHaveBeenCustomised = JSON.stringify(config.CONTROLS) != JSON.stringify(DEFAULT_PLAYER_CONTROLS);
	let itemTagsPromise;
	if(controlsHaveBeenCustomised || config.RENAME_CONTROL_ITEMS || config.RETEXTURE_CONTROL_ITEMS) {
		itemTagsPromise = fetchers.bedrockData("item_tags.json").then(res => res.json());
	}
	
	let dataPromise = loadDataFiles(dataFileNames);
	let { languagesDotJson, bedrockMetadata } = await awaitAllEntries({
		languagesDotJson: packTemplatePromise.languagesDotJson,
		bedrockMetadata: loadBedrockMetadataFiles({
			blocks: "vanilladata_modules/mojang-blocks.json",
			items: "vanilladata_modules/mojang-items.json"
		})
	});
	let resourceLangFilesPromise = loadResources(Object.fromEntries(languagesDotJson.map(language => [language, `texts/${language}.lang`])), resourcePackStack);
	let packTemplateLangFilesPromise = loadPackTemplate(Object.fromEntries(languagesDotJson.map(language => [language, `texts/${language}.lang`]))).allValues;
	let translationLanguagesLoadingPromise = Promise.all(languagesDotJson.map(language => loadTranslationLanguage(language)));
	/** @type {[string, Blob][]} */
	let controlItemTextures = [];
	let hasModifiedTerrainTexture = false;
	let retexturingControlItemsPromise;
	if(config.RETEXTURE_CONTROL_ITEMS) {
		retexturingControlItemsPromise = itemTagsPromise.then(async itemTags => {
			({ controlItemTextures, hasModifiedTerrainTexture } = await retextureControlItems(config, await dataPromise.itemIcons, itemTags, await resourcesPromise.resourceItemTexture, await resourcesPromise.blocksDotJson, await resourcesPromise.vanillaTerrainTexture, resourcePackStack, await packTemplatePromise.itemTexture, await packTemplatePromise.terrainTexture));
		});
	}
	let packIcon = config.PACK_ICON_BLOB ?? await makePackIcon(concatenateFiles(structureFiles));
	
	let structures = nbts.map(nbt => nbt["structure"]);
	
	let palettesAndIndices = await Promise.all(structures.map(structure => tweakBlockPalette(structure, config.IGNORED_BLOCKS)));
	let { palette: blockPalette, indices: allStructureIndicesByLayer } = mergeMultiplePalettesAndIndices(palettesAndIndices);
	if(desparseArray(blockPalette).length == 0) {
		throw new UserError(`Structure is empty! No blocks are inside the structure.`);
	}
	console.log("combined palette: ", blockPalette);
	console.log("remapped indices: ", allStructureIndicesByLayer);
	// @ts-expect-error
	window.blockPalette = blockPalette;
	// @ts-expect-error
	window.blockIndices = allStructureIndicesByLayer;
	
	let data = await dataPromise.all;
	let entityGeoMaker = new EntityGeoMaker(resourcePackStack);
	let blockGeoMaker = new BlockGeoMaker(config, entityGeoMaker, data.blockShapes, data.blockShapeGeos, data.blockStateDefinitions, data.blockEigenvariants);
	// makePolyMeshTemplates() is an impure function and adds texture references to the textureRefs set property.
	let unresolvedPolyMeshTemplatePalette = await blockGeoMaker.makePolyMeshTemplates(blockPalette);
	console.info("Finished making block geometry templates!");
	console.log("Block geo maker:", blockGeoMaker);
	console.log("Poly mesh template palette:", structuredClone(unresolvedPolyMeshTemplatePalette));
	
	let { entityFile, defaultPlayerRenderControllers, blocksDotJson, vanillaTerrainTexture, flipbookTextures } = await resourcesPromise.allValues;
	let textureAtlas = new TextureAtlas(config, resourcePackStack, blocksDotJson, vanillaTerrainTexture, flipbookTextures, data.textureAtlasMappings);
	let textureRefs = Array.from(blockGeoMaker.textureRefs);
	await textureAtlas.makeAtlas(textureRefs); // each texture reference will get added to the textureUvs array property
	let textureBlobs = textureAtlas.imageBlobs;
	let defaultTextureIndex = max(textureBlobs.length - 3, 0); // default to 80% opacity
	
	console.log("Texture UVs:", textureAtlas.uvs);
	let polyMeshTemplatePalette = unresolvedPolyMeshTemplatePalette.map(polyMeshTemplate => BlockGeoMaker.resolveTemplateFaceUvs(polyMeshTemplate, textureAtlas));
	console.log("Poly mesh template palette with resolved UVs:", polyMeshTemplatePalette);
	
	let { manifest, hologramRenderControllers, hologramGeo, hologramAnimationControllers, hologramAnimations, blockValidationParticle, singleWhitePixelTexture, materialListUI } = await packTemplatePromise.allValues;
	
	let structureGeoTemplate = hologramGeo["minecraft:geometry"][0];
	hologramGeo["minecraft:geometry"].splice(0, 1);
	
	structureGeoTemplate["description"]["texture_width"] = textureAtlas.textureWidth;
	structureGeoTemplate["description"]["texture_height"] = textureAtlas.textureHeight;
	
	let entityDescription = entityFile["minecraft:client_entity"]["description"];
	
	let totalBlockCount = 0;
	let totalBlocksToValidateByStructure = [];
	let totalBlocksToValidateByStructureByLayer = [];
	let uniqueBlocksToValidate = new Set();
	let maxHeight = max(...structureSizes.map(structureSize => structureSize[1]));
	let layerIsEmpty = (new Array(maxHeight)).fill(true);
	
	let polyMeshMaker = new PolyMeshMaker(polyMeshTemplatePalette);
	let materialList = new MaterialList(bedrockMetadata.blocks, bedrockMetadata.items, data.materialListMappings);
	allStructureIndicesByLayer.forEach((structureIndicesByLayer, structureI) => {
		let structureSize = structureSizes[structureI];
		let geoShortName = `hologram_${structureI}`;
		let geoIdentifier = `geometry.holoprint.hologram_${structureI}`;
		let geo = structuredClone(structureGeoTemplate);
		geo["description"]["identifier"] = geoIdentifier;
		entityDescription["geometry"][geoShortName] = geoIdentifier;
		hologramRenderControllers["render_controllers"]["controller.render.holoprint.hologram"]["arrays"]["geometries"]["Array.geometries"].push(`Geometry.${geoShortName}`);
		let blocksToValidate = [];
		let blocksToValidateByLayer = [];
		
		for(let y = 0; y < structureSize[1]; y++) {
			let blocksToValidateCurrentLayer = 0; // "layer" in here refers to y-coordinate, NOT structure layer
			for(let x = 0; x < structureSize[0]; x++) {
				for(let z = 0; z < structureSize[2]; z++) {
					let blockI = (x * structureSize[1] + y) * structureSize[2] + z;
					let firstBoneForThisCoordinate = true; // second-layer blocks (e.g. water in waterlogged blocks) will be at the same position
					for(let layerI = 0; layerI < 2; layerI++) {
						let blockPaletteIndices = structureIndicesByLayer[layerI];
						let paletteI = blockPaletteIndices[blockI];
						if(!(paletteI in polyMeshTemplatePalette)) {
							if(paletteI in blockPalette) {
								console.error(`A poly mesh template wasn't made for blockPalette[${paletteI}] = ${blockPalette[paletteI]["name"]}!`);
							}
							continue;
						}
						
						let blockCoordinateName = `b_${x}_${y}_${z}`;
						let geoSpaceBlockPos = tuple([-16 * x - 8, 16 * y, 16 * z - 8]); // I got these values from trial and error with blockbench (which makes the x negative I think. it's weird.)
						polyMeshMaker.add(paletteI, geoSpaceBlockPos, layerI);
						if(firstBoneForThisCoordinate) { // we only need 1 locator for each block position, even though there may be 2 bones in this position because of the 2nd layer
							hologramGeo["minecraft:geometry"][2]["bones"][1]["locators"][blockCoordinateName] ??= geoSpaceBlockPos.map(x => x + 8); // 2nd geometry is for particle alignment
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
						layerIsEmpty[y] = false;
					}
				}
			}
			let layerName = `l_${y}`;
			let layerBone = {
				"name": layerName,
				"parent": "hologram_offset_wrapper",
				"pivot": [8, 0, -8],
				"poly_mesh": polyMeshMaker.export()
			};
			geo["bones"].push(layerBone);
			polyMeshMaker.clear();
			blocksToValidateByLayer.push(blocksToValidateCurrentLayer);
		}
		hologramGeo["minecraft:geometry"].push(geo);
		
		addBoundingBoxParticles(hologramAnimationControllers, structureI, structureSize);
		addBlockValidationParticles(hologramAnimationControllers, structureI, blocksToValidate, structureSize);
		totalBlocksToValidateByStructure.push(blocksToValidate.length);
		totalBlocksToValidateByStructureByLayer.push(blocksToValidateByLayer);
	});
	
	makeLayerAnimations(config, structureSizes, entityDescription, hologramAnimations, hologramAnimationControllers);
	if(config.SPAWN_ANIMATION_ENABLED) {
		let spawnAnimationMaker = new SpawnAnimationMaker(config, [1, maxHeight, 1]);
		for(let y = 0; y < maxHeight; y++) {
			if(!layerIsEmpty[y]) {
				let layerName = `l_${y}`;
				spawnAnimationMaker.addBone(layerName, [0, y, 0]);
			}
		}
		hologramAnimations["animations"]["animation.holoprint.hologram.spawn"] = spawnAnimationMaker.makeAnimation();
	}
	
	let structureSizesMolang = [
		arrayToMolang(structureSizes.map(structureSize => structureSize[0]), "v.hologram.structure_index"),
		arrayToMolang(structureSizes.map(structureSize => structureSize[1]), "v.hologram.structure_index"),
		arrayToMolang(structureSizes.map(structureSize => structureSize[2]), "v.hologram.structure_index")
	];
	let coordinateLockAxes = config.COORDINATE_LOCK && transposeMatrix(config.COORDINATE_LOCK);
	let coordinateLockCoordsMolang = config.COORDINATE_LOCK? coordinateLockAxes.slice(0, 3).map(axis => arrayToMolang(axis, "v.hologram.structure_index")) : ["0", "0", "0"];
	
	entityDescription["materials"]["hologram"] = "holoprint_hologram";
	entityDescription["materials"]["hologram.wrong_block_overlay"] = "holoprint_hologram.wrong_block_overlay";
	entityDescription["textures"]["hologram.overlay"] = "textures/entity/overlay";
	entityDescription["textures"]["hologram.save_icon"] = "textures/particle/save_icon";
	entityDescription["animations"]["hologram.align"] = "animation.holoprint.hologram.align";
	if(config.COORDINATE_LOCK) {
		entityDescription["animations"]["hologram.coordinate_lock"] = "animation.holoprint.hologram.coordinate_lock";
		let coordinateLockRotsMolang = arrayToMolang(coordinateLockAxes[3], "v.hologram.structure_index");
		hologramAnimations["animations"]["animation.holoprint.hologram.coordinate_lock"]["bones"]["hologram_offset_wrapper"]["rotation"][1] = coordinateLockRotsMolang;
		delete hologramAnimations["animations"]["animation.holoprint.hologram.offset"];
	} else {
		entityDescription["animations"]["hologram.offset"] = "animation.holoprint.hologram.offset";
		delete hologramAnimations["animations"]["animation.holoprint.hologram.coordinate_lock"];
	}
	entityDescription["animations"]["hologram.spawn"] = "animation.holoprint.hologram.spawn";
	entityDescription["animations"]["hologram.wrong_block_overlay"] = "animation.holoprint.hologram.wrong_block_overlay";
	entityDescription["animations"]["controller.hologram.spawn_animation"] = "controller.animation.holoprint.hologram.spawn_animation";
	entityDescription["animations"]["controller.hologram.layers"] = "controller.animation.holoprint.hologram.layers";
	entityDescription["animations"]["controller.hologram.bounding_box"] = "controller.animation.holoprint.hologram.bounding_box";
	entityDescription["animations"]["controller.hologram.block_validation"] = "controller.animation.holoprint.hologram.block_validation";
	entityDescription["animations"]["controller.hologram.saving_backup_particles"] = "controller.animation.holoprint.hologram.saving_backup_particles";
	entityDescription["scripts"]["animate"] ??= [];
	entityDescription["scripts"]["animate"].push("hologram.align", config.COORDINATE_LOCK? "hologram.coordinate_lock" : "hologram.offset", "hologram.wrong_block_overlay", "controller.hologram.spawn_animation", "controller.hologram.layers", "controller.hologram.bounding_box", "controller.hologram.block_validation", "controller.hologram.saving_backup_particles");
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
		structureSizesMolang,
		coordinateLockEnabled: !!config.COORDINATE_LOCK,
		coordinateLockCoordsMolang,
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
	entityDescription["geometry"]["hologram.wrong_block_overlay"] = "geometry.holoprint.hologram.wrong_block_overlay";
	entityDescription["geometry"]["hologram.valid_structure_overlay"] = "geometry.holoprint.hologram.valid_structure_overlay";
	entityDescription["geometry"]["hologram.particle_alignment"] = "geometry.holoprint.hologram.particle_alignment";
	entityDescription["render_controllers"] ??= [];
	entityDescription["render_controllers"].push({
		"controller.render.holoprint.hologram": "v.hologram.rendering"
	}, {
		"controller.render.holoprint.hologram.wrong_block_overlay": "v.hologram.show_wrong_block_overlay"
	}, {
		"controller.render.holoprint.hologram.valid_structure_overlay": "v.hologram.validating && v.wrong_blocks == 0"
	}, "controller.render.holoprint.hologram.particle_alignment");
	entityDescription["particle_effects"] ??= {};
	entityDescription["particle_effects"]["bounding_box_outline"] = "holoprint:bounding_box_outline";
	entityDescription["particle_effects"]["saving_backup"] = "holoprint:saving_backup";
	
	textureBlobs.forEach(([textureName]) => {
		entityDescription["textures"][textureName] = `textures/entity/${textureName}`;
		hologramRenderControllers["render_controllers"]["controller.render.holoprint.hologram"]["arrays"]["textures"]["Array.textures"].push(`Texture.${textureName}`);
	});
	
	let tintColorChannels = hexColorToClampedTriplet(config.TINT_COLOR);
	hologramRenderControllers["render_controllers"]["controller.render.holoprint.hologram"]["overlay_color"] = {
		"r": +tintColorChannels[0].toFixed(4),
		"g": +tintColorChannels[1].toFixed(4),
		"b": +tintColorChannels[2].toFixed(4),
		"a": `v.hologram.show_tint? ${config.TINT_OPACITY} : 0`
	};
	
	let overlayTexture = await setImageOpacity(singleWhitePixelTexture, config.WRONG_BLOCK_OVERLAY_COLOR[3]);
	
	// add the particles' short names, and then reference them in the animation controller
	uniqueBlocksToValidate.forEach(blockName => {
		let particleName = `validate_${blockName.replace(":", ".")}`;
		entityDescription["particle_effects"][particleName] = `holoprint:${particleName}`;
	});
	
	let playerRenderControllers = defaultPlayerRenderControllers && addPlayerControlsToRenderControllers(config, defaultPlayerRenderControllers);
	
	console.log("Block counts map:", materialList.materials);
	let resourceLangFiles = await resourceLangFilesPromise.allValues;
	let exportedMaterialLists = Object.fromEntries(languagesDotJson.map(language => {
		materialList.setLanguage(resourceLangFiles[language]); // we could make the material list export to multiple languages simultaneously, but I'm assuming here that there could be gaps between language files so they have to be done separately (for whatever reason... maybe international relations deteriorate and they refuse to translate the new update to Chinese... idk)
		return [language, materialList.export()];
	}));
	let exportedMaterialListEnglish = exportedMaterialLists["en_US"]; // all languages have the same translation keys, which are used in the material list UI. the translated item names (which are different for every language) are used in the pack description only.
	console.log("Exported material list:", exportedMaterialListEnglish);
	
	// console.log(partitionedBlockCounts);
	let highestItemCount;
	if(config.UI_CONTROLS_ENABLED) {
		addMaterialListUI(exportedMaterialListEnglish, materialListUI, bedrockMetadata.blocks);
		highestItemCount = max(...exportedMaterialListEnglish.map(({ count }) => count));
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
	
	let itemTags = await itemTagsPromise;
	let inGameControls, controlItemTranslations;
	if(controlsHaveBeenCustomised || config.RENAME_CONTROL_ITEMS) {
		await translationLanguagesLoadingPromise;
		({ inGameControls, controlItemTranslations } = translateControlItems(config, bedrockMetadata.blocks, bedrockMetadata.items, data.materialListMappings, resourceLangFiles, itemTags));
	}
	
	let packTemplateLangFiles = await packTemplateLangFilesPromise;
	let langFiles = makeLangFiles(config, packTemplateLangFiles, packName, materialList, exportedMaterialLists, controlsHaveBeenCustomised, inGameControls, controlItemTranslations);
	
	await retexturingControlItemsPromise;
	
	console.info("Finished making all pack files!");
	
	const zipComment = Symbol("add comment to file entries");
	let packFiles = await packTemplatePromise.allEntries;
	if(structureFiles.length == 1) {
		structureFiles[0][zipComment] = structureFiles[0].name;
		packFiles[".mcstructure"] = structureFiles[0];
	} else {
		structureFiles.forEach((structureFile, i) => {
			structureFile[zipComment] = structureFile.name;
			packFiles[`${i}.mcstructure`] = structureFile;
		});
	}
	packFiles["pack_icon.png"] = packIcon;
	let entityFileJson = JSON.stringify(entityFile);
	packFiles["entity/armor_stand.entity.json"] = entityFileJson.replaceAll("HOLOGRAM_INITIAL_ACTIVATION", "true");
	packFiles["subpacks/punch_to_activate/entity/armor_stand.entity.json"] = entityFileJson.replaceAll("HOLOGRAM_INITIAL_ACTIVATION", "false");
	if(config.PLAYER_CONTROLS_ENABLED) {
		packFiles["render_controllers/player.render_controllers.json"] = playerRenderControllers;
	}
	delete packFiles["particles/block_validation.json"]; // this one is only a template, used below
	uniqueBlocksToValidate.forEach(blockName => {
		let particleName = `validate_${blockName.replace(":", ".")}`; // file names can't have : in them
		let particle = structuredClone(blockValidationParticle);
		particle["particle_effect"]["description"]["identifier"] = `holoprint:${particleName}`;
		particle["particle_effect"]["components"]["minecraft:particle_expire_if_in_blocks"] = [blockName.includes(":")? blockName : `minecraft:${blockName}`]; // add back minecraft: namespace if it's missing
		packFiles[`particles/${particleName}.json`] = particle;
	});
	packFiles["textures/entity/overlay.png"] = overlayTexture;
	textureBlobs.forEach(([textureName, blob]) => {
		packFiles[`textures/entity/${textureName}.png`] = blob;
	});
	if(config.RETEXTURE_CONTROL_ITEMS) {
		if(!hasModifiedTerrainTexture) {
			delete packFiles["textures/terrain_texture.json"];
		}
		controlItemTextures.forEach(([fileName, imageBlob]) => {
			packFiles[fileName] = imageBlob;
		});
	}
	if(config.UI_CONTROLS_ENABLED && highestItemCount < 1728) {
		delete packFiles["font/glyph_E2.png"];
	}
	langFiles.forEach(([language, langFile]) => {
		packFiles[`texts/${language}.lang`] = langFile;
	});
	
	let packFileWriter = new BlobWriter();
	let zipWriter = new ZipWriter(packFileWriter);
	await Promise.all(Object.entries(packFiles).map(async ([fileName, fileContents]) => {
		let comment = fileContents[zipComment];
		/** @type {ZipWriterAddDataOptions} */
		let options = {
			comment,
			level: config.COMPRESSION_LEVEL
		};
		if(fileContents instanceof HTMLImageElement) {
			fileContents = await toBlob(fileContents);
		}
		if(fileContents instanceof Blob) {
			return zipWriter.add(fileName, new BlobReader(fileContents), options);
		}
		if(typeof fileContents == "object") {
			fileContents = JSON.stringify(fileContents)
		}
		return zipWriter.add(fileName, new TextReader(fileContents), options);
	}));
	let zippedPack = await zipWriter.close();
	
	console.info(`Finished creating pack in ${+(performance.now() - startTime).toFixed(0) / 1000}s!`);
	
	if(previewCont) {
		let showPreview = async () => {
			let previews = await Promise.all(structureSizes.map(async (structureSize, structureI) => {
				if(structureI > 0) {
					previewCont.parentNode.appendChild(document.createElement("hr"));
				}
				let cont = structureI == 0? previewCont : previewCont.parentNode.appendChild(previewCont.cloneNode());
				let name = structureSizes.length == 1? packName : getDefaultPackName([structureFiles[structureI]]);
				return await PreviewRenderer.new(cont, name, textureAtlas, structureSize, blockPalette, polyMeshTemplatePalette, allStructureIndicesByLayer[structureI], {
					showSkybox: config.SHOW_PREVIEW_SKYBOX,
					showFps: config.SHOW_PREVIEW_WIDGETS,
					showOptions: config.SHOW_PREVIEW_WIDGETS
				});
			}));
			previewLoadedCallback?.(previews);
		};
		if(totalBlockCount < config.PREVIEW_BLOCK_LIMIT && removeFalsies(blockPalette).length < 250) {
			showPreview();
		} else {
			let message = document.createElement("div");
			message.classList.add("previewMessage", "clickToView");
			let p = document.createElement("p");
			p.dataset.translationSubTotalBlockCount = totalBlockCount.toString();
			if(structureFiles.length == 1) {
				p.dataset.translate = "preview.click_to_view";
			} else {
				p.dataset.translate = "preview.click_to_view_multiple";
			}
			message.appendChild(p);
			message[onEvent]("click", () => {
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
 * @returns {Promise<File[]>}
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
	let structureFiles = await extractStructureFilesFromPack(resourcePack);
	if(!structureFiles.length) {
		throw new UserError(`No structure files found inside resource pack ${resourcePack.name}; cannot update pack!`);
	}
	return await makePack(structureFiles, config, resourcePackStack, previewCont);
}
/**
 * Returns the default pack name that would be used if no pack name is specified.
 * @param {File[]} structureFiles
 * @returns {string}
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
 * @param {string} description
 * @returns {[string, string][]}
 */
export function findLinksInDescription(description) {
	let links = [];
	Array.from(description.matchAll(/(.*?)\n?\s*(https?:\/\/[^\s]+)/g)).forEach(match => {
		let label = match[1].trim();
		let url = match[2].trim();
		links.push([label, url]);
	});
	return links;
}
/**
 * Creates an ItemCriteria from arrays of names and tags.
 * @param {string | string[]} names
 * @param {string | string[]} [tags]
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
			UI_CONTROLS_ENABLED: true,
			RETEXTURE_CONTROL_ITEMS: true,
			CONTROL_ITEM_TEXTURE_SCALE: 1,
			RENAME_CONTROL_ITEMS: true,
			WRONG_BLOCK_OVERLAY_COLOR: tuple([1, 0, 0, 0.3]),
			INITIAL_OFFSET: tuple([0, 0, 0]),
			COORDINATE_LOCK: undefined,
			BACKUP_SLOT_COUNT: 10,
			PACK_NAME: undefined,
			PACK_ICON_BLOB: undefined,
			AUTHORS: [],
			DESCRIPTION: undefined,
			COMPRESSION_LEVEL: 5, // level 9 was 8 bytes larger than level 5 when I tested... :0
			PREVIEW_BLOCK_LIMIT: 2500,
			SHOW_PREVIEW_SKYBOX: true,
			SHOW_PREVIEW_WIDGETS: true
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
/** Reads the NBT of a structure file, returning a JSON object. */
export const readStructureNBT = cacheUnaryFunc(
	/**
	 * @param {File} structureFile `*.mcstructure`
	 * @returns {Promise<MCStructure>}
	 */
	async structureFile => {
		let arrayBuffer = await structureFile.arrayBuffer().catch(e => {
			throw new Error(`Could not read contents of structure file "${structureFile.name}"!\n${e}`);
		});
		if(structureFile.size == 0) { // this check must happen after reading the bytes, otherwise Google Drive files can't be read on Android Chrome: https://issues.chromium.org/issues/40123366#comment104
			throw new UserError(`"${structureFile.name}" is an empty file! Please try exporting your structure again.\nIf you play on a version below 1.20.50, exporting to OneDrive will cause your structure file to be empty.`);
		}
		try {
			return await readStructureNBTWithOptions(structureFile, arrayBuffer, {
				endian: "little", // true .mcstructure files are little-endian
				strict: false // some files have duplicated sections, which makes strict mode throw an error: #68
			});
		} catch(e) {
			console.warn(`Structure file ${structureFile.name} couldn't be read with default .mcstructure NBT read settings. Trying generic settings...`);
			console.debug(e);
			return await readStructureNBTWithOptions(structureFile, arrayBuffer); // if the .mcstructure was generated from an external source, it's best to try with generic NBT read settings
		}
	}
);

/**
 * Reads the NBT of a structure file, returning a JSON object.
 * @param {File} structureFile `*.mcstructure`
 * @param {ArrayBuffer} arrayBuffer
 * @param {Partial<NBT.ReadOptions>} [options]
 * @returns {Promise<MCStructure>}
 */
async function readStructureNBTWithOptions(structureFile, arrayBuffer, options = {}) {
	let nbtRes = await NBT.read(arrayBuffer, options).catch(e => {
		if(e instanceof NBT.InvalidTagError) {
			throw new UserError(`"${structureFile.name}" is not a .mcstructure file! Please look at the tutorial on the wiki: https://holoprint-mc.github.io/wiki/creating-packs`);
		}
		throw new Error(`Invalid NBT in structure file "${structureFile.name}"!\n${e}`);
	});
	let nbt = nbtRes.data;
	if(!isNBTValidMcstructure(nbt)) {
		let errorMessage = getInvalidMcstructureErrorMessage(structureFile, nbt);
		throw new UserError(errorMessage);
	}
	return nbt;
}
/**
 * Checks if a NBT object is valid .mcstructure NBT.
 * @param {NBT.RootTag} nbt
 * @returns {nbt is MCStructure}
 */
function isNBTValidMcstructure(nbt) {
	return nbt["format_version"] == 1 && nbt["size"] instanceof Int32Array && nbt["size"].length == 3 && "structure" in nbt && nbt["structure_world_origin"] instanceof Int32Array && nbt["structure_world_origin"].length == 3;
}
/**
 * Gets the error message for a NBT file that isn't .mcstructures.
 * @param {File} structureFile
 * @param {NBT.RootTag} nbt
 * @returns {string}
 */
function getInvalidMcstructureErrorMessage(structureFile, nbt) {
	let offendingStructureName = removeFileExtension(structureFile.name);
	let errorMessage = `Structure ${offendingStructureName} is not a valid .mcstructure file!`;
	const otherNBTFileTypes = {
		"MinecraftDataVersion": "litematic",
		"TileEntities": "schematic",
		"Metadata": "schem", // Sponge format
		"DataVersion": "nbt"
	};
	let probableSourceFileExtension = Object.entries(otherNBTFileTypes).find(([key]) => key in nbt)?.[1];
	if(probableSourceFileExtension) {
		errorMessage += `\nNote: Renaming .${probableSourceFileExtension} to .mcstructure doesn't work, you must create the structure file from inside Minecraft Bedrock! Minecraft Java structures aren't the same as Minecraft Bedrock structures!`;
	}
	return errorMessage;
}
/**
 * @template {string} F
 * @template {string} [N = ""]
 * @typedef {N extends `_${string}`? Blob : F extends `${string}.json` | `${string}.material`? object : F extends `${string}.lang`? string : F extends `${string}.png`? HTMLImageElement : never} GetFileType
 */
/**
 * @template {Record<string, string>} T
 * @param {{ [K in keyof T]: T[K] }} packTemplateFiles
 */
function loadPackTemplate(packTemplateFiles) {
	return multiload(packTemplateFiles, path => fetch(`packTemplate/${path}`));
}
/**
 * @template {Record<string, string>} T
 * @param {{ [K in keyof T]: T[K] }} resourceFiles
 * @param {ResourcePackStack} resourcePackStack
 */
function loadResources(resourceFiles, resourcePackStack) {
	return multiload(resourceFiles, path => resourcePackStack.fetchResource(path));
}

/**
 * @template {Record<string, string>} T
 * @param {{ [K in keyof T]: T[K] }} fileNamesAndPaths
 * @param {(filePath: string) => Promise<Response>} fetchFunc
 * @returns {{ [K in keyof T]: Promise<GetFileType<T[K], K>> } & { allValues: Promise<{ [K in keyof T]: GetFileType<T[K], K> }>, allEntries: Promise<{ [K in keyof T as T[K]]: GetFileType<T[K], K> }> }}
 */
function multiload(fileNamesAndPaths, fetchFunc) {
	let entries = Object.entries(fileNamesAndPaths).filter(([, path]) => path);
	let contents = Object.fromEntries(entries.map(([name, path]) => [name, getResponseContents(fetchFunc(path), path, name.startsWith("_"))]));
	// @ts-ignore
	return {
		...contents,
		allValues: awaitAllEntries(contents),
		allEntries: Promise.all(entries.map(async ([name, path]) => [path, await contents[name]])).then(res => Object.fromEntries(res))
	};
}
/**
 * @template N
 * @template D
 * @typedef {object} PathToData
 * @property {N} dataName
 * @property {D} data
*/
/**
 * @template {PathToData<any, any>[]} T
 * @param {T} fileNames
 * @returns {{ [K in T[number] as K["dataName"]]: Promise<K["data"]> } & { all: Promise<{ [K in T[number] as K["dataName"]]: K["data"] }> }}
 */
function loadDataFiles(fileNames) {
	let res = Object.fromEntries(fileNames.map(fileName => [fileName, fetch(`data/${fileName}.json`).then(res => jsonc(res))]));
	res.all = awaitAllEntries(res);
	return res;
}
/**
 * @template T
 * @param {T} files
 * @returns {Promise<Record<keyof T, object>>}
 */
async function loadBedrockMetadataFiles(files) {
	let fileNamesAndContents = await Promise.all(Object.entries(files).map(async ([shortName, fileName]) => [shortName, await fetchers.vanillaData(`metadata/${fileName}`).then(res => jsonc(res))]));
	return Object.fromEntries(fileNamesAndContents);
}
/**
 * Gets the contents of a response based on the requested file extension (e.g. object from .json, image from .png, etc.).
 * @template {string} T
 * @template {boolean} B
 * @param {Promise<Response>} resPromise
 * @param {T} filePath
 * @param {B} [rawBlob] Whether to return a Blob instead of converting to a more usable object.
 * @returns {Promise<B extends true? Blob : GetFileType<T>>}
 */
async function getResponseContents(resPromise, filePath, rawBlob) {
	let res = await resPromise;
	if(res.status >= 400) {
		throw new Error(`HTTP error ${res.status} for ${res.url}`);
	}
	if(rawBlob) {
		// @ts-expect-error
		return await res.blob();
	}
	let fileExtension = getFileExtension(filePath);
	switch(fileExtension) {
		case "json":
		case "material": return await jsonc(res);
		// @ts-ignore
		case "lang": return await res.text();
		// @ts-ignore
		case "png": return await toImage(res);
	}
}
/**
 * Removes ignored blocks from the block palette, updates old blocks, and adds block entities as separate entries.
 * @param {MCStructure["structure"]} structure The de-NBT-ed structure file
 * @param {string[]} ignoredBlocks
 * @returns {Promise<{ palette: Block[], indices: [Int32Array, Int32Array] }>}
 */
async function tweakBlockPalette(structure, ignoredBlocks) {
	let palette = structuredClone(structure["palette"]["default"]["block_palette"]);
	
	let blockVersions = new Set(); // version should be constant for all blocks. just wanted to test this
	let blockUpdater = new BlockUpdater();
	let updatedBlocks = 0;
	for(let [i, block] of Object.entries(palette)) {
		blockVersions.add(block["version"]);
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
	let blockVersionsStringified = Array.from(blockVersions).map(v => BlockUpdater.parseBlockVersion(v).join("."));
	if(updatedBlocks > 0) {
		console.info(`Updated ${updatedBlocks} block${updatedBlocks > 1? "s" : ""} from ${blockVersionsStringified.join(", ")} to ${BlockUpdater.parseBlockVersion(BlockUpdater.LATEST_VERSION).join(".")}!`);
		console.info(`Note: Updated blocks may not be 100% accurate! If there are some errors, try loading the structure in the latest version of Minecraft then saving it again, so all blocks are up to date.`);
	}
	console.log("Block versions:", Array.from(blockVersions), blockVersionsStringified);
	
	// add block entities into the block palette (on layer 0)
	let indices = structure["block_indices"];
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
 * @param {{palette: Block[], indices: [Int32Array, Int32Array]}[]} palettesAndIndices
 * @returns {{palette: Block[], indices: [Int32Array, Int32Array][]}}
 */
function mergeMultiplePalettesAndIndices(palettesAndIndices) {
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
		palette: Array.from(mergedPaletteSet),
		indices: remappedIndices
	};
}
/**
 * Makes the layer animations and animation controllers. Mutates the original arguments.
 * @param {HoloPrintConfig} config
 * @param {I32Vec3[]} structureSizes
 * @param {object} entityDescription
 * @param {object} hologramAnimations
 * @param {object} hologramAnimationControllers
 */
function makeLayerAnimations(config, structureSizes, entityDescription, hologramAnimations, hologramAnimationControllers) {
	let layerAnimationStates = hologramAnimationControllers["animation_controllers"]["controller.animation.holoprint.hologram.layers"]["states"];
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
	
	for(let y = 0; y <= topLayer; y++) {
		let layerName = `l_${y}`;
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
		let layerAnimation = {
			"loop": "hold_on_last_frame",
			"bones": {}
		};
		for(let otherLayerY = 0; otherLayerY <= topLayer; otherLayerY++) {
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
		hologramAnimations["animations"][`animation.holoprint.hologram.l_${y}`] = layerAnimation;
		entityDescription["animations"][`hologram.l_${y}`] = `animation.holoprint.hologram.l_${y}`;
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
			let layerAnimationAllBelow = {
				"loop": "hold_on_last_frame",
				"bones": {}
			};
			for(let otherLayerY = 0; otherLayerY <= topLayer; otherLayerY++) {
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
			hologramAnimations["animations"][`animation.holoprint.hologram.l_${y}-`] = layerAnimationAllBelow;
			entityDescription["animations"][`hologram.l_${y}-`] = `animation.holoprint.hologram.l_${y}-`;
		}
	}
}
/**
 * Adds bounding box particles for a single structure to the hologram animation controllers in-place.
 * @param {Record<string, any>} hologramAnimationControllers
 * @param {number} structureI
 * @param {I32Vec3} structureSize
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
	hologramAnimationControllers["animation_controllers"]["controller.animation.holoprint.hologram.bounding_box"]["states"][animationStateName] = boundingBoxAnimation;
	hologramAnimationControllers["animation_controllers"]["controller.animation.holoprint.hologram.bounding_box"]["states"]["hidden"]["transitions"].push({
		[animationStateName]: `v.hologram.rendering && v.hologram.structure_index == ${structureI}`
	});
}
/**
 * Adds block validation particles for a single structure to the hologram animation controllers in-place.
 * @param {Record<string, any>} hologramAnimationControllers
 * @param {number} structureI
 * @param {Record<string, any>[]} blocksToValidate
 * @param {I32Vec3} structureSize
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
	let validationStates = hologramAnimationControllers["animation_controllers"]["controller.animation.holoprint.hologram.block_validation"]["states"];
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
 * @param {Record<string, any>} defaultPlayerRenderControllers
 * @returns {Record<string, any>}
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
 * @param {Record<string, any>} renderControllers
 * @param {Record<string, any>} patches
 * @returns {Record<string, any>}
 */
function patchRenderControllers(renderControllers, patches) {
	return {
		"format_version": renderControllers["format_version"],
		"render_controllers": Object.fromEntries(removeFalsies(Object.entries(patches).map(([controllerId, patch]) => {
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
		})))
	};
}
/**
 * Adds the material list to the `holoprint_material_list.json` UI file.
 * @param {MaterialListEntry[]} finalisedMaterialList
 * @param {object} materialListUI
 * @param {object} blockMetadata
 */
function addMaterialListUI(finalisedMaterialList, materialListUI, blockMetadata) {
	let missingItemAux = blockMetadata["data_items"].find(block => block.name == "minecraft:reserved6")?.["raw_id"] ?? 0;
	materialListUI["entries"]["controls"].push(...finalisedMaterialList.map(({ translationKey, partitionedCount, auxId }, i) => ({
		[`entry_${i}@holoprint:material_list.entry`]: {
			"$item_translation_key": translationKey,
			"$item_count": partitionedCount,
			"$item_id_aux": auxId ?? missingItemAux,
			"$background_opacity": i & 1? 0.2 : undefined
		}
	})));
	let longestItemNameLength = max(...finalisedMaterialList.map(({ translatedName }) => translatedName.length));
	let longestCountLength = max(...finalisedMaterialList.map(({ partitionedCount }) => partitionedCount.length));
	if(longestItemNameLength + longestCountLength >= 43) {
		materialListUI["content"]["size"][0] = "50%"; // up from 40%
		materialListUI["content"]["max_size"][0] = "50%";
	}
	materialListUI["content"]["size"][1] = finalisedMaterialList.length * 12 + 12; // 12px for each item + 12px for the heading
	materialListUI["entry"]["controls"][0]["content"]["controls"][3]["item_name"]["size"][0] += `${round(longestCountLength * 4.2 + 10)}px`;
}
/**
 * Translates control items by making a fake material list.
 * @param {HoloPrintConfig} config
 * @param {Record<string, any>} blockMetadata
 * @param {Record<string, any>} itemMetadata
 * @param {Data.MaterialListMappings} materialListMappings
 * @param {Record<string, string>} resourceLangFiles
 * @param {Record<string, string[]>} itemTags
 * @returns {{ inGameControls: Record<string, string>, controlItemTranslations: Record<string, string> }}
 */
function translateControlItems(config, blockMetadata, itemMetadata, materialListMappings, resourceLangFiles, itemTags) {
	// make a fake material list for the in-game control items (just to translate them lol)
	let controlsMaterialList = new MaterialList(blockMetadata, itemMetadata, materialListMappings);
	/** @type {Record<string, string>} */
	let inGameControls = {};
	/** @type {Record<string, string>} */
	let controlItemTranslations = {};
	Object.entries(resourceLangFiles).forEach(([language, resourceLangFile]) => {
		inGameControls[language] = "";
		let translatedControlNames = {};
		let translatedControlItems = {};
		/** @type {Record<string, Set<string>>} */
		let controlItemTranslationKeys = {};
		controlsMaterialList.setLanguage(resourceLangFile);
		Object.entries(config.CONTROLS).forEach(([control, itemCriteria]) => {
			controlsMaterialList.clear();
			itemCriteria["names"].forEach(itemName => controlsMaterialList.addItem(itemName));
			
			let itemInfo = controlsMaterialList.export();
			let translatedControlName = translate(PLAYER_CONTROL_NAMES[control], language);
			translatedControlNames[control] = translatedControlName;
			inGameControls[language] += `\n${translatedControlName}: ${removeFalsies([itemInfo.map(item => `§3${item.translatedName}§r`).join(", "), itemCriteria.tags.map(tag => `§p${tag}§r`).join(", ")]).join("; ")}`;
			
			let itemsInTags = removeFalsies(itemCriteria.tags.filter(tag => !tag.includes(":")).map(tag => itemTags[`minecraft:${tag}`])).flat().map(itemName => itemName.replace(/^minecraft:/, ""));
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
 * Makes the `.lang` files for each language.
 * @param {HoloPrintConfig} config
 * @param {Record<string, string>} packTemplateLangFiles
 * @param {string} packName
 * @param {MaterialList} materialList
 * @param {Record<string, MaterialListEntry[]>} exportedMaterialLists
 * @param {boolean} controlsHaveBeenCustomised
 * @param {Record<string, string>} inGameControls
 * @param {Record<string, string>} controlItemTranslations
 * @returns {[string, string][]}
 */
function makeLangFiles(config, packTemplateLangFiles, packName, materialList, exportedMaterialLists, controlsHaveBeenCustomised, inGameControls, controlItemTranslations) {
	const disabledFeatureTranslations = { // these look at the .lang RP files
		"SPAWN_ANIMATION_ENABLED": "spawn_animation_disabled",
		"PLAYER_CONTROLS_ENABLED": "player_controls_disabled",
		"UI_CONTROLS_ENABLED": "ui_controls_disabled",
		"RETEXTURE_CONTROL_ITEMS": "retextured_control_items_disabled",
		"RENAME_CONTROL_ITEMS": "renamed_control_items_disabled"
	};
	let packGenerationTime = (new Date()).toLocaleString();
	let totalMaterialCount = materialList.totalMaterialCount;
	return Object.entries(packTemplateLangFiles).map(([language, langFile]) => {
		langFile = langFile.replaceAll("\r\n", "\n"); // I hate windows sometimes (actually quite often now because of windows 11)
		langFile = langFile.replaceAll("{PACK_NAME}", packName);
		langFile = langFile.replaceAll("{PACK_GENERATION_TIME}", packGenerationTime);
		langFile = langFile.replaceAll("{TOTAL_MATERIAL_COUNT}", totalMaterialCount.toString());
		langFile = langFile.replaceAll("{MATERIAL_LIST}", exportedMaterialLists[language].map(({ translatedName, count }) => `${count} ${translatedName}`).join(", "));
		
		// now substitute in the extra bits into the main description if needed
		if(config.AUTHORS.length) {
			langFile = langFile.replaceAll(/\{STRUCTURE_AUTHORS\[([^)]+)\]\}/g, (_, delimiter) => config.AUTHORS.join(delimiter));
			langFile = langFile.replaceAll("{AUTHORS_SECTION}", langFile.match(/pack\.description\.authors=([^\t#\n]+)/)[1]);
		} else {
			langFile = langFile.replaceAll("{AUTHORS_SECTION}", "");
		}
		if(config.DESCRIPTION) {
			langFile = langFile.replaceAll("{DESCRIPTION}", config.DESCRIPTION.replaceAll("\n", "\\n"));
			langFile = langFile.replaceAll("{DESCRIPTION_SECTION}", langFile.match(/pack\.description\.description=([^\t#\n]+)/)[1]);
		} else {
			langFile = langFile.replaceAll("{DESCRIPTION_SECTION}", "");
		}
		let translatedDisabledFeatures = Object.entries(disabledFeatureTranslations).filter(([feature]) => !config[feature]).map(([_, translationKey]) => langFile.match(new RegExp(`pack\\.description\\.${translationKey}=([^\\t#\\n]+)`))[1]).join("\\n");
		if(translatedDisabledFeatures) {
			langFile = langFile.replaceAll("{DISABLED_FEATURES}", translatedDisabledFeatures);
			langFile = langFile.replaceAll("{DISABLED_FEATURES_SECTION}", langFile.match(/pack\.description\.disabled_features=([^\t#\n]+)/)[1]);
		} else {
			langFile = langFile.replaceAll("{DISABLED_FEATURES_SECTION}", "");
		}
		if(controlsHaveBeenCustomised) {
			langFile = langFile.replaceAll("{CONTROLS}", inGameControls[language].replaceAll("\n", "\\n"));
			langFile = langFile.replaceAll("{CONTROLS_SECTION}", langFile.match(/pack\.description\.controls=([^\t#\n]+)/)[1]);
		} else {
			langFile = langFile.replaceAll("{CONTROLS_SECTION}", "");
		}
		
		langFile = langFile.replaceAll(/pack\.description\..+\s*/g, ""); // remove all the description template sections
		langFile = langFile.replaceAll(/\t*#.+/g, ""); // remove comments
		
		// add the control name translations for the keyboard UI
		["toggle_rendering", "change_opacity", "toggle_tint", "change_layer", "decrease_layer", "change_layer_mode", "toggle_validating", "rotate_hologram", "change_structure", "backup_hologram"].forEach(actionName => {
			langFile += `\nholoprint.controls.${actionName}=${translate(`player_controls.${actionName}`, language)}`;
		});
		
		if(config.RENAME_CONTROL_ITEMS) {
			langFile += controlItemTranslations[language];
		}
		
		return [language, langFile];
	});
}
/**
 * Retextures the control items. Modifies `itemTexture` and `terrainTexture`.
 * @param {HoloPrintConfig} config
 * @param {Data.ItemIcons} itemIcons
 * @param {Record<string, string[]>} itemTags
 * @param {object} resourceItemTexture `RP/textures/item_texture.json`
 * @param {object} blocksDotJson
 * @param {object} vanillaTerrainTexture
 * @param {ResourcePackStack} resourcePackStack
 * @param {object} itemTexture
 * @param {object} terrainTexture
 * @returns {Promise<{ controlItemTextures: [string, Blob][], hasModifiedTerrainTexture: boolean }>}
 */
async function retextureControlItems(config, itemIcons, itemTags, resourceItemTexture, blocksDotJson, vanillaTerrainTexture, resourcePackStack, itemTexture, terrainTexture) {
	let controlItemTextures = [];
	let hasModifiedTerrainTexture = false;
	let legacyItemMappings;
	let loadingLegacyItemMappingsPromise;
	let itemIconPatterns = Object.entries(itemIcons).filter(([key]) => key.startsWith("/") && key.endsWith("/")).map(([pattern, itemName]) => [new RegExp(pattern.slice(1, -1), "g"), itemName]);
	await Promise.all(Object.entries(config.CONTROLS).map(async ([control, itemCriteria]) => {
		let controlTexturePath = `textures/items/~${control.toLowerCase()}.png`; // because texture compositing works alphabetically not in array order, the ~ forces the control texture to always go on top of the actual item texture
		let controlTexturePromise = fetch(`packTemplate/${controlTexturePath}`).then(res => toImage(res));
		let paddedTexturePromise = controlTexturePromise.then(controlTexture => addPaddingToImage(controlTexture, { // make it small in the top-left corner
			right: 16,
			bottom: 16
		}));
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
			} else if(itemName in blocksDotJson) {
				if(typeof blocksDotJson[itemName]["carried_textures"] == "string" && vanillaTerrainTexture["texture_data"][blocksDotJson[itemName]["carried_textures"]]["textures"].startsWith?.("textures/items/")) {
					hasModifiedTerrainTexture = true;
					usingTerrainAtlas = true;
					originalTexturePath = vanillaTerrainTexture["texture_data"][blocksDotJson[itemName]["carried_textures"]]["textures"];
					itemName = blocksDotJson[itemName]["carried_textures"];
				} else {
					console.warn(`Cannot retexture control item "${itemName}" because it is a block, and retexturing block items is currently unsupported.`);
					return;
				}
			} else {
				loadingLegacyItemMappingsPromise ??= fetchers.bedrockData("r16_to_current_item_map.json").then(res => res.json()).then(updateMappings => {
					// these mappings are from the old ids to the new ids. we want to go the other way, because bugrock still uses some old ids in item_texture.json
					legacyItemMappings = new Map();
					Object.entries(updateMappings["simple"]).forEach(([oldName, newName]) => {
						legacyItemMappings.set(newName.slice(10), [oldName.slice(10), -1]); // first 10 characters are "minecraft:"
					});
					Object.entries(updateMappings["complex"]).forEach(([oldName, newNames]) => { // complex mappings have indices, used in boats among others
						Object.entries(newNames).forEach(([index, newName]) => {
							legacyItemMappings.set(newName.slice(10), [oldName.slice(10), index]);
						});
					});
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
					"textures": Array.from(originalTexturePath) // clone the whole thing here. this is so we can edit it directly, which means that if we're modifying multiple textures in the same array all can be applied.
				};
				let specificOriginalTexturePath = `${itemTexture["texture_data"][itemName]["textures"][variant]}.png`;
				let originalImage;
				try {
					originalImage = await resourcePackStack.fetchResource(specificOriginalTexturePath).then(res => toImage(res));
				} catch(e) {
					console.warn(`Failed to load texture ${specificOriginalTexturePath} for control item retexturing!`);
					return;
				}
				let overlayedImageBlob = await overlaySquareImages(originalImage, await paddedTexturePromise);
				let newTexturePath = `${specificOriginalTexturePath.slice(0, -4)}_${control.toLowerCase()}.png`;
				controlItemTextures.push([newTexturePath, overlayedImageBlob]);
				itemTexture["texture_data"][itemName]["textures"][variant] = newTexturePath.slice(0, -4);
				console.debug(`Overlayed control texture for ${control} onto ${specificOriginalTexturePath}`);
			} else {
				let itemTextureSize = 16;
				if(resourcePackStack.hasResourcePacks) {
					try {
						let originalImage = await resourcePackStack.fetchResource(`${originalTexturePath}.png`).then(res => toImage(res));
						itemTextureSize = originalImage.width;
					} catch(e) {
						console.warn(`Could not load item texture ${originalTexturePath} for overlay texture scaling calculations!`, e);
					}
				}
				let safeSize = lcm((await paddedTexturePromise).width, itemTextureSize) * config.CONTROL_ITEM_TEXTURE_SCALE; // When compositing textures, MCBE scales all textures to the maximum, so the size of the overlay control texture has to be the LCM of itself and in-game items. Hence, if in-game items have a higher resolution than expected, they will probably be scaled wrong. The control item texture scale setting will scale them more (but they get reaaaaally big and make the item texture atlas huuuge)
				controlItemTextureSizes.add(safeSize);
				(usingTerrainAtlas? terrainTexture : itemTexture)["texture_data"][itemName] = {
					"textures": [originalTexturePath, `${controlTexturePath.slice(0, -4)}_${safeSize}`],
					"additive": true // texture compositing means resource packs that change the item textures will still work
				};
			}
		}));
		await Promise.all(Array.from(controlItemTextureSizes).map(async size => {
			let resizedImagePath = `${controlTexturePath.slice(0, -4)}_${size}.png`;
			let resizedTextureBlob = await resizeImageToBlob(await paddedTexturePromise, size);
			controlItemTextures.push([resizedImagePath, resizedTextureBlob]);
		}));
	}));
	return { controlItemTextures, hasModifiedTerrainTexture };
}
/**
 * Makes a blob for pack_icon.png based on a structure file's SHA256 hash
 * @param {File} structureFile
 * @returns {Promise<Blob>}
 */
async function makePackIcon(structureFile) {
	let fileHashBytes = Array.from(await sha256(structureFile));
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
			if(bit == +(x >= ICON_RESOLUTION / 2)) {
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
 * @param {Record<string, string[]>} itemTags
 * @returns {string[]}
 */
function expandItemCriteria(itemCriteria, itemTags) {
	let minecraftTags = itemCriteria["tags"].filter(tag => !tag.includes(":")); // we can't find which items are used in custom tags
	let namespacedItemsFromTags = removeFalsies(minecraftTags.map(tag => itemTags[`minecraft:${tag}`]).flat());
	return [...itemCriteria["names"], ...namespacedItemsFromTags.map(itemName => itemName.replace(/^minecraft:/, ""))];
}

/** @import * as Data from "./data/schemas" */
/** @import { ZipWriterAddDataOptions } from "@zip.js/zip.js" */
/**
 * @typedef {object} HoloPrintConfig An object for storing HoloPrint config options.
 * @property {string[]} IGNORED_BLOCKS
 * @property {string[]} IGNORED_MATERIAL_LIST_BLOCKS
 * @property {number} SCALE
 * @property {number} OPACITY
 * @property {boolean} MULTIPLE_OPACITIES Whether to generate multiple opacity images and allow in-game switching, or have a constant opacity
 * @property {string} TINT_COLOR Hex RGB #xxxxxx
 * @property {number} TINT_OPACITY 0-1
 * @property {number} MINI_SCALE Size of ghost blocks when in the mini view for layers
 * @property {number} TEXTURE_OUTLINE_WIDTH Measured in pixels, x ∈ [0, 1], x ∈ 2^ℝ
 * @property {string} TEXTURE_OUTLINE_COLOR A colour string
 * @property {number} TEXTURE_OUTLINE_OPACITY 0-1
 * @property {boolean} SPAWN_ANIMATION_ENABLED
 * @property {number} SPAWN_ANIMATION_LENGTH Length of each individual block's spawn animation (seconds)
 * @property {boolean} PLAYER_CONTROLS_ENABLED
 * @property {HoloPrintControlsConfig} CONTROLS
 * @property {boolean} UI_CONTROLS_ENABLED
 * @property {boolean} RETEXTURE_CONTROL_ITEMS
 * @property {number} CONTROL_ITEM_TEXTURE_SCALE How much to scale control item overlay textures. When compositing textures, MCBE scales all textures to the maximum, so the size of the overlay control texture has to be the LCM of itself and in-game items. Hence, if in-game items have a higher resolution than expected, they will probably be scaled wrong. The solution is to scale the overlay textures even more, which can be adjusted with this.
 * @property {boolean} RENAME_CONTROL_ITEMS
 * @property {Vec4} WRONG_BLOCK_OVERLAY_COLOR Clamped colour quartet
 * @property {Vec3} INITIAL_OFFSET
 * @property {Vec4[] | undefined} COORDINATE_LOCK If present, each structure's hologram will be locked to these coordinates. The last component is rotation.
 * @property {number} BACKUP_SLOT_COUNT
 * @property {string | undefined} PACK_NAME The name of the completed pack; will default to the structure file names
 * @property {Blob} PACK_ICON_BLOB Blob for `pack_icon.png`
 * @property {string[]} AUTHORS
 * @property {string | undefined} DESCRIPTION
 * @property {number} COMPRESSION_LEVEL
 * @property {number} PREVIEW_BLOCK_LIMIT The maximum number of blocks a structure can have for rendering a preview
 * @property {boolean} SHOW_PREVIEW_SKYBOX
 * @property {boolean} SHOW_PREVIEW_WIDGETS Whether to show or hide the FPS counter and options menu for previews
 */
/**
 * @typedef {object} HoloPrintControlsConfig Controls which items are used for in-game controls.
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
 * @typedef {object} ItemCriteria Stores item names and tags for checking items. Leaving everything empty will check for nothing being held.
 * @property {string[]} names Item names the matching item could have. The `minecraft:` namespace will be used if no namespace is specified.
 * @property {string[]} tags Item tags the matching item could have. The `minecraft:` namespace will be used if no namespace is specified.
 */
/**
 * @typedef {object} NBTBlock A block as stored in NBT.
 * @property {string} name The block's ID
 * @property {Record<string, number | string>} states Block states
 * @property {number} version
 */
/**
 * @typedef {object} Block A block palette entry, similar to how it appears in the NBT, as used in HoloPrint.
 * @property {string} name The block's ID
 * @property {Record<string, number | string>} [states] Block states
 * @property {object} [block_entity_data] Block entity data
 */
/**
 * @typedef {Record<Data.CardinalDirection, { uv: Vec2, uv_size: Vec2 }>} CubeUv
 */
/**
 * @typedef {object} PolyMesh A `poly_mesh` object as in geometry files.
 * @property {boolean} [normalized_uvs]
 * @property {Vec3[]} normals
 * @property {Vec2[]} uvs
 * @property {Vec3[]} positions
 * @property {PolyMeshFace[]} polys
 */
/**
 * @typedef {[Vec3, Vec3, Vec3, Vec3]} PolyMeshFace A square face.
 */
/**
 * @typedef {object} PolyMeshTemplateFace
 * @property {Vec3} normal
 * @property {number} textureRefI
 * @property {[PolyMeshTemplateVertex, PolyMeshTemplateVertex, PolyMeshTemplateVertex, PolyMeshTemplateVertex]} vertices
 */
/**
 * @typedef {object} PolyMeshTemplateVertex
 * @property {Vec3} pos
 * @property {number} corner 0: top left, 1: top right, 2: bottom left, 3: bottom right
 */
/**
 * @typedef {object} PolyMeshTemplateFaceWithUvs
 * @property {Vec3} normal
 * @property {number} transparency Average transparency per texture pixel. 255 = fully transparent, 0 = fully opaque
 * @property {[PolyMeshTemplateVertexWithUv, PolyMeshTemplateVertexWithUv, PolyMeshTemplateVertexWithUv, PolyMeshTemplateVertexWithUv]} vertices
 */
/**
 * @typedef {object} PolyMeshTemplateVertexWithUv
 * @property {Vec3} pos
 * @property {Vec2} uv
 */
/**
 * @typedef {object} TextureReference A texture reference, made in BlockGeoMaker.js and turned into a texture in TextureAtlas.js.
 * @property {Vec2} uv UV coordinates
 * @property {Vec2} uv_size	UV size
 * @property {string} block_name Block ID to get the texture from
 * @property {string} texture_face Which face's texture to use
 * @property {number} variant Which terrain_texture.json variant to use
 * @property {string} [texture_path_override] An overriding texture file path to look at
 * @property {string} [terrain_texture_override] A terrain texture key override; will override block_name and texture_face
 * @property {Vec3} [tint] A tint override
 */
/**
 * @typedef {object} TextureFragment An unresolved texture fragment containing an image path, tint, and UV position and size.
 * @property {string} texturePath
 * @property {Vec3} [tint]
 * @property {boolean} [tint_like_png]
 * @property {number} opacity
 * @property {Vec2} uv
 * @property {Vec2} uv_size
 */
/**
 * @typedef {object} ImageFragment An image fragment containing image data, UV position, and UV size.
 * @property {ImageData} imageData
 * @property {number} w Width
 * @property {number} h Height
 * @property {number} sourceX
 * @property {number} sourceY
 * @property {Rectangle} [crop]
 */
/**
 * @typedef {object} ImageUv
 * @property {Vec2} uv
 * @property {Vec2} uv_size
 * @property {number} transparency
 * @property {Rectangle} [crop]
 */
/**
 * @typedef {object} MaterialListEntry An entry in a material list.
 * @property {string} itemName
 * @property {string} translationKey
 * @property {string} translatedName
 * @property {number} count How many of this item is required
 * @property {string} partitionedCount A formatted string representing partitions of the total count
 * @property {number | undefined} auxId The item's aux ID
 */
/**
 * @typedef {object} SpawnAnimationBone Information about a bone in the spawn animation.
 * @property {string} boneName
 * @property {Vec3} blockPos The block position (i.e. in-game blocks relative to the structure origin)
 */
/**
 * @typedef {object} MinecraftAnimation A Minecraft animation as seen in `.animation.json` files.
 * @property {number} [animation_length]
 * @property {Record<string, object>} [bones]
 */
/**
 * @typedef {object} PreviewPointLight A point light in the structure preview.
 * @property {Vec3} pos Position in Three.js space
 * @property {import("three").Color} col As a hex number, e.g. 0xFF0000
 * @property {number} intensity
 */
/**
 * @typedef {object} MCStructure The parsed NBT of a `.mcstructure` file.
 * @property {number} format_version Format version, should be always set to 1.
 * @property {I32Vec3} size Size of the structure in blocks.
 * @property {object} structure
 * @property {[Int32Array, Int32Array]} structure.block_indices Block indices for the structure.
 * @property {EntityNBTCompound[]} structure.entities List of entities stored as NBT.
 * @property {object} structure.palette
 * @property {object} structure.palette.default
 * @property {NBTBlock[]} structure.palette.default.block_palette List of ordered block entries that the indices refer to.
 * @property {Record<number, BlockPositionData>} [structure.palette.default.block_position_data] Additional data for individual blocks in the structure.
 * @property {I32Vec3} structure_world_origin The original world position where the structure was saved.
 */
/**
 * @typedef {Record<string, any>} EntityNBTCompound Represents an entity NBT compound structure (placeholder).
 */
/**
 * @typedef {object} BlockPositionData Additional data for individual blocks.
 * @property {EntityNBTCompound} [block_entity_data] Block entity data.
 * @property {TickQueueData[]} [tick_queue_data] Scheduled tick information for blocks that need updates.
 */
/**
 * @typedef {object} TickQueueData Represents a scheduled pending tick update. Used in observers.
 * @property {number} tick_delay Number of ticks remaining before update.
 */
/**
 * @typedef {object} TypedBlockStateProperty
 * @property {number} [int] - An integer property.
 * @property {string} [string] - A string property.
 * @property {number} [byte] - A byte property.
 */
/**
 * @typedef {object} BlockUpdateSchemaFlattenRule
 * @property {string} prefix - The prefix for the flattened property.
 * @property {string} flattenedProperty - The name of the flattened property.
 * @property {"int" | "string" | "byte"} [flattenedPropertyType] - The type of the flattened property.
 * @property {string} suffix - The suffix for the flattened property.
 * @property {Record<string, string>} [flattenedValueRemaps] - A mapping of flattened values.
 */
/**
 * @typedef {object} BlockUpdateSchemaRemappedState
 * @property {Record<string, TypedBlockStateProperty> | null} oldState - The property values before the remapping.
 * @property {string} [newName] - An optional new name for the block.
 * @property {BlockUpdateSchemaFlattenRule} [newFlattenedName] - An optional flattened property rule providing a new name.
 * @property {Record<string, TypedBlockStateProperty> | null} newState - The new property values after the remapping.
 * @property {string[]} [copiedState] - Optional list of property names to copy from the old state.
 */
/**
 * @typedef {object} BlockUpdateSchemaSkeleton
 * @property {string} filename
 * @property {number} maxVersionMajor - The major version (must be >= 0).
 * @property {number} maxVersionMinor - The minor version (must be >= 0).
 * @property {number} maxVersionPatch - The patch version (must be >= 0).
 * @property {number} maxVersionRevision - The revision version (must be >= 0).
 */
/**
 * @typedef {object} BlockUpdateSchema
 * @property {number} maxVersionMajor - The major version (must be >= 0).
 * @property {number} maxVersionMinor - The minor version (must be >= 0).
 * @property {number} maxVersionPatch - The patch version (must be >= 0).
 * @property {number} maxVersionRevision - The revision version (must be >= 0).
 * @property {Record<string, string>} [renamedIds] - Mapping of renamed IDs.
 * @property {Record<string, Record<string, TypedBlockStateProperty>>} [addedProperties] - Mapping of added properties.
 * @property {Record<string, Record<string, string>>} [renamedProperties] - Mapping of renamed properties.
 * @property {Record<string, string[]>} [removedProperties] - Mapping of removed properties.
 * @property {Record<string, Record<string, string>>} [remappedPropertyValues] - Mapping of remapped property values.
 * @property {Record<string, { old: TypedBlockStateProperty, new: TypedBlockStateProperty }[]>} [remappedPropertyValuesIndex] - Index of remapped property values.
 * @property {Record<string, BlockUpdateSchemaFlattenRule>} [flattenedProperties] - Mapping of flattened properties.
 * @property {Record<string, BlockUpdateSchemaRemappedState[]>} [remappedStates] - Mapping of remapped states.
 */
/**
 * @typedef {object} Rectangle
 * @property {number} x
 * @property {number} y
 * @property {number} w
 * @property {number} h
 */
/**
 * @typedef {[number, number]} Vec2 2D vector.
 */
/**
 * @typedef {[number, number, number]} Vec3 3D vector.
 */
/**
 * @typedef {[number, number, number, number]} Vec4 4D vector.
 */
/**
 * @template T
 * @template {number} N
 * @template {T[]} [R=[]]
 * @typedef {number extends N? T[] : R["length"] extends N? R : Tuple<T, N, [T, ...R]>} Tuple
 */
/**
 * @template {number} R
 * @template {number} C
 * @template [T=number]
 * @typedef {R extends R? C extends C? (T[] & { length: C })[] & { length: R } : never : never} Matrix
 */
/**
 * @template {number} R
 * @template {number} C
 * @template [T=number]
 * @typedef {R extends R? C extends C? Tuple<Tuple<T, C>, R> : never : never} TupleMatrix
 */
/**
 * @typedef {[Vec4, Vec4, Vec4, Vec4]} Mat4 4x4 matrix.
 */
/**
 * @typedef {Int32Array & { length: 3 }} I32Vec3
 */