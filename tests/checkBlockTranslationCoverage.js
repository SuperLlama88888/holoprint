import { testOnSourceCode } from "./headlessBrowserTestRunner.js";

testOnSourceCode(async page => {
	await page.evaluate(async () => {
		const ResourcePackStack = (await import("../ResourcePackStack.js")).default;
		const VanillaDataFetcher = (await import("../ResourcePackStack.js")).VanillaDataFetcher;
		const MaterialList = (await import("../MaterialList.js")).default;
		const HoloPrint = await import("../HoloPrint.js");
		const jsonc = (await import("../utils.js")).jsonc;
		
		let rps = new ResourcePackStack();
		let [blockMetadata, itemMetadata, materialListMappings, translationFile] = await Promise.all([
			VanillaDataFetcher.fetch("metadata/vanilladata_modules/mojang-blocks.json").then(res => res.json()),
			VanillaDataFetcher.fetch("metadata/vanilladata_modules/mojang-items.json").then(res => res.json()),
			fetch("../data/materialListMappings.json").then(res => jsonc(res)),
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
		
		let materialList = new MaterialList(blockMetadata, itemMetadata, materialListMappings, translationFile);
		blockNames.forEach(blockName => materialList.add(blockName));
		console.log(JSON.stringify(materialList.export()));
	});
	return true;
});