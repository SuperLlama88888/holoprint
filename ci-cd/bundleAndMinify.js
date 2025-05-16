import * as path from "node:path";
import * as fs from "node:fs";

import * as esbuild from "esbuild";
import { minify as minifyHTML } from "html-minifier";
import browserslist from "browserslist";
import { transform, browserslistToTargets } from "lightningcss";
import minifyJSON from "jsonminify";

process.chdir(path.resolve(import.meta.dirname, ".."));

const baseDir = "./";
const cssTargets = browserslistToTargets(browserslist(">= 0.1%"));

processDir(baseDir);

let importMapJSON = fs.readFileSync("index.html", "utf-8").match(/<script type="importmap">([^]+?)<\/script>/)[1];
let externalModules = Object.keys(JSON.parse(importMapJSON).imports);
let { metafile } = esbuild.buildSync({
	entryPoints: ["../index.js"],
	bundle: true,
	external: ["./entityScripts.molang.js", ...externalModules],
	minify: true,
	format: "esm",
	outdir: "../",
	allowOverwrite: true,
	sourcemap: true,
	metafile: true
});
fs.writeFileSync("esbuild_meta.json", JSON.stringify(metafile));

/**
 * @param {String} dir
 */
function processDir(dir) {
	let directoryContents = fs.readdirSync(dir);
	directoryContents.forEach(filename => {
		let filepath = path.join(dir, filename);
		let stats = fs.statSync(filepath);
		if(stats.isDirectory() && filename != "ci-cd") {
			processDir(filepath);
		} else {
			let processingFunction = findProcessingFunction(filepath);
			if(processingFunction) {
				let fileContent = fs.readFileSync(filepath, "utf-8");
				let { code, sourceMap } = processingFunction(fileContent, filepath);
				fs.writeFileSync(filepath, code);
				if(sourceMap) {
					fs.writeFileSync(filepath + ".map", sourceMap);
				}
			}
		}
	});
}
/**
 * @param {String} filename
 * @returns {Function|undefined}
 */
function findProcessingFunction(filename) {
	let fileExtension = path.extname(filename);
	switch (fileExtension) {
		case ".html": return processHTML;
		case ".css": return processCSS;
		case ".js": return processJS;
		case ".json":
		case ".material":
		case ".webmanifest": return processJSON;
	}
}

/**
 * @param {String} code
 * @param {String} filename
 * @returns {{ code: String }}
 */
function processHTML(code, filename) {
	code = code.replaceAll(/<style>([^]+?)<\/style>/g, (_, css) => `<style>${processCSS(css, filename, true).code}</style>`);
	code = code.replaceAll(/<script type="(importmap|application\/ld\+json)">([^]+?)<\/script>/g, (_, scriptType, json) => `<script type="${scriptType}">${processJSON(json).code}</script>`);
	code = minifyHTML(code, {
		removeComments: true,
		collapseWhitespace: true,
	});
	return { code };
}
/**
 * @param {String} code
 * @param {String} filename
 * @param {Boolean} [disableSourceMap]
 * @returns {{ code: String, sourceMap: String|undefined }}
 */
function processCSS(code, filename, disableSourceMap = false) {
	let { code: codeBytes, map: sourceMapBytes } = transform({
		filename,
		minify: true,
		code: (new TextEncoder()).encode(code),
		targets: cssTargets,
		sourceMap: !disableSourceMap
	});
	code = (new TextDecoder()).decode(codeBytes);
	let sourceMap = sourceMapBytes && (new TextDecoder()).decode(sourceMapBytes);
	return { code, sourceMap };
}
/**
 * @param {String} code
 * @param {String} filename
 * @returns {{ code: String }}
 */
function processJS(code, filename) {
	code = code.replaceAll(/html`([^]+?)`/g, (_, html) => "`" + processHTML(html, filename).code + "`");
	return { code };
}
/**
 * @param {String} code
 * @returns {{ code: String }}
 */
function processJSON(code) {
	code = minifyJSON(code);
	return { code };
}