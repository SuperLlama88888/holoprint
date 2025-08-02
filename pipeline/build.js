import * as path from "node:path";
import * as fs from "node:fs";

import * as esbuild from "esbuild";
import { minify as minifyHTML } from "html-minifier";
import browserslist from "browserslist";
import { transform, browserslistToTargets } from "lightningcss";
import minifyJSON from "jsonminify";

const versionParamName = "--version=";
const exportHoloPrintLibFlagName = "--export-holoprint-lib";

const buildVersion = process.argv.find(arg => arg.startsWith(versionParamName))?.slice(versionParamName.length) ?? "testing";
const exportHoloPrintLib = process.argv.includes(exportHoloPrintLibFlagName);

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
 * @param {string} dir
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
 * @param {string} filename
 * @returns {((code: string, filename: string) => { code: string, sourceMap?: string }) | undefined}
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
 * @param {string} code
 * @param {string} filename
 * @returns {{ code: string }}
 */
function processHTML(code, filename) {
	code = code.replaceAll(/<script type="(importmap|application\/ld\+json)">([^]+?)<\/script>/g, (_, scriptType, json) => `<script type="${scriptType}">${processJSON(json).code}</script>`);
	const inlineCustomElements = [["vec-3-input", "acronym"], ["slot", "big"]]; // acronym/big are deprecated inline elements. the minifier doesn't recognise that custom elements are inline, hence a substitution is performed right before and after the minification.
	inlineCustomElements.forEach(([elementName, replacement]) => {;
		code = code.replaceAll(`<${elementName}`, `<${replacement}`);
		code = code.replaceAll(`</${elementName}>`, `</${replacement}>`)
	});
	code = minifyHTML(code, {
		removeComments: true,
		collapseWhitespace: true,
		collapseBooleanAttributes: true,
		sortAttributes: true,
		sortClassName: true,
		minifyCSS: css => processCSS(css, filename, true).code
	});
	inlineCustomElements.forEach(([elementName, replacement]) => {
		code = code.replaceAll(`<${replacement}`, `<${elementName}`);
		code = code.replaceAll(`</${replacement}>`, `</${elementName}>`)
	});
	return { code };
}
/**
 * @param {string} code
 * @param {string} filename
 * @param {boolean} [disableSourceMap]
 * @returns {{ code: string, sourceMap?: string }}
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
 * @param {string} code
 * @param {string} filename
 * @returns {{ code: string }}
 */
function processJS(code, filename) {
	code = code.replace("const IN_PRODUCTION = false;", "const IN_PRODUCTION = true;");
	if(filename == "HoloPrint.js") {
		code = code.replace(`const VERSION = "dev";`, `const VERSION = "${buildVersion}";`);
	} else if(filename == "index.js") {
		if(exportHoloPrintLib) {
			code = `export * from "./HoloPrint.js";` + code;
		}
	}
	code = code.replaceAll(/html`([^]+?)`/g, (_, html) => "`" + processHTML(html, filename).code + "`");
	return { code };
}
/**
 * @param {string} code
 * @returns {{ code: string }}
 */
function processJSON(code) {
	code = minifyJSON(code);
	return { code };
}