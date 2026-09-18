/** Block Eigenvariants. Eigenvariant definitions for blocks. */
export interface BlockEigenvariants {
	/** The eigenvariant for this block. */
	[key: string]: number;
}

/** Block Shape Geos. Geometry definitions for block shapes. */
export interface BlockShapeGeos {
	[key: string]: Cube[];
}
export interface Cube {
	/** An expression to control conditional rendering of the cube in C-style syntax. Block states can be referenced with their names. */
	if?: string;
	/** The coordinates of the bottom-left-back corner of the cube. */
	pos?: [number, number, number];
	/** The size of the cube in each axis. */
	size?: [number, number, number];
	/** Translates this cube or any cubes from the "copy" property. This is applied after automatic UV calculations. */
	translate?: [number, number, number];
	/** A full transformation matrix that will be applied after "translate". */
	transform?: [[number, number, number, number], [number, number, number, number], [number, number, number, number], [number, number, number, number]];
	/** The XYZ rotation of the cube (in degrees; applied in the order X-Y-Z) around its pivot. */
	rot?: [number, number, number];
	/** The center of rotation of the cube. Defaults to [8, 8, 8]. */
	pivot?: [number, number, number];
	/** UV coordinate overrides for each face. */
	uv?: Partial<Record<Face, [number, number]>>;
	/** UV size overrides for each face. */
	uvSizes?: Partial<Record<Face, [number, number]>>;
	/** Rotates the UV for each face. Processed before `flipTextureHorizontally` and `flipTextureVertically`. */
	uvRot?: Partial<Record<Face, number>>;
	/** UV coordinates for box UV. */
	boxUv?: [number, number];
	/** Size override for box UV. */
	boxUvSize?: [number, number, number];
	/** If true, the east and west faces will be flipped. Requires `boxUv`. */
	boxUvFlipEastWest?: boolean;
	/** Forces a face to use the texture of another face, or a texture located at a given file path. */
	textures?: Partial<Record<Face, TextureFace>>;
	/** Defines the expected size of the texture, for use in UV. Defaults to [16, 16]. */
	textureSize?: [number, number];
	/** Copies another block shape to use in this block shape. Translation can be achieved with the "translate" property ("pos" has no effect), and other fields will be copied over as well. */
	copy?: string;
	/** Copies an entire block. Must resolve to an object with the same structure as a block palette entry. */
	copyBlock?: string;
	/** Copies an entity's model. */
	copyEntityModel?: EntityModelInfo;
	/** Block states to be passed to the block shape copy specified in the "copy" property. */
	blockStates?: Record<string, string | number>;
	/** Forces this cube to use a specific terrain_texture.json key. */
	terrainTexture?: string;
	/** Forces this cube to use a specific variant instead of looking at block states (or the eigenvariant). */
	variant?: number;
	/** Makes a cube ignore the eigenvariant associated with this block, and instead rely on block states for variants. */
	ignoreEigenvariant?: boolean;
	/** A tinting colour in 6-digit hex or in a 32-bit ARGB number to apply to this cube (overrides TextureAtlas.#terrainTextureTints). */
	tint?: string;
	/** Makes the cube appear at maximum brightness by setting the surface normal to be vertical. */
	fullbright?: boolean;
	/** An array of faces that will have their textures horizontally flipped. */
	flipTextureHorizontally?: Face[];
	/** An array of faces that will have their textures vertically flipped. */
	flipTextureVertically?: Face[];
	/** Named arrays that can be used by other properties. Currently, only "tint" supports accessing arrays. */
	arrays?: Record<string, string[]>;
	/** Disables this cube from being automatically merged with any other cubes. */
	disableMerging?: boolean;
}
export type CardinalDirection = "west" | "east" | "down" | "up" | "north" | "south";
export type Face = CardinalDirection | "side" | "*";
export type TextureFace = `${"" | "carried."}${CardinalDirection | "side"}` | "carried" | "#tex" | "none" | TextureFilePath;
/** A file path to a texture file, without the file extension. */
type TextureFilePath = `textures/${string}`;
export interface EntityModelInfo {
	/** The geometry identifier of the model. */
	identifier: `geometry.${string}`;
	/** A file path to the geometry file which contains the identifier. */
	geoFile: `models/${string}`;
	/** Path to the texture to be used for this model. */
	texture: TextureFilePath
}

