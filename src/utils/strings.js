/**
 * Measures the dimensions of a string of text.
 * @param {string} text
 * @param {string} font
 * @returns {TextMetrics}
 */
export function measureText(text, font) {
	let can = new OffscreenCanvas(0, 0);
	let ctx = can.getContext("2d", {
		willReadFrequently: true
	});
	ctx.font = font;
	return ctx.measureText(text);
}
export function stringToImageData(text, textCol = "black", backgroundCol = "white", font = "12px monospace") {
	let can = new OffscreenCanvas(0, 20);
	let ctx = can.getContext("2d", {
		willReadFrequently: true
	});
	ctx.font = font;
	can.width = ctx.measureText(text).width;
	ctx.fillStyle = backgroundCol;
	ctx.fillRect(0, 0, can.width, can.height);
	ctx.fillStyle = textCol;
	ctx.font = font;
	ctx.fillText(text, 0, 15);
	return ctx.getImageData(0, 0, can.width, can.height);
}
/**
 * Joins an array of strings with "or", localised.
 * @param {string[]} arr
 * @param {string} [language]
 * @returns {string}
 */
export function joinOr(arr, language = "en") {
	return (new Intl.ListFormat(language.replaceAll("_", "-"), {
		type: "disjunction"
	})).format(arr);
}

export function addOrdinalSuffix(num) {
	return num + (num % 10 == 1 && num % 100 != 11? "st" : num % 10 == 2 && num % 100 != 12? "nd" : num % 10 == 3 && num % 100 != 13? "rd" : "th");
}