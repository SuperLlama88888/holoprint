import { testOnSourceCode } from "../headlessBrowserTestRunner.js";

testOnSourceCode(async page => {
	await page.evaluate(async () => {
		/** @type {typeof import("../../src/ResourcePackStack.js").default} */
		const ResourcePackStack = (await import("../ResourcePackStack.js")).default;
		/** @type {typeof import("../../src/MaterialList.js").default} */
		const MaterialList = (await import("../MaterialList.js")).default;
		/** @type {import("../../src/HoloPrint.js")} */
		const HoloPrint = await import("../HoloPrint.js");
		/** @type {import("../../src/utils.js").jsonc} */
		const jsonc = (await import("../utils.js")).jsonc;
		/** @type {typeof import("../../src/fetchers.js").default} */
		const fetchers = (await import("../fetchers.js")).default;
		
		let rps = new ResourcePackStack();
		let [blockMetadata, itemMetadata, materialListMappings, translationFile] = await Promise.all([
			fetchers.vanillaData("metadata/vanilladata_modules/mojang-blocks.json").then(res => res.json()),
			fetchers.vanillaData("metadata/vanilladata_modules/mojang-items.json").then(res => res.json()),
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
		// console.log(JSON.stringify(materialList.export()));
	});
	return true;
});