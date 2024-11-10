const ghActionsCore = require("@actions/core");
const fs = require("fs");
const path = require("path");
const http = require("http");
const puppeteer = require("puppeteer");
const mime = require("mime-types");

const plainTextHeaders = {
	"Content-Type": "text/plain"
};

const browserEngine = process.argv[2]?.toLowerCase() ?? function() {
	console.warn(`Could not find browser to use in arguments: ${JSON.stringify(process.argv)}`);
	return "chrome";
}();

test();

async function test() {
	let uploadedPackFilePaths = [];
	
	let server = http.createServer((req, res) => {
		if(req.method == "GET") {
			if(req.url == "/") { // Blank page for Puppeteer
				res.writeHead(200, plainTextHeaders);
				res.end();
				return;
			}
			
			let filePath = path.join(__dirname, "../", req.url); // serve files from the root directory
			fs.stat(filePath, (err, stats) => {
				if(err || !stats.isFile()) {
					res.writeHead(404, plainTextHeaders);
					res.end(`File ${filePath} not found!`);
					return;
				}
				
				const fileStream = fs.createReadStream(filePath);
				res.writeHead(200, {
					"Content-Type": mime.lookup(req.url) || "text/plain"
				});
				fileStream.pipe(res);
			});
		} else if(req.method == "POST") {
			let uploadDir = path.join(__dirname, "completedPacks");
			if(!fs.existsSync(uploadDir)) {
				fs.mkdirSync(uploadDir);
			}
			
			let dataChunks = [];
			req.on("data", chunk => {
				dataChunks.push(chunk);
			});
			
			req.on("end", () => {
				let fileBuffer = Buffer.concat(dataChunks);
				let fileName = req.headers["content-location"];
				let filePath = path.join(uploadDir, fileName);
				
				fs.writeFile(filePath, fileBuffer, err => {
					if(err) {
						ghActionsCore.error(`Failed to save file to ${filePath}: ${err}`);
						res.writeHead(500, plainTextHeaders);
						res.end(`Failed to save file to ${filePath}: ${err}`);
						return;
					}
					res.writeHead(200, plainTextHeaders);
					res.end(`Saved completed pack to ${filePath}`);
					uploadedPackFilePaths.push(filePath);
				});
			});
		}
	});
	server.listen(8080, () => {
		console.log("Server listening on http://localhost:8080!");
	});
	
	let status = {};
	let { browser, page } = await setupBrowserAndPage(status); // we modify status.passedTest inside this function so we need to pass a reference
	
	// Evaluate the class and run the code
	let testStructurePaths = [];
	fs.readdirSync(path.join(__dirname, "sampleStructures")).forEach(filePath => {
		if(!filePath.endsWith(".mcstructure")) {
			ghActionsCore.error(`The tests/testStructures folder can only have .mcstructure files; found ${filePath}!`);
		}
		testStructurePaths.push(path.join("tests", "sampleStructures", filePath));
	});
	
	await page.evaluate(async testStructurePaths => {
		const HoloPrint = await import("./HoloPrint.js");
		let totalTime = 0;
		let packsCreated = 0;
		for(let structurePath of testStructurePaths) {
			let structureFileName = structurePath.substring(structurePath.lastIndexOf("/") + 1);
			console.group(`Testing ${structureFileName}...`);
			let structureFile = new File([await fetch(structurePath).then(res => res.blob())], structureFileName);
			let pack;
			let startTime = performance.now();
			try {
				pack = await HoloPrint.makePack(structureFile);
			} catch(e) {
				console.error(`Failed to generate pack: ${e}, ${e.stack}`);
			}
			totalTime += performance.now() - startTime;
			packsCreated++;
			if(!pack) {
				continue;
			}
			console.groupEnd();
			
			try {
				await fetch("/", {
					method: "POST",
					body: pack,
					headers: {
						"Content-Type": pack.type,
						"Content-Location": pack.name
					}
				});
			} catch(e) {
				console.error(`Failed to upload pack: ${e}, ${e.stack}`);
			}
		}
		let timePerPack = totalTime / packsCreated;
		console.info(`Finished creating ${packsCreated}/${testStructurePaths.length} resource packs in ${totalTime.toFixed(0) / 1000}s (${timePerPack.toFixed(0) / 1000}s/pack)!`);
	}, testStructurePaths);
	
	await browser.close();
	
	if(status.passedTest) {
		console.log("Passed test!");
		process.exit(0);
	} else {
		console.error(`Failed test with ${status.errors} errors and ${status.warnings} warnings!`);
		process.exit(1);
	}
}

async function setupBrowserAndPage(status) {
	status.passedTest = true;
	status.errors = 0;
	status.warnings = 0;
	
	let browser = await puppeteer.launch({
		browser: browserEngine
	});
	
	let page = await browser.newPage();
	page.on("console", log => {
		let logOrigin = log.location()?.url;
		let logText = log.text();
		if(logOrigin && (!logOrigin?.startsWith("http://localhost:8080/") && !logOrigin?.startsWith("pptr:evaluate;")) || logText.toLowerCase().includes("three.js") || logText.toLowerCase().includes("webgl")) {
			return;
		}
		switch(log.type()) {
			case "log": {
				ghActionsCore.debug(logText);
				break;
			}
			case "info": {
				ghActionsCore.info(logText);
				break;
			}
			case "error": {
				if(log.location().lineNumber == undefined) { // In Chrome, resources that fail to load throw an error but there isn't a line (or column) number, so this filters those messages out
					break;
				}
				ghActionsCore.error(logText);
				status.passedTest = false;
				status.errors++;
				break;
			}
			case "warn": {
				ghActionsCore.warning(logText);
				status.passedTest = false;
				status.warnings++;
				break;
			}
			case "debug": {
				ghActionsCore.debug(`Debug: ${logText}`);
				break;
			}
			case "startGroup":
			case "startGroupCollapsed": {
				ghActionsCore.startGroup(logText);
				break;
			}
			case "endGroup": {
				ghActionsCore.endGroup();
				break;
			}
			default: {
				ghActionsCore.info(`${log.type()}: ${logText}`);
				ghActionsCore.notice(`Unknown log type: ${log.type()}`);
			}
		}
	});
	
	await page.goto("http://localhost:8080", {
		waitUntil: "networkidle0"
	}); // Must use a HTTP server in order to be able to load the test script
	
	return { browser, page };
}