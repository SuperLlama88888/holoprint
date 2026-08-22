import type { Color } from "three";
import type { Vec3 } from "./common.types.ts";

export type PreviewPointLight = {
	/** Position in Three.js space */
	pos: Vec3;
	/** A Three.js Color */
	col: Color;
	intensity: number;
};