/** Block Shapes. Mappings from block names to block shapes. */
export interface BlockShapes {
	/** Regular expression patterns that will be tested if no individual block key is found. */
	patterns: Record<string, string>;
	/** Block shape mappings for individual blocks. */
	individualBlocks: Record<string, string>;
}

/** Definitions for block states that control texture variants or block rotations. */
export interface BlockStateDefinitions {
	textureVariants: {
		/** Texture-variating block state definitions for all blocks. */
		"*": BlockStateVariants;
		blockShapes: {
			[blockShape: string]: BlockStateVariants;
		};
		blockNames: {
			[blockName: string]: BlockStateVariants;
		};
	};
	rotations: {
		/** Block state rotation definitions for all blocks. */
		"*": Rotation;
		blockShapes: {
			[blockShape: string]: Rotation;
		};
		blockNames: {
			[blockName: string]: Rotation;
		};
	};
}
export type BlockStateVariants = {
	/** Whether to only look at these variants, and add them together. Defaults to false. */
	"#exclusive_add"?: boolean;
} & {
	/** Block state keys or entity property keys (e.g., "facing", "entity.color") */
	[blockStateName: string]: number[] | {
		[value: string]: number;
	};
};
export interface Rotation {
	/** Block state keys or entity property keys (e.g., "facing", "entity.rotation") */
	[key: string]: {
		[value: string]: RotationTriplet;
	} | RotationTriplet[];
}
/** X, Y, Z in degrees */
type RotationTriplet = [number, number, number];

export interface ItemIcons {
	/** Item name -> item_texture.json key. */
	[itemName: string]: string;
	/** Regular expressions to match item names. They will be processed last. */
	[itemNamePattern: `/${string}/`]: string
}

export interface MaterialListMappings {
	/** Blocks that will be ignored and will not be put in material lists. */
	ignoredBlocks: string[];
	/** Mappings for blocks with different item names. */
	blockToItemMappings: {
		[blockNameOrRegexp: string]: string;
	};
	/** Items that will have their count multiplied by a certain amount. */
	itemCountMultipliers: {
		[itemPattern: string]: number | {
			multiplier: number;
			remove: string;
		};
	};
	/** Definitions for blocks that should be split up based on a numeric block entity property. */
	specialBlockEntityProperties: {
		[blockName: string]: {
			prop: string;
			serializationIds?: string[];
		};
	};
	/** Remappings for serializationIds that go to the wrong things in .lang files. */
	serializationIdPatches: {
		/** Serialization ID. */
		[serializationId: `${"tile" | "item"}.${string}`]: `${"tile" | "item"}.${string}`;
		/** Regular expressions to match serialization IDs. */
		[regExp: `/${string}/`]: string
	};
	/** Patches for blocks missing serialization IDs. */
	blocksMissingSerializationIds: {
		[blockName: string]: string;
	};
	/** Manual translation patches. */
	translationPatches: {
		[serializationId: `${"tile" | "item"}.${string}`]: string;
	};
}

export interface TextureAtlasMappings {
	/** Block names that need to be remapped in blocks.json. */
	blocksDotJsonPatches: {
		[blockName: string]: string;
	};
	/** Blocks that should use their carried textures. */
	blocksToUseCarriedTextures: string[];
	/** Transparent blocks and their opacities. */
	transparentBlocks: {
		[blockName: string]: number;
	};
	/** Tinting information for terrain textures. This will override any tint set in `terrain_texture.json` (`overlay_color` or `tint_color`). */
	terrainTextureTints: {
		colors: {
			[colorName: string]: `#${string}`;
		};
		terrainTextureKeys: {
			[textureKey: string]: string | {
				tint: string;
				/** If true, the image will be tinted as if it were a PNG image, despite being a TGA image. (TGA images are tinted different to PNG images.) */
				tintLikePng: boolean;
			};
		};
	};
	/** File paths of flipbook textures that aren't used in-game because they're missing from flipbook_textures.json. This fixes up their UV coordinates. */
	missingFlipbookTextures: string[];
}