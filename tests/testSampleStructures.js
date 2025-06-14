import * as ghActionsCore from "@actions/core";
import * as fs from "fs";
import * as path from "path";

import { test, plainTextHeaders, browserEngine } from "./headlessBrowserTestRunner.js";

const packUploadDir = path.join(import.meta.dirname, "completedPacks");
if(!fs.existsSync(packUploadDir)) {
	fs.mkdirSync(packUploadDir);
}
const screenshotUploadDir = path.join(import.meta.dirname, "screenshots");
if(!fs.existsSync(screenshotUploadDir)) {
	fs.mkdirSync(screenshotUploadDir);
}

test(async page => {
	let testStructurePaths = [];
	fs.readdirSync(path.join(import.meta.dirname, "sampleStructures")).forEach(filePath => {
		if(!filePath.endsWith(".mcstructure")) {
			ghActionsCore.error(`The tests/testStructures folder can only have .mcstructure files; found ${filePath}!`);
		}
		testStructurePaths.push(path.join("tests/sampleStructures", filePath));
	});
	
	let totalTime = 0;
	let packsCreated = 0;
	for(let structurePath of testStructurePaths) {
		await page.reload();
		let structureFileName = structurePath.substring(structurePath.lastIndexOf("/") + 1);
		let structureFileContent = fs.readFileSync(structurePath).toString("base64");
		try {
			totalTime += await page.evaluate(async (structureFileName, structureFileContent, browserEngine) => {
				const HoloPrint = await import("../index.js"); // testing workflow makes index.js export everything from HoloPrint.js
				
				console.group(`Testing ${structureFileName}...`);
				let structureFileBinaryData = atob(structureFileContent);
				let bytes = new Uint8Array(structureFileBinaryData.length);
				for(let i = 0; i < bytes.length; i++) {
					bytes[i] = structureFileBinaryData.charCodeAt(i);
				}
				let structureFile = new File([bytes], structureFileName);
				let previewCont = document.querySelector("#previewCont");
				let startTime = performance.now();
				let { promise: previewLoadedPromise, resolve: previewLoadedTrigger } = Promise.withResolvers();
				let pack = await HoloPrint.makePack(structureFile, {
					SPAWN_ANIMATION_ENABLED: false,
					PREVIEW_BLOCK_LIMIT: browserEngine == "chrome"? Infinity : 0, // preview renderer doesn't work on headless Firefox
					SHOW_PREVIEW_SKYBOX: false,
					SHOW_PREVIEW_WIDGETS: false
				}, undefined, previewCont, previewLoadedTrigger);
				let elapsedTime = performance.now() - startTime;
				if(browserEngine == "chrome") {
					await previewLoadedPromise;
				}
				
				await fetch("/", {
					method: "POST",
					body: pack,
					headers: {
						"Content-Type": pack.type,
						"Content-Location": pack.name
					}
				}).catch(e => console.error(`Failed to upload pack: ${e}, ${e.stack}`));
				
				return elapsedTime;
			}, path.basename(structureFileName), structureFileContent, browserEngine);
			packsCreated++;
		} catch(e) {
			console.error(`Failed to generate pack: ${e}, ${e.stack}`);
		}
		ghActionsCore.endGroup();
	}
	let timePerPack = totalTime / packsCreated;
	console.info(`Finished creating ${packsCreated}/${testStructurePaths.length} resource packs in ${totalTime.toFixed(0) / 1000}s (${timePerPack.toFixed(0) / 1000}s/pack)!`);
	
	return packsCreated == testStructurePaths.length;
}, (req, res, page) => {
	if(req.method == "POST") { // a completed pack is being uploaded
		let dataChunks = [];
		req.on("data", chunk => {
			dataChunks.push(chunk);
		});
		req.on("end", () => {
			let fileBuffer = Buffer.concat(dataChunks);
			let fileName = req.headers["content-location"];
			let fileBasename = path.basename(fileName);
			let filePath = path.join(packUploadDir, fileBasename);
			
			fs.writeFile(filePath, fileBuffer, async err => {
				if(browserEngine == "chrome") {
					try {
						let previewImage = await page.waitForSelector("#previewCont > canvas");
						await previewImage?.screenshot({
							path: path.join(screenshotUploadDir, `${fileBasename.slice(0, fileBasename.indexOf("."))}.png`),
							omitBackground: true
						});
					} catch(e) {
						console.error(`Failed to get screenshot for completed pack ${filePath}:`, e);
					}
				}
				
				if(err) {
					ghActionsCore.error(`Failed to save file to ${filePath}: ${err}`);
					res.writeHead(500, plainTextHeaders);
					res.end(`Failed to save file to ${filePath}: ${err}`);
					return;
				}
				res.writeHead(200, plainTextHeaders);
				res.end(`Saved completed pack to ${filePath}`);
			});
		});
	}
});