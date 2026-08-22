export type HoloPrintConfig = {
	IGNORED_BLOCKS: string[];
	IGNORED_MATERIAL_LIST_BLOCKS: string[];
	SCALE: number;
	OPACITY: number;
	/** Whether to generate multiple opacity images and allow in-game switching, or have a constant opacity */
	MULTIPLE_OPACITIES: boolean;
	/** Hex RGB #xxxxxx */
	TINT_COLOR: string;
	/** 0-1 */
	TINT_OPACITY: number;
	/** Size of ghost blocks when in the mini view for layers */
	MINI_SCALE: number;
	/** Measured in pixels, x ∈ [0, 1], x ∈ 2^ℝ */
	TEXTURE_OUTLINE_WIDTH: number;
	/** A colour string */
	TEXTURE_OUTLINE_COLOR: string;
	/** 0-1 */
	TEXTURE_OUTLINE_OPACITY: number;
	SPAWN_ANIMATION_ENABLED: boolean;
	/** Length of each individual block's spawn animation (seconds) */
	SPAWN_ANIMATION_LENGTH: number;
	PLAYER_CONTROLS_ENABLED: boolean;
	CONTROLS: HoloPrintControlsConfig;
	UI_CONTROLS_ENABLED: boolean;
	RETEXTURE_CONTROL_ITEMS: boolean;
	/** How much to scale control item overlay textures. When compositing textures, MCBE scales all textures to the maximum, so the size of the overlay control texture has to be the LCM of itself and in-game items. Hence, if in-game items have a higher resolution than expected, they will probably be scaled wrong. The solution is to scale the overlay textures even more, which can be adjusted with this. */
	CONTROL_ITEM_TEXTURE_SCALE: number;
	RENAME_CONTROL_ITEMS: boolean;
	/** Clamped colour quartet */
	WRONG_BLOCK_OVERLAY_COLOR: Vec4;
	INITIAL_OFFSET: Vec3;
	/** If present, each structure's hologram will be locked to these coordinates. The last component is rotation. */
	COORDINATE_LOCK: Vec4[] | undefined;
	BACKUP_SLOT_COUNT: number;
	VALIDATE_AIR_BLOCKS: boolean;
	/** The resolution, in pixels, of each block in the layer-by-layer diagram. */
	LAYER_BY_LAYER_DIAGRAM_BLOCK_RESOLUTION: number;
	/** The name of the completed pack; will default to the structure file names */
	PACK_NAME: string | undefined;
	/** Blob for `pack_icon.png` */
	PACK_ICON_BLOB: Blob;
	AUTHORS: string[];
	DESCRIPTION: string | undefined;
	COMPRESSION_LEVEL: number;
	/** The maximum number of blocks a structure can have for rendering a preview */
	PREVIEW_BLOCK_LIMIT: number;
	SHOW_PREVIEW_SKYBOX: boolean;
	/** Whether to show or hide the FPS counter and options menu for previews */
	SHOW_PREVIEW_WIDGETS: boolean;
};
export type HoloPrintControlsConfig = {
	TOGGLE_RENDERING: ItemCriteria;
	CHANGE_OPACITY: ItemCriteria;
	TOGGLE_TINT: ItemCriteria;
	TOGGLE_VALIDATING: ItemCriteria;
	/** Both for players and armour stands */
	CHANGE_LAYER: ItemCriteria;
	DECREASE_LAYER: ItemCriteria;
	/** Single layer or all layers below */
	CHANGE_LAYER_MODE: ItemCriteria;
	MOVE_HOLOGRAM: ItemCriteria;
	ROTATE_HOLOGRAM: ItemCriteria;
	/** For players only */
	CHANGE_STRUCTURE: ItemCriteria;
	DISABLE_PLAYER_CONTROLS: ItemCriteria;
	/** Force armour stands to try and backup the hologram state for 30s. */
	BACKUP_HOLOGRAM: ItemCriteria;
};
export type Block = {
	/** The block's ID */
	name: string;
	/** Block states */
	states?: Record<string, number | string>;
	/** Block entity data */
	block_entity_data?: object;
};
export type ItemCriteria = {
	/** Item names the matching item could have. The `minecraft:` namespace will be used if no namespace is specified. */
	names: string[];
	/** Item tags the matching item could have. The `minecraft:` namespace will be used if no namespace is specified. */
	tags: string[];
};

export type GetFileType<F extends string> = F extends `${string}.json` | `${string}.material` ? any : F extends `${string}.lang` ? string : F extends `${string}.png` ? HTMLImageElement : never;
export type PathToData<N, D> = {
	dataName: N;
	data: D;
};
export type StructureDiagramsAndIndices = {
	diagrams: Blob[];
	indices: number[][];
};

export type BlockToValidate = {
	locator: string;
	block: string;
	pos: Vec3;
};

export type Rectangle = {
	x: number;
	y: number;
	w: number;
	h: number;
};
export type Vec2 = [number, number];
export type Vec3 = [number, number, number];
export type Vec4 = [number, number, number, number];
export type Tuple<T, N extends number, R extends T[] = []> = number extends N ? T[] : R["length"] extends N ? R : Tuple<T, N, [T, ...R]>;
export type Matrix<R extends number, C extends number, T = number> = R extends R ? C extends C ? (T[] & {
	length: C;
})[] & {
	length: R;
} : never : never;
export type TupleMatrix<R extends number, C extends number, T = number> = R extends R ? C extends C ? Tuple<Tuple<T, C>, R> : never : never;
export type Mat4 = [Vec4, Vec4, Vec4, Vec4];
export type I32Vec3 = Int32Array & {
	length: 3;
};
export type F32Vec8 = Float32Array & {
	length: 8;
};