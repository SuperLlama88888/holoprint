import * as ghActionsCore from "@actions/core";
import * as fs from "fs";
import * as path from "path";
import * as http from "http";
import puppeteer from "puppeteer";
import * as mime from "mime-types";

export const browserEngine = process.argv[2]?.toLowerCase() ?? "chrome";
export const plainTextHeaders = {
	"Content-Type": "text/plain"
};

/**
 * @param {function(puppeteer.Page): Promise<boolean>} testBody
 * @param {function(http.IncomingMessage): Promise<void>} [httpReqFunc]
 */
export async function test(testBody, httpReqFunc) {
	let indexPage = await fs.promises.readFile(path.join(import.meta.dirname, "../dist/index.html"), "utf-8");
	let headImportMap = indexPage.match(/<script type="importmap">[^]+?<\/script>/)[0];
	indexPage = indexPage.replace(/<head>[^]+<\/body>/, `
		<head>${headImportMap}</head>
		<body style="background: transparent;">
			<div id="previewCont"></div>
		</body>
	`);
	
	let browser, page;
	
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
			
			let filePath = path.join(import.meta.dirname, "../dist", req.url); // serve files from the root directory
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
		httpReqFunc?.(req, res, page);
	});
	server.listen(8080, () => {
		console.log("Server listening on http://localhost:8080!");
	});
	
	let status = {}; // we modify status.passedTest inside this function so we need to pass a reference
	({ browser, page } = await setupBrowserAndPage(status));
	
	let passedTest = await testBody(page).catch(e => {
		console.error("Failed test!", e);
		return false;
	});
	
	await browser.close();
	server.close();
	
	if(passedTest && status.passedTest) {
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
		browser: browserEngine,
		args: ["--no-sandbox"]
	});
	
	let page = await browser.newPage();
	await page.setViewport({ // bigger for screenshots
		width: 1920,
		height: 1080
	});
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