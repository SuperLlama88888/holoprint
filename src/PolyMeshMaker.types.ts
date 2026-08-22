import type { Vec2, Vec3 } from "./common.types.ts";

export type PolyMesh = {
	normalized_uvs?: boolean;
	normals: Vec3[];
	uvs: Vec2[];
	positions: Vec3[];
	polys: PolyMeshFace[];
};
export type PolyMeshFace = [Vec3, Vec3, Vec3, Vec3];
export type PolyMeshTemplateFace = {
	normal: Vec3;
	textureRefI: number;
	vertices: [PolyMeshTemplateVertex, PolyMeshTemplateVertex, PolyMeshTemplateVertex, PolyMeshTemplateVertex];
};
export type PolyMeshTemplateVertex = {
	pos: Vec3;
	/** 0: top left, 1: top right, 2: bottom left, 3: bottom right */
	corner: number;
};
export type PolyMeshTemplateFaceWithUvs = {
	normal: Vec3;
	/** Average transparency per texture pixel. 255 = fully transparent, 0 = fully opaque */
	transparency: number;
	vertices: [PolyMeshTemplateVertexWithUv, PolyMeshTemplateVertexWithUv, PolyMeshTemplateVertexWithUv, PolyMeshTemplateVertexWithUv];
};
export type PolyMeshTemplateVertexWithUv = {
	pos: Vec3;
	uv: Vec2;
};