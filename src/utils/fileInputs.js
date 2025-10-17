import { dispatchInputEvents } from "./dom.js";

/**
 * Sets a file input's files and dispatches input and change events.
 * @param {HTMLInputElement} fileInput
 * @param {FileList | File[]} files
 */
export function setFileInputFiles(fileInput, files) {
	if(!files.length) {
		return;
	}
	if(Array.isArray(files)) {
		files = fileArrayToFileList(files);
	}
	fileInput.files = files;
	dispatchInputEvents(fileInput);
}
/**
 * Adds files to a file input.
 * @param {HTMLInputElement} fileInput
 * @param {File[]} files
 */
export function addFilesToFileInput(fileInput, files) {
	if(!files.length) {
		return;
	}
	setFileInputFiles(fileInput, [...fileInput.files, ...files]);
}
/**
 * Turns an array of files into a FileList.
 * @param {File[]} files
 * @returns {FileList}
 */
export function fileArrayToFileList(files) {
	let dataTransfer = new DataTransfer();
	files.forEach(file => dataTransfer.items.add(file));
	return dataTransfer.files;
}
/**
 * Clears all the files in a file input.
 * @param {HTMLInputElement} fileInput
 */
export function clearFileInput(fileInput) {
	fileInput.files = (new DataTransfer()).files;
	dispatchInputEvents(fileInput);
}