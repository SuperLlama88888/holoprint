import { awaitAllEntries, blobToImage, ceil, closestFactorPair, floor, hexColourToClampedTriplet, JSONSet, lerp, max, range, stringToImageData } from "./essential.js";
import TGALoader from "https://esm.run/tga-js@1.1.1"; // We could use dynamic import as this isn't used all the time but it's so small it won't matter
import potpack from "https://esm.run/potpack@2.0.0";
import ResourcePackStack from "./ResourcePackStack.js";

/**
 * 2D vector.
 * @typedef {[Number, Number]} Vec2
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
 * @property {import("./BlockGeoMaker.js").Vec3} [tint]
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

export default class TextureAtlas {
	/** Block IDs from the structure file that need to be remapped to something else in blocks.json, _._ means variants */
	static #blocksDotJsonPatches = { // caused mainly by bugs like MCPE-186255 and MCPE-177977. ideally this doesn't exist.
		"grass_block": "grass",
		"trip_wire": "tripWire",
		"oak_planks": "planks.0",
		"spruce_planks": "planks.1",
		"birch_planks": "planks.2",
		"jungle_planks": "planks.3",
		"acacia_planks": "planks.4",
		"dark_oak_planks": "planks.5" // check this works
	};
	
	// All the blocks in blocks.json that should use carried textures
	// to check: calibrated_sculk_sensor, sculk_sensor, sculk_shrieker
	static #blocksDotJsonCarriedTextures = ["acacia_leaves", "birch_leaves", "dark_oak_leaves", "fern", "jungle_leaves", "leaves", "leaves2", "light_block", "light_block_0", "light_block_1", "light_block_2", "light_block_3", "light_block_4", "light_block_5", "light_block_6", "light_block_7", "light_block_8", "light_block_9", "light_block_10", "light_block_11", "light_block_12", "light_block_13", "light_block_14", "light_block_15", "mangrove_leaves", "oak_leaves", "short_grass", "spruce_leaves", "tall_grass", "vine", "waterlily"];
	
	/** Blocks that are transparent and need a certain opacity applied to them */
	static #transparentBlocks = {
		"water": 0.65,
		"flowing_water": 0.65,
		"slime": 0.8
	};
	
	/** Terrain texture keys that should lead to a texture path always, instead of what's in terrain_texture.json */
	static #terrainTexturePatches = {
		"grass_carried": "textures/blocks/grass_side_carried"
		// we could add portal -> portal_placeholder.png which is a single frame of the portal animated texture (looks like the 1st frame), but it deals with flipbook textures anyway later on
	};
	
	/** File paths of flipbook textures that aren't used in-game because they're missing from flipbook_textures.json, but we need to register them because of UV mapping */
	static #extraFlipbookTextures = ["textures/blocks/soul_lantern"]; // https://bugs.mojang.com/browse/MCPE-89643
	
	static #terrainTextureTints = {
		"grass_top": hexColourToClampedTriplet("#79C05A"), // tinting in terrain_texture.json is only for grass_side...
		"flowing_water_grey": hexColourToClampedTriplet("#44AFF5"),
		"flowing_water": hexColourToClampedTriplet("#44AFF5"),
		"still_water_grey": hexColourToClampedTriplet("#44AFF5"),
		"still_water": hexColourToClampedTriplet("#44AFF5")
	};
	
	#blocksDotJson;
	#terrainTexture;
	
	#flipbookTexturesAndSizes;
	
	config;
	resourcePackStack;
	
	/** When makeAtlas() is called, this will contain UV coordinates and sizes for texture references passed as input, as well as cropping information. */
	textures;
	
	/**
	 * Contains the actual texture atlas images: [textureName, imageBlob]
	 * @type {Array<[String, Blob]>}
	 */
	imageBlobs;
	textureWidth;
	textureHeight;
	atlasWidth;
	atlasHeight;
	textureFillEfficiency; // how much of the texture atlas is filled with images
	
	/**
	 * Creates a texture atlas for loading images from texture references and stitching them together.
	 * @param {Object} config
	 * @param {ResourcePackStack} resourcePackStack
	 */
	constructor(config, resourcePackStack) {
		return (async () => { // async constructor pattern from https://stackoverflow.com/a/50885340
			this.config = config;
			this.resourcePackStack = resourcePackStack;
			
			let { blocksDotJson, terrainTexture, flipbookTextures } = await awaitAllEntries({
				blocksDotJson: this.resourcePackStack.fetchResource("blocks.json").then(res => res.jsonc()),
				terrainTexture: this.resourcePackStack.fetchResource("textures/terrain_texture.json").then(res => res.jsonc()),
				flipbookTextures: this.resourcePackStack.fetchResource("textures/flipbook_textures.json").then(res => res.jsonc())
			})
			this.#blocksDotJson = blocksDotJson;
			this.#terrainTexture = terrainTexture;
			
			this.#flipbookTexturesAndSizes = new Map();
			TextureAtlas.#extraFlipbookTextures.forEach(terrainTextureKey => {
				this.#flipbookTexturesAndSizes.set(terrainTextureKey, 1);
			});
			flipbookTextures.map(entry => {
				this.#flipbookTexturesAndSizes.set(entry["flipbook_texture"], entry["replicate"] ?? 1);
			});
			console.log(this.#flipbookTexturesAndSizes)
			
			return this;
		})();
	}
	/**
	 * Makes a texture atlas from texture references and changes the textureUvs property to reflect UV coordinates and sizes for each reference.
	 * @param {Array<TextureReference>} textureRefs
	 */
	async makeAtlas(textureRefs) {
		console.log("Texture references:", textureRefs);
		
		let textureImageIndices = [];
		
		let allTextureFragments = new JSONSet();
		textureRefs.forEach(textureRef => {
			let texturePath;
			let tint = textureRef["tint"];
			let opacity = 1;
			if("texture_path_override" in textureRef) {
				texturePath = textureRef["texture_path_override"];
			} else {
				let terrainTextureKey = this.#getTerrainTextureKeyFromTextureReference(textureRef);
				let blockName = textureRef["block_name"];
				let variant = textureRef["variant"];
				let texturePathAndTint = this.#getTexturePathAndTint(terrainTextureKey, variant);
				texturePath = texturePathAndTint["texturePath"];
				if(tint == undefined && "tint" in texturePathAndTint) {
					tint = hexColourToClampedTriplet(texturePathAndTint["tint"]);
				}
				if(!texturePath) {
					console.error(`No texture for block ${blockName} on side ${textureRef["texture_face"]}!`);
					texturePath = this.#getTexturePathAndTint("missing", -1)["texturePath"];
				}
				
				tint ??= TextureAtlas.#terrainTextureTints[terrainTextureKey];
				if(blockName in TextureAtlas.#transparentBlocks) {
					opacity = TextureAtlas.#transparentBlocks[blockName];
				}
			}
			let textureFragment = {
				"texturePath": texturePath,
				"tint": tint,
				"opacity": opacity,
				"uv": textureRef["uv"],
				"uv_size": textureRef["uv_size"],
				"croppable": textureRef["croppable"]
			};
			allTextureFragments.add(textureFragment);
			textureImageIndices.push(allTextureFragments.indexOf(textureFragment));
			// console.table({
			// 	"index": tintedTexturePaths.indexOf(pathAndTint),
			// 	"uv": textureRef["uv"],
			// 	"uv_size": textureRef["uv_size"]
			// })
			
			// console.count("add terrain texture key"); // TODO: optimise by putting block names and sides into a set, which would reduce the number of terrain texture keys to resolve into texture paths.
		});
		
		console.log("Texture image indices:", textureImageIndices);
		console.log("Texture fragments:", allTextureFragments);
		
		let imageFragments = await this.#loadImages(allTextureFragments);
		console.log("Image fragments:", imageFragments);
		
		let imageUvs = await this.#stitchTextureAtlas(imageFragments);
		console.log("Image UVs:", imageUvs);
		
		this.textures = textureImageIndices.map(i => imageUvs[i]);
	}
	
	/**
	 * Finds the terrain texture key for a texture reference.
	 * @param {TextureReference} textureRef
	 * @returns {String}
	 */
	#getTerrainTextureKeyFromTextureReference(textureRef) {
		if("terrain_texture_override" in textureRef) {
			return textureRef["terrain_texture_override"];
		}
		let blockName = textureRef["block_name"];
		if(!(blockName in this.#blocksDotJson) && blockName in TextureAtlas.#blocksDotJsonPatches) {
			blockName = TextureAtlas.#blocksDotJsonPatches[blockName];
			if(blockName?.includes(".")) {
				// This is only from TextureAtlas.blocksDotJsonPatches to indicate patches
				textureRef["variant"] = +blockName.split(".")[1]; // Hacky but that's a future me problem
				blockName = blockName.split(".")[0];
			}
		}
		let blockEntry = this.#blocksDotJson[blockName];
		let terrainTextureKeys;
		if(!blockEntry) {
			// console.log(textureRef, blockName, textureRef["block_name"]);
			console.error(`No blocks.json entry for ${blockName}`);
			return "missing";
		}
		
		let textureFace = textureRef["texture_face"];
		if(textureFace.startsWith("carried")) {
			if("carried_textures" in blockEntry) {
				if(textureFace == "carried") {
					if(typeof blockEntry["carried_textures"] == "string") {
						return blockEntry["carried_textures"];
					} else {
						console.error(`Specified carried texture for ${blockName} has multiple faces!`);
					}
				} else {
					let carriedFace = textureFace.slice(8);
					let terrainTextureKey = blockEntry["carried_textures"][carriedFace];
					if(carriedFace == undefined) {
						console.error(`Could not find carried texture face ${carriedFace}!`);
					} else {
						return terrainTextureKey;
					}
				}
			} else {
				console.error(`No carried texture for ${blockName}!`, textureRef, blockEntry);
			}
		}
		if(TextureAtlas.#blocksDotJsonCarriedTextures.includes(blockName)) {
			terrainTextureKeys = blockEntry["carried_textures"];
			console.debug(`Using carried textures for ${blockName}`);
			if(!terrainTextureKeys) {
				console.error(`Specified carried texture in blocks.json for ${blockName} could not be found`);
			}
		}
		terrainTextureKeys ??= blockEntry["textures"]; // values in blocks.json are keys in terrain_texture.json
		if(!terrainTextureKeys) {
			if("carried_textures" in blockEntry) {
				terrainTextureKeys = blockEntry["carried_textures"];
				console.error(`No texture entry found in blocks.json for block ${blockName}! Defaulting to carried texture.`);
			} else {
				terrainTextureKeys = "missing"; // magenta-black checkerboard
				console.error(`No texture entry found in blocks.json for block ${blockName}!`);
			}
		}
		
		// This can either be an object with directions as keys and terrain texture keys as values, or a singular terrain texture key
		if(typeof terrainTextureKeys == "string") { // Only 1 terrain texture key for all faces
			return terrainTextureKeys;
		} else {
			return terrainTextureKeys[textureFace] ?? terrainTextureKeys[["west", "east", "north", "south"].includes(textureFace)? "side" : function() {
				let defaultFace = Object.keys(terrainTextureKeys)[0];
				console.error(`Unknown texture face ${textureFace}! Defaulting to ${defaultFace}.`);
				return defaultFace;
			}()];
		}
	}
	/**
	 * Gets the texture path from a terrain texture key and variant index.
	 * @param {String} terrainTextureKey
	 * @param {Number} variant
	 * @returns {{ texturePath: String, tint?: String }}
	 */
	#getTexturePathAndTint(terrainTextureKey, variant) {
		if(terrainTextureKey in TextureAtlas.#terrainTexturePatches) {
			// These are the hard-coded terrain texture patches if we want to make a terrain texture key lead to a texture path instead of what it would regularly lead to
			let texturePath = TextureAtlas.#terrainTexturePatches[terrainTextureKey];
			console.debug(`Terrain texture key ${terrainTextureKey} remapped to texture path ${texturePath}`);
			return texturePath;
		}
		let texturePath = this.#terrainTexture["texture_data"][terrainTextureKey]?.["textures"];
		if(!texturePath) {
			console.warn(`No terrain_texture.json entry for key ${terrainTextureKey}`);
			return;
		}
		if(Array.isArray(texturePath)) {
			if(texturePath.length == 1) {
				texturePath = texturePath[0];
			} else {
				if(variant == -1) {
					console.warn(`Unknown variant to choose for terrain texture key ${terrainTextureKey}; defaulting to the first`);
					variant = 0;
				}
				if(!(variant in texturePath)) {
					console.error(`Variant ${variant} does not exist for terrain texture key ${terrainTextureKey}! Defaulting to 0.`);
					variant = 0;
				}
				// Array of textures typically means variants and other similar blocks not yet flattened. As of writing (1.21.20.21) the past few previews have had lots of flattenings on them. I hope it continues this way!
				texturePath = texturePath[variant];
			}
		}
		if(typeof texturePath == "string") {
			return { texturePath };
		} else {
			return {
				"texturePath": texturePath["path"],
				"tint": texturePath["overlay_color"] ?? texturePath["tint_color"] // grass uses overlay_color, lilypads use tint_color :/
			};
		}
	}
	/**
	 * Loads images from a set of tinted texture paths.
	 * @param {Set<TextureFragment>} textureFragments 
	 * @returns {Promise<Array<ImageFragment>>}
	 */
	async #loadImages(textureFragments) {
		let tgaLoader = new TGALoader();
		return await Promise.all([...textureFragments].map(async ({ texturePath, tint, opacity, uv: sourceUv, uv_size: uvSize, croppable }) => {
			let imageRes = await this.resourcePackStack.fetchResource(`${texturePath}.png`);
			let imageData;
			let imageIsTga = false;
			if(imageRes.ok) {
				let image = await imageRes.toImage();
				imageData = image.toImageData(); // defined in essential.js; just draws the image onto a canvas then gets the image data from there.
			} else {
				imageRes = await this.resourcePackStack.fetchResource(`${texturePath}.tga`);
				if(imageRes.ok) {
					console.debug(`Fetched TGA texture ${texturePath}.tga`);
					imageIsTga = true;
					tgaLoader.load(new Uint8Array(await imageRes.arrayBuffer()));
					imageData = tgaLoader.getImageData();
				} else {
					console.warn(`No texture found at ${texturePath}`);
					imageData = stringToImageData(texturePath);
					sourceUv = [0, 0],
					uvSize = [1, 1];
				}
			}
			if(tint) {
				imageData = this.#tintImageData(imageData, tint, imageIsTga); // with tinted TGA images, only full-opacity pixels are tinted, and transparent pixels are made opaque.
				// console.debug(`Tinted ${texturePath} with tint ${tint}!`);
			}
			if(opacity != 1) {
				imageData = this.#setImageDataOpacity(imageData, opacity);
			}
			let { width: imageW, height: imageH } = imageData;
			let image = await imageData.toImage();
			
			if(this.#flipbookTexturesAndSizes.has(texturePath)) {
				let size = this.#flipbookTexturesAndSizes.get(texturePath);
				imageH = imageW = imageW / size; // animation would be a pain and totally overkill
				console.debug(`Using flipbook texture for ${texturePath}, ${imageW}x${imageH}`);
			}
			let sourceX = sourceUv[0] * imageW;
			let sourceY = sourceUv[1] * imageH;
			let w = uvSize[0] * imageW;
			let h = uvSize[1] * imageH;
			let crop;
			// croppable = false;
			if(croppable) {
				let old = { sourceX, sourceY, w, h };
				let extremePixels = this.#findMostExtremePixels(image, sourceX, sourceY, w, h);
				sourceX = extremePixels["minX"];
				w = extremePixels["maxX"] - extremePixels["minX"] + 1;
				sourceY = extremePixels["minY"];
				h = extremePixels["maxY"] - extremePixels["minY"] + 1;
				crop = {
					"x": (sourceX - old.sourceX) / old.w,
					"y": (sourceY - old.sourceY) / old.h,
					"w": w / old.w,
					"h": h / old.h
				};
				console.debug(`Cropped image ${texturePath} to`, crop);
			}
			let imageFragment = {
				"image": image,
				"sourceX": sourceX,
				"sourceY": sourceY,
				"w": w,
				"h": h
			};
			if(croppable) {
				imageFragment["crop"] = crop;
			}
			return imageFragment;
		}));
	}
	/**
	 * Stitches together images with widths and heights, and puts the UV coordinates and sizes into the textureUvs property.
	 * @param {Array<ImageFragment>} imageFragments
	 */
	async #stitchTextureAtlas(imageFragments) {
		imageFragments.forEach((imageFragment, i) => {
			imageFragment["i"] = i; // Keep order as potpack shuffles them
			imageFragment["actualSize"] = [imageFragment["w"], imageFragment["h"]]; // since we're modifying w/h, we need to keep references to everything before.
			imageFragment["offset"] = [0, 0];
			// fractional dimensions don't work with js canvas, so we need to extract the full part of the texture we need, but keep the uv positions fractional
			if(!Number.isInteger(imageFragment["sourceX"])) {
				imageFragment["offset"][0] = imageFragment["sourceX"] % 1;
				imageFragment["w"] += imageFragment["offset"][1];
				imageFragment["sourceX"] = floor(imageFragment["sourceX"]);
			}
			if(!Number.isInteger(imageFragment["sourceY"])) {
				imageFragment["offset"][1] = imageFragment["sourceY"] % 1;
				imageFragment["h"] += imageFragment["offset"][1];
				imageFragment["sourceY"] = floor(imageFragment["sourceY"]);
			}
			if(!Number.isInteger(imageFragment["w"])) {
				imageFragment["w"] = ceil(imageFragment["w"]);
			}
			if(!Number.isInteger(imageFragment["h"])) {
				imageFragment["h"] = ceil(imageFragment["h"]);
			}
		});
		let packing = potpack(imageFragments);
		imageFragments.sort((a, b) => a["i"] - b["i"]);
		this.textureWidth = packing.w;
		this.textureHeight = packing.h;
		this.textureFillEfficiency = packing.fill;
		this.atlasWidth = this.textureWidth;
		this.atlasHeight = this.textureHeight;
		console.info(`Packed texture atlas with ${(this.textureFillEfficiency * 100).toFixed(2)}% space efficiency!`);
		
		let can = new OffscreenCanvas(this.textureWidth, this.textureHeight);
		let ctx = can.getContext("2d");
		
		console.log("Packed image fragments:", imageFragments);
		let imageUvs = imageFragments.map(imageFragment => {
			let sourcePos = [imageFragment.sourceX, imageFragment.sourceY];
			let destPos = [imageFragment.x, imageFragment.y];
			let textureSize = [imageFragment.w, imageFragment.h];
			// document.body.appendChild(imageFragment.image);
			// console.table({sourcePos,textureSize,destPos})
			ctx.drawImage(imageFragment.image, ...sourcePos, ...textureSize, ...destPos, ...textureSize); // take the entire source image and draw it onto the canvas at the specified uv with its dimensions.
			let imageUv = {
				"uv": destPos.map((x, i) => x + imageFragment["offset"][i]),
				"uv_size": imageFragment["actualSize"]
			};
			if("crop" in imageFragment) {
				imageUv["crop"] = imageFragment["crop"];
			}
			return imageUv;
		});
		
		if(this.config.TEXTURE_OUTLINE_WIDTH != 0) {
			can = this.#addTextureOutlines(can, imageFragments);
		}
		
		if(this.config.MULTIPLE_OPACITIES) {
			let opacities = range(4, 10).map(x => x / 10); // lowest is 40% opacity. note that we do division after to avoid floating-point errors.
			this.imageBlobs = await Promise.all(opacities.map(async opacity => [`hologram_opacity_${opacity}`, await this.#setCanvasOpacity(can, opacity).convertToBlob()]));
		} else {
			can = this.#setCanvasOpacity(can, this.config.OPACITY);
			this.imageBlobs = [["hologram", await can.convertToBlob()]];
		}
		
		// document.body.appendChild(await blobToImage(this.imageBlobs.at(-1)[1]));
		
		return imageUvs;
	}
	/**
	 * Finds the coordinates of the most extreme outer pixels of an image
	 * @param {Image} image
	 * @param {Number} [startX] The x-position to start looking at
	 * @param {Number} [startY] The y-position to start looking at
	 * @param {Number} [imageW] The width of the portion of the image to look at
	 * @param {Number} [imageH] The height of the portion of the image to look at
	 * @returns {{ minX: Number, minY: Number, maxX: Number, maxY: Number }}
	 */
	#findMostExtremePixels(image, startX = 0, startY = 0, imageW = image.width, imageH = image.height) {
		let can = new OffscreenCanvas(imageW, imageH);
		let ctx = can.getContext("2d");
		ctx.drawImage(image, startX, startY, imageW, imageH, 0, 0, imageW, imageH);
		let imageData = ctx.getImageData(0, 0, imageW, imageH).data;
		
		let minX = imageW, minY = imageH, maxX = 0, maxY = 0;
		for(let y = 0; y < imageH; y++) {
			for(let x = 0; x < imageW; x++) {
				let i = (y * imageW + x) * 4;
				if(imageData[i + 3] > 0) {
					if(x < minX) minX = x;
					if(x > maxX) maxX = x;
					if(y < minY) minY = y;
					if(y > maxY) maxY = y;
				}
			}
		}
		minX += startX;
		minY += startY;
		maxX += startX;
		maxY += startY;
		return { minX, minY, maxX, maxY };
	}
	/** Add an outline around each texture */
	#addTextureOutlines(ogCan, imagePositions) {
		let scale = max(1 / this.config.TEXTURE_OUTLINE_WIDTH, 1);
		let can = new OffscreenCanvas(ogCan.width * scale, ogCan.height * scale);
		
		let ctx = can.getContext("2d");
		ctx.imageSmoothingEnabled = false;
		ctx.drawImage(ogCan, 0, 0, can.width, can.height);
		
		let imageData = ogCan.getContext("2d").getImageData(0, 0, ogCan.width, ogCan.height);
		
		ctx.fillStyle = this.config.TEXTURE_OUTLINE_COLOUR;
		
		const compareAlpha = (currentPixel, otherPixel) => this.config.TEXTURE_OUTLINE_ALPHA_DIFFERENCE_MODE == "difference"? currentPixel - otherPixel >= this.config.TEXTURE_OUTLINE_ALPHA_THRESHOLD : otherPixel <= this.config.TEXTURE_OUTLINE_ALPHA_THRESHOLD;
		
		imagePositions.forEach(({ x: startX, y: startY, w, h }) => {
			let endX = startX + w;
			let endY = startY + h;
			for(let x = startX; x < endX; x++) {
				for(let y = startY; y < endY; y++) {
					let i = (y * ogCan.width + x) * 4;
					let alpha = imageData.data[i + 3];
					if(alpha == 0) {
						continue;
					}
					let left = x == startX || compareAlpha(alpha, imageData.data[i - 4 + 3]);
					let right = x == endX - 1 || compareAlpha(alpha, imageData.data[i + 4 + 3]);
					let top = y == startY || compareAlpha(alpha, imageData.data[i - ogCan.width * 4 + 3]);
					let bottom = y == endY - 1 || compareAlpha(alpha, imageData.data[i + ogCan.width * 4 + 3]);
					let topLeft = x == startX && y == startY || compareAlpha(alpha, imageData.data[i - 4 - ogCan.width * 4 + 3]);
					let topRight = x == endX - 1 && y == startY || compareAlpha(alpha, imageData.data[i + 4 - ogCan.width * 4 + 3]);
					let bottomLeft = x == startX && y == endY - 1 || compareAlpha(alpha, imageData.data[i - 4 + ogCan.width * 4 + 3]);
					let bottomRight = x == endX - 1 && y == endY - 1 || compareAlpha(alpha, imageData.data[i + 4 + ogCan.width * 4 + 3]);
					if(left) {
						ctx.fillRect(x * scale, y * scale + 1, 1, scale - 2);
					}
					if(right) {
						ctx.fillRect(x * scale + scale - 1, y * scale + 1, 1, scale - 2);
					}
					if(top) {
						ctx.fillRect(x * scale + 1, y * scale, scale - 2, 1);
					}
					if(bottom) {
						ctx.fillRect(x * scale + 1, y * scale + scale - 1, scale - 2, 1);
					}
					if(top || left || topLeft) {
						ctx.fillRect(x * scale, y * scale, 1, 1);
					}
					if(top || right || topRight) {
						ctx.fillRect(x * scale + scale - 1, y * scale, 1, 1);
					}
					if(bottom || left || bottomLeft) {
						ctx.fillRect(x * scale, y * scale + scale - 1, 1, 1);
					}
					if(bottom || right || bottomRight) {
						ctx.fillRect(x * scale + scale - 1, y * scale + scale - 1, 1, 1);
					}
				}
			}
		});
		
		return can;
	}
	#setCanvasOpacity(can, alpha) {
		let newCan = new OffscreenCanvas(can.width, can.height);
		let ctx = newCan.getContext("2d");
		ctx.globalAlpha = alpha;
		ctx.drawImage(can, 0, 0);
		return newCan;
	}
	/**
	 * Tints some image data.
	 * @param {ImageData} imageData
	 * @param {Vec3} tint
	 * @param {Boolean} onlyAlpha If only full opacity pixels should be tinted and transparent pixels made opaque, or not
	 * @returns {ImageData}
	 */
	#tintImageData(imageData, tint, onlyAlpha = false) {
		let data = imageData.data;
		for(let i = 0; i < data.length; i += 4) {
			if(!onlyAlpha || data[i + 3] == 255) { // only tint pixels with full opacity. this happens with grass block side, where the top has full opacity and the bottom has 0 opacity.
				data[i] *= tint[0];
				data[i + 1] *= tint[1];
				data[i + 2] *= tint[2];
			}
			if(onlyAlpha) {
				data[i + 3] = 255;
			}
		}
		return imageData;
	}
	/**
	 * Sets the opacity of pixels in some image data.
	 * @param {ImageData} imageData
	 * @param {Number} opacity 0-1
	 * @returns {ImageData}
	 */
	#setImageDataOpacity(imageData, opacity) {
		let data = imageData.data;
		for(let i = 0; i < data.length; i += 4) {
			data[i + 3] *= opacity;
		}
		return imageData;
	}
}