import type { Rectangle, Vec2, Vec3 } from "./common.types.ts";

export type TextureReference = {
	/** UV coordinates */
	uv: Vec2;
	/** UV size */
	uvSize: Vec2;
	/** Block ID to get the texture from */
	blockName: string;
	/** Which face's texture to use */
	textureFace: string;
	/** Which terrain_texture.json variant to use */
	variant: number;
	/** An overriding texture file path to look at */
	texturePathOverride?: string;
	/** A terrain texture key override; will override blockName and textureFace */
	terrainTextureOverride?: string;
	/** A tint override */
	tint?: Vec3;
};
export type TextureFragment = {
	texturePath: string;
	tint?: Vec3;
	tintLikePng?: boolean;
	opacity: number;
	uv: Vec2;
	uvSize: Vec2;
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
	uvSize: Vec2;
	transparency: number;
	crop?: Rectangle;
};