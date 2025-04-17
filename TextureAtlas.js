import { awaitAllEntries, ceil, floor, hexColorToClampedTriplet, JSONSet, max, range, stringToImageData } from "./essential.js";
import TGALoader from "tga-js"; // We could use dynamic import as this isn't used all the time but it's so small it won't matter
import potpack from "potpack";
import ResourcePackStack from "./ResourcePackStack.js";

export default class TextureAtlas {
	#blocksDotJsonPatches;
	#blocksToUseCarriedTextures;
	#transparentBlocks;
	#terrainTexturePatches;
	#terrainTextureTints;
	
	blocksDotJson;
	terrainTexture;
	
	#flipbookTexturesAndSizes;
	
	/** @type {HoloPrintConfig} */
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
	 * @param {HoloPrintConfig} config
	 * @param {ResourcePackStack} resourcePackStack
	 */
	constructor(config, resourcePackStack) {
		return (async () => { // async constructor pattern from https://stackoverflow.com/a/50885340
			this.config = config;
			this.resourcePackStack = resourcePackStack;
			
			let { blocksDotJson, terrainTexture, flipbookTextures, textureAtlasMappings } = await awaitAllEntries({
				blocksDotJson: this.resourcePackStack.fetchResource("blocks.json").then(res => res.jsonc()),
				terrainTexture: this.resourcePackStack.fetchResource("textures/terrain_texture.json").then(res => res.jsonc()),
				flipbookTextures: this.resourcePackStack.fetchResource("textures/flipbook_textures.json").then(res => res.jsonc()),
				/** @type {import("./data/textureAtlasMappings.json")} */
				textureAtlasMappings: fetch("data/textureAtlasMappings.json").then(res => res.jsonc())
			})
			this.blocksDotJson = blocksDotJson;
			this.terrainTexture = terrainTexture;
			
			this.#blocksDotJsonPatches = textureAtlasMappings["blocks_dot_json_patches"];
			this.#blocksToUseCarriedTextures = textureAtlasMappings["blocks_to_use_carried_textures"];
			this.#transparentBlocks = textureAtlasMappings["transparent_blocks"];
			this.#terrainTexturePatches = textureAtlasMappings["terrain_texture_patches"];
			this.#terrainTextureTints = textureAtlasMappings["terrain_texture_tints"];
			
			this.#flipbookTexturesAndSizes = new Map();
			textureAtlasMappings["missing_flipbook_textures"].forEach(terrainTextureKey => {
				this.#flipbookTexturesAndSizes.set(terrainTextureKey, 1);
			});
			flipbookTextures.map(entry => {
				this.#flipbookTexturesAndSizes.set(entry["flipbook_texture"], entry["replicate"] ?? 1);
			});
			// console.log("Flipbook textures -> sizes:", this.#flipbookTexturesAndSizes);
			
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
			let tintLikePng = false;
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
					tint = hexColorToClampedTriplet(texturePathAndTint["tint"]);
				}
				if(!texturePath) {
					console.error(`No texture for block ${blockName} on side ${textureRef["texture_face"]}!`);
					texturePath = this.#getTexturePathAndTint("missing", -1)["texturePath"];
				}
				
				if(tint == undefined && terrainTextureKey in this.#terrainTextureTints["terrain_texture_keys"]) {
					let tintColor = this.#terrainTextureTints["terrain_texture_keys"][terrainTextureKey];
					if(typeof tintColor == "object") {
						tintLikePng = tintColor["tint_like_png"];
						tintColor = tintColor["tint"];
					}
					if(tintColor.startsWith("#")) {
						tint = hexColorToClampedTriplet(tintColor);
					} else if(tintColor in this.#terrainTextureTints["colors"]) {
						tint = hexColorToClampedTriplet(this.#terrainTextureTints["colors"][tintColor]);
					} else {
						console.error(`No tint color ${tintColor}`);
					}
				}
				if(blockName in this.#transparentBlocks) {
					opacity = this.#transparentBlocks[blockName];
				}
			}
			let textureFragment = {
				"texturePath": texturePath,
				"tint": tint,
				"tint_like_png": tintLikePng,
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
		if(!(blockName in this.blocksDotJson) && blockName in this.#blocksDotJsonPatches) {
			blockName = this.#blocksDotJsonPatches[blockName];
			if(blockName?.includes(".")) {
				// This is only from this.blocksDotJsonPatches to indicate patches
				textureRef["variant"] = +blockName.split(".")[1]; // Hacky but that's a future me problem
				blockName = blockName.split(".")[0];
			}
		}
		let blockEntry = this.blocksDotJson[blockName];
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
					if(["west", "east", "north", "south"].includes(carriedFace)) {
						terrainTextureKey ??= blockEntry["carried_textures"]["side"];
					}
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
		if(this.#blocksToUseCarriedTextures.includes(blockName)) {
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
		if(terrainTextureKey in this.#terrainTexturePatches) {
			// These are the hard-coded terrain texture patches if we want to make a terrain texture key lead to a texture path instead of what it would regularly lead to
			let texturePath = this.#terrainTexturePatches[terrainTextureKey];
			console.debug(`Terrain texture key ${terrainTextureKey} remapped to texture path ${texturePath}`);
			return texturePath;
		}
		let texturePath = this.terrainTexture["texture_data"][terrainTextureKey]?.["textures"];
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
		let allTexturePaths = [...new Set([...textureFragments].map(textureFragment => textureFragment.texturePath))];
		console.log(`Loading ${allTexturePaths.length} images for ${textureFragments.size} texture fragments`);
		let allImageData = await Promise.all(allTexturePaths.map(async texturePath => {
			let imageRes = await this.resourcePackStack.fetchResource(`${texturePath}.png`);
			let imageData;
			let imageIsTga = false;
			let imageNotFound = false;
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
					imageNotFound = true;
				}
			}
			return { imageData, imageIsTga, imageNotFound };
		}));
		let imageDataByTexturePath = new Map(allTexturePaths.map((texturePath, i) => [texturePath, allImageData[i]]));
		return await Promise.all([...textureFragments].map(async ({ texturePath, tint, tint_like_png: tintLikePng, opacity, uv: sourceUv, uv_size: uvSize, croppable }) => {
			let { imageData, imageIsTga, imageNotFound } = imageDataByTexturePath.get(texturePath);
			if(imageNotFound) {
				sourceUv = [0, 0];
				uvSize = [1, 1];
			}
			if(tint) {
				imageData = this.#tintImageData(imageData, tint, imageIsTga && !tintLikePng); // with tinted TGA images, only full-opacity pixels are tinted, and transparent pixels are made opaque.
				// console.debug(`Tinted ${texturePath} with tint ${tint}!`);
			}
			if(opacity != 1) {
				imageData = this.#setImageDataOpacity(imageData, opacity);
			}
			let { width: imageW, height: imageH } = imageData;
			let image = await imageData.toImage().catch(e => {
				console.error(`Failed to decode image data from ${texturePath}: ${e}`);
				sourceUv = [0, 0];
				uvSize = [1, 1];
				return stringToImageData(`Failed to decode ${texturePath}`).toImage(); // hopefully it's an issue with the image loading not the decoding
			});
			
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
				if(crop["x"] != 0 || crop["y"] != 0 || crop["w"] != 1 || crop["h"] != 1) {
					console.debug(`Cropped part of image ${texturePath} to`, crop);
				}
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
	 * @returns {Array<{ uv: [Number, Number], uv_size: [Number, Number], crop: Object|undefined }>}
	 */
	async #stitchTextureAtlas(imageFragments) {
		imageFragments.forEach((imageFragment, i) => {
			imageFragment["i"] = i; // Keep order as potpack shuffles them
			imageFragment["actualSize"] = [imageFragment["w"], imageFragment["h"]]; // since we're modifying w/h, we need to keep references to everything before.
			imageFragment["offset"] = [0, 0];
			// fractional dimensions don't work with js canvas, so we need to extract the full part of the texture we need, but keep the uv positions fractional
			if(!Number.isInteger(imageFragment["sourceX"])) {
				imageFragment["offset"][0] = imageFragment["sourceX"] % 1;
				imageFragment["w"] += imageFragment["offset"][0];
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
		let imageFragments2 = imageFragments.map(imageFragment => ({ ... imageFragment }));
		let packing1 = potpack(imageFragments);
		let packing2 = potpackWithWidthPresort(imageFragments2);
		let packing = packing1.fill > packing2.fill? packing1 : packing2; // In my testing on 100 structures, 10 times no width presort was better, 17 times width presort was better, and the rest they were equal. On average, width presorting improved space efficiency by 0.1385%. Since potpack takes just a couple ms, it's best to look at both and take the better one.
		if(packing2.fill >= packing1.fill) {
			imageFragments = imageFragments2;
		}
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
			can = TextureAtlas.addTextureOutlines(can, imageFragments, this.config);
		}
		
		if(this.config.MULTIPLE_OPACITIES) {
			let opacities = range(4, 10).map(x => x / 10); // lowest is 40% opacity. note that we do division after to avoid floating-point errors.
			this.imageBlobs = await Promise.all(opacities.map(async opacity => [`hologram_opacity_${opacity}`, await this.#setCanvasOpacity(can, opacity).convertToBlob()]));
		} else {
			can = this.#setCanvasOpacity(can, this.config.OPACITY);
			this.imageBlobs = [["hologram", await can.convertToBlob()]];
		}
		
		// document.body.appendChild(await this.imageBlobs.at(-1)[1].toImage());
		
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
	/** Add an outline around each texture.
	 * @param {CanvasImageSource} ogCan
	 * @param {Array<{ x: Number, y: Number, w: Number, h: Number }>} imagePositions
	 * @param {HoloPrintConfig} config
	 * @returns {OffscreenCanvas}
	 */
	static addTextureOutlines(ogCan, imagePositions, config) {
		let scale = max(1 / config.TEXTURE_OUTLINE_WIDTH, 1);
		let can = new OffscreenCanvas(ogCan.width * scale, ogCan.height * scale);
		
		let ctx = can.getContext("2d");
		ctx.imageSmoothingEnabled = false;
		ctx.drawImage(ogCan, 0, 0, can.width, can.height);
		
		let imageData = ogCan.getContext("2d").getImageData(0, 0, ogCan.width, ogCan.height);
		
		ctx.fillStyle = config.TEXTURE_OUTLINE_COLOR;
		ctx.globalAlpha = config.TEXTURE_OUTLINE_OPACITY;
		
		/** difference: will compare alpha channel difference; threshold: will only look at the second pixel @type {("threshold"|"difference")} */
		const TEXTURE_OUTLINE_ALPHA_DIFFERENCE_MODE = "threshold";
		/** If using difference mode, will draw outline between pixels with at least this much alpha difference; if using threshold mode, will draw outline on pixels next to pixels with an alpha less than or equal to this @type {Number} */
		const TEXTURE_OUTLINE_ALPHA_THRESHOLD = 0;
		const compareAlpha = (currentPixel, otherPixel) => TEXTURE_OUTLINE_ALPHA_DIFFERENCE_MODE == "difference"? currentPixel - otherPixel >= TEXTURE_OUTLINE_ALPHA_THRESHOLD : otherPixel <= TEXTURE_OUTLINE_ALPHA_THRESHOLD;
		
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
		let newImageData = new ImageData(new Uint8ClampedArray(imageData.data), imageData.width, imageData.height);
		let data = newImageData.data;
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
		return newImageData;
	}
	/**
	 * Sets the opacity of pixels in some image data.
	 * @param {ImageData} imageData
	 * @param {Number} opacity 0-1
	 * @returns {ImageData}
	 */
	#setImageDataOpacity(imageData, opacity) {
		let newImageData = new ImageData(new Uint8ClampedArray(imageData.data), imageData.width, imageData.height);
		let data = newImageData.data;
		for(let i = 0; i < data.length; i += 4) {
			data[i + 3] *= opacity;
		}
		return newImageData;
	}
}

// Code of potpack but with my small optimisation (https://github.com/mapbox/potpack/pull/10)
/*
ISC License

Copyright (c) 2022, Mapbox

Permission to use, copy, modify, and/or distribute this software for any purpose
with or without fee is hereby granted, provided that the above copyright notice
and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND
FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS
OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER
TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF
THIS SOFTWARE.
*/
function potpackWithWidthPresort(boxes) {
	let area = 0;
	let maxWidth = 0;
	for(let box of boxes) {
		area += box.w * box.h;
		maxWidth = Math.max(maxWidth, box.w);
	}
	boxes.sort((a, b) => b.h - a.h || b.w - a.w);
	
	let startWidth = Math.max(Math.ceil(Math.sqrt(area / 0.95)), maxWidth);
	let spaces = [{ x: 0, y: 0, w: startWidth, h: Infinity }];
	let width = 0;
	let height = 0;
	for(let box of boxes) {
		for(let i = spaces.length - 1; i >= 0; i--) {
			let space = spaces[i];
			if(box.w > space.w || box.h > space.h) continue;
			box.x = space.x;
			box.y = space.y;
			height = Math.max(height, box.y + box.h);
			width = Math.max(width, box.x + box.w);
			if(box.w == space.w && box.h == space.h) {
				let last = spaces.pop();
				if(i < spaces.length) spaces[i] = last;
			} else if(box.h == space.h) {
				space.x += box.w;
				space.w -= box.w;
			} else if(box.w == space.w) {
				space.y += box.h;
				space.h -= box.h;
			} else {
				spaces.push({
					x: space.x + box.w,
					y: space.y,
					w: space.w - box.w,
					h: box.h
				});
				space.y += box.h;
				space.h -= box.h;
			}
			break;
		}
	}
	return {
		w: width,
		h: height,
		fill: (area / (width * height)) || 0
	};
}

/**
 * @typedef {import("./HoloPrint.js").TextureReference} TextureReference
 */
/**
 * @typedef {import("./HoloPrint.js").TextureFragment} TextureFragment
 */
/**
 * @typedef {import("./HoloPrint.js").ImageFragment} ImageFragment
 */
/**
 * @typedef {import("./HoloPrint.js").HoloPrintConfig} HoloPrintConfig
 */