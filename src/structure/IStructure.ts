import type { Block, Vec2, Vec3 } from "../common.types.ts";

/**
 * An interface for accessing structure files, regardless of what format they're in (.mcstructure, .schem, etc.). All code operating on structures should interact with this interface, not any particular implementation.
 */
export default interface IStructure {
	readonly size: Vec3;
	readonly width: number;
	readonly height: number;
	readonly depth: number;
	/** Gets the block at some position. Returns undefined if there is no block. */
	getBlock(coords: Vec3, layer: number): Block | undefined;
	/** Gets the block and palette index at some position. Returns [undefined, -1] if there is no block. */
	getBlockAndIndex(coords: Vec3, layer: number): [Block | undefined, number];
	/** Gets the block palette index of the block at some location. -1 represents no block. TODO: make no block be undefined */
	getPaletteIndex(coords: Vec3, layer: number): number;
	/** Gets the block palette indices for both layers for a block at some location. Returns [-1, -1] if there is no block. */
	getPaletteIndicesForBothLayers(coords: Vec3): Vec2;
	getPalette(): Block[];
	getBlockIndices(): [Int32Array] | [Int32Array, Int32Array];
	/** Replaces the block palette and block indices. This is done after merging multiple structures' palettes together, so that they can all share one combined palette. It is the caller's responsibility to ensure that the indices point to entries in the palette. */
	setPaletteAndIndices(palette: Block[], blockIndices: [Int32Array] | [Int32Array, Int32Array]): void;
}