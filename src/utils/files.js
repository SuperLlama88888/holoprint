import { groupBy } from "./arrays.js";

/**
 * Finds the basename from a file path.
 * @param {string} path
 * @returns {string}
 */
export function basename(path) {
	return path.slice(path.lastIndexOf("/") + 1);
}
/**
 * Finds the directory name from a file path. Returns an empty string if there are no directories, else will end in /.
 * @param {string} path
 * @returns {string}
 */
export function dirname(path) {
	return path.includes("/")? path.slice(0, path.lastIndexOf("/") + 1) : "";
}
/**
 * Finds the file extension from a file or filename.
 * @param {File | string} filename
 * @returns {string}
 */
export function getFileExtension(filename) {
	if(filename instanceof File) {
		filename = filename.name;
	}
	return filename.slice(filename.lastIndexOf(".") + 1);
}
/**
 * Removes the (last) file extension from a filename.
 * @param {string} filename
 * @returns {string}
 */
export function removeFileExtension(filename) {
	return filename.includes(".")? filename.slice(0, filename.lastIndexOf(".")) : filename;
}
/**
 * Groups files by their file extensions.
 * @param {File[]} files
 * @returns {Record<string, File[] | undefined>}
 */
export function groupByFileExtension(files) {
	return groupBy(files, file => getFileExtension(file));
}

/**
 * Joins many files by concatenating their contents.
 * @param {File[]} files
 * @param {string} [name]
 * @returns {File}
 */
export function concatenateFiles(files, name) {
	return new File(files, name ?? files.map(file => file.name).join(","));
}

/**
 * @param {File} file
 * @param {String} [filename]
 */
export function downloadFile(file, filename = file.name) {
	let a = document.createElement("a");
	let objectURL = URL.createObjectURL(file);
	a.href = objectURL;
	a.download = filename;
	a.click();
	URL.revokeObjectURL(objectURL);
}