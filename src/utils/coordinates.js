
/**
 * Gets the index of a block position in the structure data from its coordinates.
 * @param {Vec3} coords
 * @param {I32Vec3} structureSize
 * @returns {number}
 */
export function getStructureIndexFromCoordinates([x, y, z], structureSize) {
	return (x * structureSize[1] + y) * structureSize[2] + z;
}
/**
 * Transforms structure coordinates to Minecraft geometry coordinates.
 * @param {Vec3} coords
 * @returns {Vec3}
 */
export function getGeoSpaceBlockPos([x, y, z]) {
	return [-16 * x - 8, 16 * y, 16 * z - 8]; // I got these values from trial and error with blockbench (which makes the x negative I think. it's weird.)
}

/** @import { Vec3, I32Vec3 } from "../HoloPrint.js" */