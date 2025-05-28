import { testOnSourceCode } from "./headlessBrowserTestRunner.js";

testOnSourceCode(async page => {
	await page.evaluate(async () => {
		const ResourcePackStack = (await import("../ResourcePackStack.js")).default;
		const MaterialList = (await import("../MaterialList.js")).default;
		const HoloPrint = await import("../HoloPrint.js");
		
		let rps = await ResourcePackStack.new();
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
		
		let materialList = await MaterialList.new(blockMetadata, itemMetadata, translationFile);
		blockNames.forEach(blockName => materialList.add(blockName));
		console.log(JSON.stringify(materialList.export()));
	});
	return true;
});