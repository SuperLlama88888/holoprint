import { hypot, round } from "./math.js";

/**
 * @param {Vec3} a
 * @param {Vec3} b
 * @returns {Vec3}
 */
export function add(a, b) {
	return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}
/**
 * @param {Vec3} a
 * @param {Vec3} b
 * @returns {Vec3}
 */
export function sub(a, b) {
	return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
/**
 * @param {Vec3} vec
 * @param {number} factor
 * @returns {Vec3}
 */
export function mul(vec, factor) {
	return [vec[0] * factor, vec[1] * factor, vec[2] * factor];
}
/**
 * @param {Vec3} a
 * @param {Vec3} b
 * @returns {Vec3}
 */
export function crossProduct(a, b) {
	return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
/**
 * @param {Vec3} vec
 * @returns {Vec3}
 */
export function normalize(vec) {
	return mul(vec, 1 / hypot(...vec))
}
/**
 * @param {Vec3} vec
 * @param {number} decimals
 * @returns {Vec3}
 */
export function toFixed(vec, decimals) {
	let power = 10 ** decimals;
	return [round(vec[0] * power) / power, round(vec[1] * power) / power, round(vec[2] * power) / power];
}

/** @import { Vec3 } from "../HoloPrint.js" */