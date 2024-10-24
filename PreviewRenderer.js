import * as THREE from "https://esm.run/three@0.147"; // @bridge-editor/model-viewer uses this version :(
import { StandaloneModelViewer } from "https://esm.run/@bridge-editor/model-viewer";
import TextureAtlas from "./TextureAtlas.js";

export default class PreviewRenderer {
	viewer;
	/**
	 * Create a preview renderer for a completed geometry file.
	 * @param {HTMLElement} cont
	 * @param {TextureAtlas} textureAtlas
	 * @param {Object} geo Contents of the `.geo.json` file
	 * @param {Object} animations Contents of the `.animation.json` file
	 */
	constructor(cont, textureAtlas, geo, animations) {
		return (async () => {
			let can = document.createElement("canvas");
			let imageBlob = textureAtlas.imageBlobs.at(-1)[1];
			let imageUrl = URL.createObjectURL(imageBlob);
			this.viewer = new StandaloneModelViewer(can, geo["minecraft:geometry"][0], imageUrl, {
				width: window.innerWidth * 0.4,
				height: window.innerWidth * 0.4,
				antialias: true
			});
			this.#addLighting();
			await this.#addSkybox();
			await this.viewer.loadedModel;
			URL.revokeObjectURL(imageUrl);
			this.viewer.positionCamera(1.7);
			this.viewer.requestRendering();
			cont.appendChild(can);
			this.viewer.controls.minDistance = 10;
			this.viewer.controls.maxDistance = 1000;
			
			let animator = this.viewer.getModel().animator;
			animator.addAnimation("spawn", animations["animations"]["animation.armor_stand.hologram.spawn"]);
			animator.play("spawn");
			
			return this;
		})();
	}
	#addLighting() {
		this.viewer.scene.children.shift(); // remove the default ambient light
		
		let directionalLight = new THREE.DirectionalLight(0xFFFFFF, 0.5);
		directionalLight.position.set(-6, 16, 10);
		directionalLight.target.position.set(6, 5, 10);
		this.viewer.scene.add(directionalLight);
		this.viewer.scene.add(directionalLight.target);
		
		let ambientLight = new THREE.AmbientLight(0xFFFFFF, 0.6);
		this.viewer.scene.add(ambientLight);
	}
	async #addSkybox() {
		let loader = new THREE.CubeTextureLoader();
		loader.setPath("assets/previewPanorama/");
		let cubemap = await loader.loadAsync([1, 3, 4, 5, 0, 2].map(x => `${x}.png`));
		this.viewer.scene.background = cubemap;
	}
}