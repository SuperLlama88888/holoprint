export const { min, max, floor, ceil, sqrt, round, abs, PI: pi, exp, log: ln, sin, cos, tan, hypot } = Math;
export const clamp = (n, lowest, highest) => min(max(n, lowest), highest);
export function sinDeg(deg) {
	return sin(deg * pi / 180);
}
export function cosDeg(deg) {
	return cos(deg * pi / 180);
}
export function tanDeg(deg) {
	return tan(deg * pi / 180);
}
export function rotate([x, y], angle) {
	let c = cos(angle);
	let s = sin(angle);
	return [x * c - y * s, x * s + y * c];
}
export function rotateDeg(p, deg) {
	return rotate(p, deg * pi / 180);
}
/**
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
export function gcd(a, b) {
	while(b != 0) {
		if(!(a >= 1 && b >= 1)) throw new Error(`Cannot find GCD of ${a} and ${b}`);
		[a, b] = [b, a % b]; // Euclidean algorithm
	}
	return a;
}
/**
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
export function lcm(a, b) {
	return a * b / gcd(a, b);
}
export function distanceSquared(a, b) {
	return (a[0] - b[0]) * (a[0] - b[0]) + (a[1] - b[1]) * (a[1] - b[1]) + (a[2] - b[2]) * (a[2] - b[2]);
}
export function range(a, b, c) {
	if(b == undefined && c == undefined) {
		return (new Array(a + 1)).fill().map((_, i) => i);
	} else if(c == undefined) {
		return (new Array(b - a + 1)).fill().map((_, i) => i + a);
	} else {
		return (new Array((b - a) / c + 1)).fill().map((_, i) => i * c + a);
	}
}
/**
 * Changes the rows and columns of a matrix.
 * @template {number} R
 * @template {number} C
 * @template T
 * @param {Matrix<R, C, T>} matrix
 * @returns {TupleMatrix<C, R, T>}
 */
export function transposeMatrix(matrix) {
	// @ts-ignore
	return matrix[0].map((_, i) => matrix.map(row => row[i]));
}
/**
 * @param {Mat4} mat
 * @param {Vec3 | Vec4} vec
 * @returns {Vec4}
 */
export function mulMat4([[a, b, c, d], [e, f, g, h], [i, j, k, l], [m, n, o, p]], [x, y, z, w = 1]) {
	return [
		a * x + b * y + c * z + d * w,
		e * x + f * y + g * z + h * w,
		i * x + j * y + k * z + l * w,
		m * x + n * y + o * z + p * w
	];
}

/** @import { Mat4, Matrix, TupleMatrix, Vec3, Vec4 } from "../HoloPrint.js" */