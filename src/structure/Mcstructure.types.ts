import type { I32Vec3 } from "../common.types.ts";
import type { NBTBlock } from "../minecraft.types.ts";

export type McstructureNbt<T extends 1 | 2> = {
	/** Format version, can be either 1 or 2. */
	format_version: T;
	/** Size of the structure in blocks. */
	size: I32Vec3;
	structure: {
		block_indices: T extends 1? [Int32Array, Int32Array] : ([Int32Array] | [Int32Array, Int32Array]);
		entities: EntityNbtCompound[];
		palette: {
			default: {
				block_palette: NBTBlock[];
				block_position_data: Record<number, BlockPositionData>;
			};
		};
	};
	/** The original world position where the structure was saved. */
	structure_world_origin: I32Vec3;
};
export type EntityNbtCompound = Record<string, any>;
export type BlockPositionData = {
	/** Block entity data. */
	block_entity_data?: EntityNbtCompound;
	/** Scheduled tick information for blocks that need updates. */
	tick_queue_data?: TickQueueData[];
};
export type TickQueueData = {
	/** Number of ticks remaining before update. */
	tick_delay: number;
};