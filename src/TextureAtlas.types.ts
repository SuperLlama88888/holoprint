import type { Rectangle, Vec2, Vec3 } from "./common.types.ts";

export type TextureReference = {
	/** UV coordinates */
	uv: Vec2;
	/** UV size */
	uv_size: Vec2;
	/** Block ID to get the texture from */
	block_name: string;
	/** Which face's texture to use */
	texture_face: string;
	/** Which terrain_texture.json variant to use */
	variant: number;
	/** An overriding texture file path to look at */
	texture_path_override?: string;
	/** A terrain texture key override; will override block_name and texture_face */
	terrain_texture_override?: string;
	/** A tint override */
	tint?: Vec3;
};
export type TextureFragment = {
	texturePath: string;
	tint?: Vec3;
	tint_like_png?: boolean;
	opacity: number;
	uv: Vec2;
	uv_size: Vec2;
};
export type ImageFragment = {
	imageData: ImageData;
	/** Width */
	w: number;
	/** Height */
	h: number;
	sourceX: number;
	sourceY: number;
	crop?: Rectangle;
};
export type ImageUv = {
	uv: Vec2;
	uv_size: Vec2;
	transparency: number;
	crop?: Rectangle;
};