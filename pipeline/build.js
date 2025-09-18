import * as path from "node:path";
import * as fs from "node:fs";

import * as esbuild from "esbuild";
import { minify as minifyHTML } from "html-minifier-next";
import browserslist from "browserslist";
import { transform, browserslistToTargets } from "lightningcss";
import minifyJSON from "jsonminify";

const srcDir = "src";
const distDir = "dist";

const versionParamName = "--version=";
const exportHoloPrintLibFlagName = "--export-holoprint-lib";

const buildVersion = process.argv.find(arg => arg.startsWith(versionParamName))?.slice(versionParamName.length) ?? "testing";
const exportHoloPrintLib = process.argv.includes(exportHoloPrintLibFlagName);

const cssTargets = browserslistToTargets(browserslist(">= 0.1%"));

process.chdir(path.resolve(import.meta.dirname, "../"));
fs.cpSync(srcDir, "temp", {
	recursive: true
});
await processDir("temp");
if(fs.existsSync(distDir)) {
	fs.rmSync(distDir, {
		recursive: true
	});
}
fs.cpSync("temp", distDir, {
	recursive: true,
	filter: filename => !(path.extname(filename) == ".js" || (fs.statSync(filename).isDirectory() && fs.readdirSync(filename).every(file => path.extname(file) == ".js")))
});

let importMapJSON = fs.readFileSync(`${distDir}/index.html`, "utf-8").match(/<script type="importmap">([^]+?)<\/script>/)[1];
let externalModules = Object.keys(JSON.parse(importMapJSON)["imports"]);
let { metafile } = esbuild.buildSync({
	absWorkingDir: process.cwd(),
	entryPoints: ["temp/index.js"],
	bundle: true,
	external: externalModules,
	dropLabels: ["TS"],
	minify: true,
	format: "esm",
	outdir: distDir,
	entryNames: "[name]-[hash]",
	assetNames: "[name]-[hash]",
	loader: {
		".molang.js": "copy" // don't process these files at all, treat them as assets
	},
	sourcemap: true,
	metafile: true
});
fs.rmSync("temp", {
	recursive: true
});
console.log(esbuild.analyzeMetafileSync(metafile));
let scriptImportReplacements = [];
Object.entries(metafile["outputs"]).forEach(([output, { entryPoint }]) => {
	if(entryPoint) {
		scriptImportReplacements.push([entryPoint.replace("temp/", ""), output.replace(distDir + "/", "")]);
	}
});
fs.readdirSync(distDir).forEach(filename => {
	if(path.extname(filename) == ".html") {
		let filepath = path.join(distDir, filename);
		let html = fs.readFileSync(filepath, "utf-8");
		scriptImportReplacements.forEach(([oldName, newName]) => {
			let regExp = new RegExp(`\\b${oldName.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g");
			html = html.replaceAll(regExp, newName);
		});
		fs.writeFileSync(filepath, html);
	}
});

/**
 * @param {string} dir
 */
async function processDir(dir) {
	let directoryContents = fs.readdirSync(dir);
	await Promise.all(directoryContents.map(async filename => {
		let filepath = path.join(dir, filename);
		let stats = fs.statSync(filepath);
		if(stats.isDirectory()) {
			await processDir(filepath);
		} else {
			let processingFunction = findProcessingFunction(filepath);
			if(processingFunction) {
				let fileContent = fs.readFileSync(filepath, "utf-8");
				let { code, sourceMap } = await processingFunction(fileContent, filename);
				fs.writeFileSync(filepath, code);
				if(sourceMap) {
					fs.writeFileSync(filepath + ".map", sourceMap);
				}
			}
		}
	}));
}
/**
 * @param {string} filename
 * @returns {((code: string, filename: string) => MaybePromise<{ code: string, sourceMap?: string }>) | undefined}
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
 * @returns {Promise<{ code: string }>}
 */
async function processHTML(code, filename) {
	code = code.replaceAll(/<script type="(importmap|application\/ld\+json)">([^]+?)<\/script>/g, (_, scriptType, json) => `<script type="${scriptType}">${processJSON(json).code}</script>`);
	code = await minifyHTML(code, {
		removeComments: true,
		collapseWhitespace: true,
		collapseBooleanAttributes: true,
		sortAttributes: true,
		sortClassName: true,
		minifyCSS: css => processCSS(css, filename, true).code,
		inlineCustomElements: ["vec-3-input", "slot", "span"]
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
 * @returns {Promise<{ code: string }>}
 */
async function processJS(code, filename) {
	code = code.replace("const IN_PRODUCTION = false;", "const IN_PRODUCTION = true;");
	if(filename == "HoloPrint.js") {
		code = code.replace(`const VERSION = "dev";`, `const VERSION = "${buildVersion}";`);
	} else if(filename == "index.js") {
		if(exportHoloPrintLib) {
			code = `export * from "./HoloPrint.js";` + code;
		}
	}
	code = await replaceAllAsync(code, /html`([^]+?)`/g, async (_, html) => "`" + (await processHTML(html, filename)).code + "`");
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

/**
 * @param {string} str
 * @param {RegExp} regexp
 * @param {(substring: string, ...args: string[]) => Promise<string>} replacer
 * @returns {Promise<string>}
 */
async function replaceAllAsync(str, regexp, replacer) {
	/** @type {Promise<string>[]} */
	let promises = [];
	str.replaceAll(regexp, (substring, ...args) => {
		promises.push(replacer(substring, ...args));
		return substring;
	});
	let replacements = await Promise.all(promises);
	let i = 0;
	return str.replaceAll(regexp, () => replacements[i++]);
}

/**
 * @template T
 * @typedef {Promise<T> | T} MaybePromise
 */