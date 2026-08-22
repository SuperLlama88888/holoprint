import type { Vec3 } from "./common.types.ts";

export type SpawnAnimationBone = {
	boneName: string;
	/** The block position (i.e. in-game blocks relative to the structure origin) */
	blockPos: Vec3;
};