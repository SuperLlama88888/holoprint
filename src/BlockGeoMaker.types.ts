import type * as Data from "./data/schemas";
import type { Block, Vec2 } from "./common.types.ts";

export type CubeUv = Record<Data.CardinalDirection, {
	uv: Vec2;
	uv_size: Vec2;
}>;
export type CubeWithEasyProperties = Data.Cube & Record<"x" | "y" | "z" | "w" | "h" | "d", number> & {
	block_override?: Block;
};