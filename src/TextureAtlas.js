import { addVec2, ceil, floor, hexColorToClampedTriplet, JSONSet, max, range, stringToImageData, subVec2, toImage, toImageData } from "./utils.js";
import TGALoader from "tga-js"; // We could use dynamic import as this isn't used all the time but it's so small it won't matter
import potpack from "potpack";
import ResourcePackStack from "./ResourcePackStack.js";

export default class TextureAtlas {
	#blocksDotJsonPatches;
	#blocksToUseCarriedTextures;
	#transparentBlocks;
	#terrainTextureTints;
	
	blocksDotJson;
	terrainTexture;
	
	#flipbookTexturesAndSizes = new Map();
	
	/** @type {HoloPrintConfig} */
	config;
	resourcePackStack;
	
	/**
	 * When makeAtlas() is called, this will contain UV coordinates and sizes for texture references passed as input, as well as cropping information.
	 * @type {Array<ImageUv>}
	 */
	uvs;
	
	/**
	 * Contains the actual texture atlas images: [textureName, imageBlob]
	 * @type {Array<[string, Blob]>}
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
	 * @param {object} blocksDotJson
	 * @param {object} terrainTexture
	 * @param {object} flipbookTextures
	 * @param {Data.TextureAtlasMappings} textureAtlasMappings
	 */
	constructor(config, resourcePackStack, blocksDotJson, terrainTexture, flipbookTextures, textureAtlasMappings) {
		this.config = config;
		this.resourcePackStack = resourcePackStack;
		this.blocksDotJson = blocksDotJson;
		this.terrainTexture = terrainTexture;
		
		this.#blocksDotJsonPatches = textureAtlasMappings["blocks_dot_json_patches"];
		this.#blocksToUseCarriedTextures = textureAtlasMappings["blocks_to_use_carried_textures"];
		this.#transparentBlocks = textureAtlasMappings["transparent_blocks"];
		this.#terrainTextureTints = textureAtlasMappings["terrain_texture_tints"];
		
		textureAtlasMappings["missing_flipbook_textures"].forEach(terrainTextureKey => {
			this.#flipbookTexturesAndSizes.set(terrainTextureKey, 1);
		});
		flipbookTextures.map(entry => {
			this.#flipbookTexturesAndSizes.set(entry["flipbook_texture"], entry["replicate"] ?? 1);
		});
		// console.log("Flipbook textures -> sizes:", this.#flipbookTexturesAndSizes);
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
				"uv_size": textureRef["uv_size"]
			};
			allTextureFragments.add(textureFragment);
			textureImageIndices.push(allTextureFragments.indexOf(textureFragment));
			// console.table({
			// 	"index": tintedTexturePaths.indexOf(pathAndTint),
			// 	"uv": textureRef["uv"],
			// 	"uv_size": textureRef["uv_size"]
			// })
		});
		
		console.log("Texture image indices:", textureImageIndices);
		console.log("Texture fragments:", allTextureFragments);
		
		let imageFragments = await this.#loadImages(allTextureFragments);
		console.log("Image fragments:", imageFragments);
		
		let imageUvs = await this.#stitchTextureAtlas(imageFragments);
		console.log("Image UVs:", imageUvs);
		
		this.uvs = textureImageIndices.map(i => imageUvs[i]);
	}
	
	/**
	 * Finds the terrain texture key for a texture reference.
	 * @param {TextureReference} textureRef
	 * @returns {string}
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
	 * @param {string} terrainTextureKey
	 * @param {number} variant
	 * @returns {{ texturePath: string, tint?: string }}
	 */
	#getTexturePathAndTint(terrainTextureKey, variant) {
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
		let allTexturePathsWithDuplicates = Array.from(textureFragments).map(textureFragment => textureFragment.texturePath);
		let allTexturePaths = Array.from(new Set(allTexturePathsWithDuplicates));
		console.log(`Loading ${allTexturePaths.length} images for ${textureFragments.size} texture fragments`);
		let allImageData = await Promise.all(allTexturePaths.map(async texturePath => {
			let imageRes = await this.resourcePackStack.fetchResource(`${texturePath}.png`);
			let imageData;
			let imageIsTga = false;
			let imageNotFound = false;
			if(imageRes.ok) {
				let image = await toImage(imageRes);
				imageData = await toImageData(image);
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
		return await Promise.all(Array.from(textureFragments).map(async ({ texturePath, tint, tint_like_png: tintLikePng, opacity, uv: sourceUv, uv_size: uvSize }) => {
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
			
			if(this.#flipbookTexturesAndSizes.has(texturePath)) {
				let size = this.#flipbookTexturesAndSizes.get(texturePath);
				imageH = imageW = imageW / size; // animation would be a pain and totally overkill
				console.debug(`Using flipbook texture for ${texturePath}, ${imageW}x${imageH}`);
			}
			let sourceX = sourceUv[0] * imageW;
			let sourceY = sourceUv[1] * imageH;
			let w = uvSize[0] * imageW;
			let h = uvSize[1] * imageH;
			let crop = null;
			if(Number.isInteger(sourceX) && Number.isInteger(sourceY) && Number.isInteger(w) && Number.isInteger(h)) { // textures with non-integral dimensions are wacky so I'm just going to say they can't be cropped... there aren't many blocks like this fortunately
				let old = { sourceX, sourceY, w, h };
				let extremePixels = this.#findMostExtremePixels(imageData, sourceX, sourceY, w, h);
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
				} else {
					crop = null;
				}
			}
			let imageFragment = { imageData, sourceX, sourceY, w, h };
			if(crop) {
				imageFragment["crop"] = crop;
			}
			return imageFragment;
		}));
	}
	/**
	 * Stitches together images with widths and heights, and puts the UV coordinates and sizes into the textureUvs property.
	 * @param {Array<ImageFragment>} imageFragments
	 * @returns {Promise<Array<ImageUv>>}
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
		let imageFragments2 = imageFragments.map(imageFragment => ({ ...imageFragment }));
		let packing1 = potpack(imageFragments);
		let packing2 = potpack(imageFragments2.sort((a, b) => b.h - a.h || b.w - a.w)); // width presort
		let packing = packing1.fill > packing2.fill? packing1 : packing2; // In my testing on 100 structures, 10 times no width presort was better, 17 times width presort was better, and the rest they were equal. On average, width presorting improved space efficiency by 0.1385%. Since potpack takes just a couple ms, it's best to look at both and take the better one.
		if(packing2.fill >= packing1.fill) {
			imageFragments = imageFragments2;
		}
		imageFragments.sort((a, b) => a["i"] - b["i"]);
		/** @type {Array<ImageFragment & Rectangle & { actualSize: Vec2, offset: Vec2 }>} */
		// @ts-ignore
		let packedImageFragments = imageFragments;
		this.textureWidth = packing.w;
		this.textureHeight = packing.h;
		this.textureFillEfficiency = packing.fill;
		this.atlasWidth = this.textureWidth;
		this.atlasHeight = this.textureHeight;
		console.info(`Packed texture atlas with ${(this.textureFillEfficiency * 100).toFixed(2)}% space efficiency!`);
		
		let can = new OffscreenCanvas(this.textureWidth, this.textureHeight);
		let ctx = can.getContext("2d");
		
		console.log("Packed image fragments:", imageFragments);
		let imageUvs = packedImageFragments.map(imageFragment => {
			/** @type {Vec2} */
			let sourcePos = [imageFragment.sourceX, imageFragment.sourceY];
			/** @type {Vec2} */
			let destPos = [imageFragment.x, imageFragment.y];
			/** @type {Vec2} */
			let textureSize = [imageFragment.w, imageFragment.h];
			// console.table({sourcePos,textureSize,destPos})
			ctx.putImageData(imageFragment.imageData, ...subVec2(destPos, sourcePos), ...sourcePos, ...textureSize); // when drawing image data, the source position and size crop it but don't move it back to the original destination position, meaning it must be offset.
			let imageUv = {
				"uv": addVec2(destPos, imageFragment["offset"]),
				"uv_size": imageFragment["actualSize"],
				"transparency": NaN
			};
			if("crop" in imageFragment) {
				imageUv["crop"] = imageFragment["crop"];
			}
			return imageUv;
		});
		let canImageData = can.getContext("2d").getImageData(0, 0, can.width, can.height);
		let transparencies = this.#getImageFragmentTransparencies(canImageData, packedImageFragments);
		transparencies.forEach((transparency, i) => {
			imageUvs[i]["transparency"] = transparency;
		});
		
		// ctx = can.getContext("2d");
		// ctx.fillStyle = "#00F3";
		// ctx.fillRect(0, 0, can.width, can.height);
		if(this.config.TEXTURE_OUTLINE_WIDTH != 0) {
			can = TextureAtlas.addTextureOutlines(can, packedImageFragments, this.config, canImageData);
		}
		
		if(this.config.MULTIPLE_OPACITIES) {
			let opacities = range(4, 10).map(x => x / 10); // lowest is 40% opacity. note that we do division after to avoid floating-point errors.
			this.imageBlobs = await Promise.all(opacities.map(async opacity => [`hologram_opacity_${opacity}`, await this.#setCanvasOpacity(can, opacity).convertToBlob()], 42)); // the custom definitions for .map() in globalPatches.d.ts mess it up because it's uses promises. I've tried to exclude promises from them but it doesn't work. however, adding a second parameter makes it fall back to the native definition. (it's supposed to change the this value, but arrow functions don't have their own this value.)
		} else {
			can = this.#setCanvasOpacity(can, this.config.OPACITY);
			this.imageBlobs = [["hologram", await can.convertToBlob()]];
		}
		
		// document.body.appendChild(await toImage(this.imageBlobs.at(-1)[1]));
		
		return imageUvs;
	}
	/**
	 * Finds the coordinates of the most extreme outer pixels of an image.
	 * @param {ImageData} imageData
	 * @param {number} [startX] The x-position to start looking at
	 * @param {number} [startY] The y-position to start looking at
	 * @param {number} [imageW] The width of the portion of the image to look at
	 * @param {number} [imageH] The height of the portion of the image to look at
	 * @returns {{ minX: number, minY: number, maxX: number, maxY: number }}
	 */
	#findMostExtremePixels(imageData, startX = 0, startY = 0, imageW = imageData.width, imageH = imageData.height) {
		let minX = imageData.width, minY = imageData.height, maxX = 0, maxY = 0;
		for(let y = startY; y < startY + imageH; y++) {
			for(let x = startX; x < startX + imageW; x++) {
				let i = (y * imageData.width + x) * 4;
				if(imageData.data[i + 3] > 0) {
					if(x < minX) minX = x;
					if(x > maxX) maxX = x;
					if(y < minY) minY = y;
					if(y > maxY) maxY = y;
				}
			}
		}
		return { minX, minY, maxX, maxY };
	}
	/** Add an outline around each texture.
	 * @param {OffscreenCanvas} ogCan
	 * @param {Array<Rectangle>} imagePositions
	 * @param {HoloPrintConfig} config
	 * @param {ImageData} [imageData]
	 * @returns {OffscreenCanvas}
	 */
	static addTextureOutlines(ogCan, imagePositions, config, imageData) {
		let scale = max(1 / config.TEXTURE_OUTLINE_WIDTH, 1);
		let can = new OffscreenCanvas(ogCan.width * scale, ogCan.height * scale);
		
		let ctx = can.getContext("2d");
		ctx.imageSmoothingEnabled = false;
		ctx.drawImage(ogCan, 0, 0, can.width, can.height);
		
		imageData ??= ogCan.getContext("2d").getImageData(0, 0, ogCan.width, ogCan.height);
		
		ctx.fillStyle = config.TEXTURE_OUTLINE_COLOR;
		ctx.globalAlpha = config.TEXTURE_OUTLINE_OPACITY;
		
		/** difference: will compare alpha channel difference; threshold: will only look at the second pixel @type {("threshold" | "difference")} */
		const TEXTURE_OUTLINE_ALPHA_DIFFERENCE_MODE = "threshold";
		/** If using difference mode, will draw outline between pixels with at least this much alpha difference; if using threshold mode, will draw outline on pixels next to pixels with an alpha less than or equal to this @type {Number} */
		const TEXTURE_OUTLINE_ALPHA_THRESHOLD = 0;
		// @ts-expect-error
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
	/**
	 * Calculates the transparencies of each image fragment.
	 * @param {ImageData} imageData
	 * @param {Array<Rectangle>} imageFragments
	 * @returns {Array<number>}
	 */
	#getImageFragmentTransparencies(imageData, imageFragments) {
		return imageFragments.map(({ x: startX, y: startY, w, h }) => {
			let totalTransparency = 0;
			for(let x = startX; x < startX + w; x++) {
				for(let y = startY; y < startY + h; y++) {
					let i = (y * imageData.width + x) * 4;
					totalTransparency += 255 - imageData.data[i + 3];
				}
			}
			return totalTransparency / (w * h);
		});
	}
	#setCanvasOpacity(can, alpha) {
		let newCan = new OffscreenCanvas(can.width, can.height);
		let ctx = newCan.getContext("2d", {
			willReadFrequently: true
		});
		ctx.globalAlpha = alpha;
		ctx.drawImage(can, 0, 0);
		return newCan;
	}
	/**
	 * Tints some image data.
	 * @param {ImageData} imageData
	 * @param {Vec3} tint
	 * @param {boolean} onlyAlpha If only full opacity pixels should be tinted and transparent pixels made opaque, or not
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
	 * @param {number} opacity 0-1
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

/** @import { TextureReference, TextureFragment, ImageFragment, HoloPrintConfig, Vec3, Vec2, Rectangle, ImageUv } from "./HoloPrint.js" */
/** @import * as Data from "./data/schemas" */