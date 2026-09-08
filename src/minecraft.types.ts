export type NBTBlock = {
	/** The block's ID */
	name: string;
	/** Block states */
	states: Record<string, number | string>;
	version: number;
};
export type MinecraftAnimation = {
	animation_length?: number;
	bones?: Record<string, object>;
};