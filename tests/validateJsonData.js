import * as ghActionsCore from "@actions/core";
import * as fs from "fs";
import * as path from "path";
import Ajv from "ajv";
import stripJsonComments from "strip-json-comments";

let ajv = new Ajv({
	allErrors: true
});

try {
	process.chdir(path.resolve(import.meta.dirname, "../src/data"));
	validateJsonFiles();
} catch(e) {
	ghActionsCore.setFailed(`Action failed with error: ${e.message}`);
}

function validateJsonFiles() {
	let jsonFiles = [];
	let files = fs.readdirSync("./");
	files.forEach(filePath => {
		if(filePath.endsWith(".json")) {
			jsonFiles.push(filePath);
		}
	});
	jsonFiles.forEach(filePath => {
		let content = fs.readFileSync(filePath, "utf8");
		let jsonContent = JSON.parse(stripJsonComments(content));
		let schemaUrl = jsonContent["$schema"];
		
		if(schemaUrl) {
			fetchSchemaAndValidate(filePath, jsonContent, schemaUrl);
		} else {
			ghActionsCore.warning(`No $schema property found in ${filePath}`);
		}
	});
}
function fetchSchemaAndValidate(filePath, jsonContent, schemaUrl) {	
	try {
		let schema = JSON.parse(fs.readFileSync(schemaUrl, "utf8"));
		let validate = ajv.compile(schema);
		let valid = validate(jsonContent);
		if(valid) {
			ghActionsCore.info(`${filePath} is valid.`);
		} else {
			ghActionsCore.setFailed(`${filePath} is invalid:\n${validate.errors.map(e => `- Property ${e.instancePath || "/"} ${e.message}`).join("\n")}`);
			ghActionsCore.startGroup("Full error details:");
			ghActionsCore.info(JSON.stringify(validate.errors));
			ghActionsCore.endGroup();
		}
	} catch(e) {
		ghActionsCore.setFailed(`Failed to fetch schema from ${schemaUrl} for ${filePath}: ${e.message}`);
	}
}