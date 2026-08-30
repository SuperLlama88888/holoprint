import type { I32Vec3 } from "./common.types.ts";

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
export type MCStructure = {
	/** Format version, can be either 1 or 2. */
	format_version: number;
	/** Size of the structure in blocks. */
	size: I32Vec3;
	structure: {
		block_indices: [Int32Array, Int32Array];
		entities: EntityNBTCompound[];
		palette: {
			default: {
				block_palette: NBTBlock[];
				block_position_data?: Record<number, BlockPositionData>;
			};
		};
	};
	/** The original world position where the structure was saved. */
	structure_world_origin: I32Vec3;
};
export type EntityNBTCompound = Record<string, any>;
export type BlockPositionData = {
	/** Block entity data. */
	block_entity_data?: EntityNBTCompound;
	/** Scheduled tick information for blocks that need updates. */
	tick_queue_data?: TickQueueData[];
};
export type TickQueueData = {
	/** Number of ticks remaining before update. */
	tick_delay: number;
};