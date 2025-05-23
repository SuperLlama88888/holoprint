import * as path from "node:path";
import * as fs from "node:fs";

import * as esbuild from "esbuild";
import { minify as minifyHTML } from "html-minifier";
import browserslist from "browserslist";
import { transform, browserslistToTargets } from "lightningcss";
import minifyJSON from "jsonminify";

const buildVersion = process.argv[2] ?? "testing";
// process.chdir("..");
if(fs.existsSync("dist")) {
	fs.rmSync("dist", {
		recursive: true
	});
}
fs.cpSync("src", "dist", {
	recursive: true
});
process.chdir("dist");

const baseDir = ".";
const cssTargets = browserslistToTargets(browserslist(">= 0.1%"));

processDir(baseDir);

let importMapJSON = fs.readFileSync("index.html", "utf-8").match(/<script type="importmap">([^]+?)<\/script>/)[1];
let externalModules = Object.keys(JSON.parse(importMapJSON)["imports"]);
let { metafile } = esbuild.buildSync({
	absWorkingDir: process.cwd(),
	entryPoints: ["index.js"],
	bundle: true,
	external: ["./entityScripts.molang.js", ...externalModules],
	minify: true,
	format: "esm",
	outdir: ".",
	allowOverwrite: true,
	sourcemap: true,
	metafile: true
});
console.log(esbuild.analyzeMetafileSync(metafile));
Object.keys(metafile["inputs"]).forEach(filename => {
	if(!filename.endsWith("index.js")) {
		fs.unlinkSync(filename); // remove bundled JS files to make build smaller
	}
});

/**
 * Recursively processes all files in a directory, applying file-type-specific transformations and writing the results back to disk.
 *
 * For each file, selects an appropriate processing function based on its extension (e.g., HTML, CSS, JS, JSON) and applies it. If a source map is generated, writes it alongside the processed file.
 *
 * @param {string} dir - The path to the directory to process.
 */
function processDir(dir) {
	let directoryContents = fs.readdirSync(dir);
	directoryContents.forEach(filename => {
		let filepath = path.join(dir, filename);
		let stats = fs.statSync(filepath);
		if(stats.isDirectory()) {
			processDir(filepath);
		} else {
			let processingFunction = findProcessingFunction(filepath);
			if(processingFunction) {
				let fileContent = fs.readFileSync(filepath, "utf-8");
				let { code, sourceMap } = processingFunction(fileContent, filename);
				fs.writeFileSync(filepath, code);
				if(sourceMap) {
					fs.writeFileSync(filepath + ".map", sourceMap);
				}
			}
		}
	});
}
/**
 * Returns a file processing function based on the file extension.
 *
 * @param {string} filename - The name of the file to determine the processor for.
 * @returns {(function(string, string): { code: string, sourceMap: string|undefined })|undefined} The corresponding processing function for the file type, or `undefined` if the extension is not recognized.
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
 * Minifies HTML content and inlines minified JSON and CSS.
 *
 * Replaces `<script>` tags of type `importmap` or `application/ld+json` with their minified JSON content, and minifies the entire HTML, including inline CSS, for optimized output.
 *
 * @param {string} code - The HTML source code to process.
 * @param {string} filename - The name of the file being processed.
 * @returns {{ code: string }} An object containing the minified HTML code.
 */
function processHTML(code, filename) {
	// code = code.replaceAll(/<style>([^]+?)<\/style>/g, (_, css) => `<style>${processCSS(css, filename, true).code}</style>`);
	code = code.replaceAll(/<script type="(importmap|application\/ld\+json)">([^]+?)<\/script>/g, (_, scriptType, json) => `<script type="${scriptType}">${processJSON(json).code}</script>`);
	code = minifyHTML(code, {
		removeComments: true,
		collapseWhitespace: true,
		collapseBooleanAttributes: true,
		sortAttributes: true,
		sortClassName: true,
		minifyCSS: css => processCSS(css, filename, true).code
	});
	return { code };
}
/**
 * Minifies CSS code and generates a source map if enabled.
 *
 * Uses `lightningcss` to optimize the CSS for specified browser targets. Appends a source map reference comment to the output if a source map is generated and not disabled.
 *
 * @param {string} code - The CSS code to process.
 * @param {string} filename - The name of the CSS file being processed.
 * @param {boolean} [disableSourceMap] - If true, disables source map generation.
 * @returns {{ code: string, sourceMap?: string }} The minified CSS code and, if generated, its source map.
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
	if(sourceMapBytes) {
		code += `\n/*# sourceMappingURL=${filename}.map */`;
		let sourceMap = (new TextDecoder()).decode(sourceMapBytes);
		return { code, sourceMap };
	} else {
		return { code };
	}
}
/**
 * Transforms JavaScript source code by applying build-specific replacements and minifying embedded HTML templates.
 *
 * For `HoloPrint.js`, replaces the version constant with the current build version. For `index.js`, sets the production flag to `true`. All template literals tagged with `html` are minified using the HTML processor.
 *
 * @param {string} code - The JavaScript source code to process.
 * @param {string} filename - The name of the file being processed.
 * @returns {{ code: string }} The transformed JavaScript code.
 */
function processJS(code, filename) {
	if(filename == "HoloPrint.js") {
		code = code.replace(`const VERSION = "dev";`, `const VERSION = "${buildVersion}";`);
	} else if(filename == "index.js") {
		code = code.replace("const IN_PRODUCTION = false;", "const IN_PRODUCTION = true;");
	}
	code = code.replaceAll(/html`([^]+?)`/g, (_, html) => "`" + processHTML(html, filename).code + "`");
	return { code };
}
/**
 * Minifies JSON content by removing unnecessary whitespace and comments.
 *
 * @param {string} code - The JSON string to be minified.
 * @returns {{ code: string }} An object containing the minified JSON string.
 */
function processJSON(code) {
	code = minifyJSON(code);
	return { code };
}