const ghActionsCore = require("@actions/core");
const fs = require("fs");
const path = require("path");
const http = require("http");
const puppeteer = require("puppeteer");
const mime = require("mime-types");

const plainTextHeaders = {
	"Content-Type": "text/plain"
};

test();

async function test() {
	let indexPage = await fs.promises.readFile(path.join(__dirname, "../index.html"), "utf-8");
	let headImportMap = indexPage.match(/<script type="importmap">[^]+?<\/script>/)[0];
	indexPage = indexPage.replace(/<head>[^]+<\/body>/, `
		<head>${headImportMap}</head>
		<body style="background: transparent;">
			<div id="previewCont"></div>
		</body>
	`);
	
	let server = http.createServer((req, res) => {
		if(req.method == "GET") {
			if(req.url == "/") {
				res.writeHead(200, {
					"Content-Type": "text/html"
				});
				res.write(indexPage);
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
		}
	});
	server.listen(8080, () => {
		console.log("Server listening on http://localhost:8080!");
	});
	
	let status = {}; // we modify status.passedTest inside this function so we need to pass a reference
	var { browser, page } = await setupBrowserAndPage(status); // yes I am using var here. this is so the page can be interacted with in the server code. otherwise I'd have to deal with janky vscode un-intelli-sense.
	
	await page.evaluate(async () => {
		const ResourcePackStack = (await import("../ResourcePackStack.js")).default;
		const MaterialList = (await import("../MaterialList.js")).default;
		const HoloPrint = await import("../HoloPrint.js");

		let rps = await new ResourcePackStack();
		let [blockMetadata, itemMetadata, translationFile] = await Promise.all([
			rps.fetchData("metadata/vanilladata_modules/mojang-blocks.json").then(res => res.json()),
			rps.fetchData("metadata/vanilladata_modules/mojang-items.json").then(res => res.json()),
			rps.fetchResource("texts/en_US.lang").then(res => res.text())
		]);
		let blockNames = [];
		blockMetadata["data_items"].forEach(block => {
			let blockName = block["name"].replace(/^minecraft:/, "");
			if(["hard_", "element_", "colored_torch_"].some(prefix => blockName.startsWith(prefix)) || ["chemical_heat", "compound_creator", "lab_table", "material_reducer", "underwater_torch"].includes(blockName)) { // chemistry features
				return;
			}
			if(HoloPrint.IGNORED_BLOCKS.includes(blockName)) {
				return;
			}
			blockNames.push(blockName);
		});

		let materialList = await new MaterialList(blockMetadata, itemMetadata, translationFile);
		blockNames.forEach(blockName => materialList.add(blockName));
		console.log(JSON.stringify(materialList.export()));
	});
	
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
		args: ["--no-sandbox"]
	});
	
	let page = await browser.newPage();
	page.on("console", log => {
		let logOrigin = log.location()?.url;
		let logText = log.text();
		if(logOrigin && (!logOrigin?.startsWith("http://localhost:8080/") && !logOrigin?.startsWith("pptr:evaluate;"))) {
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