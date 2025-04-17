import TextureAtlas from "./TextureAtlas.js";
import { max, min } from "./essential.js";

let THREE;
let StandaloneModelViewer;

export default class PreviewRenderer {
	viewer;
	/**
	 * Create a preview renderer for a completed geometry file.
	 * @param {HTMLElement} cont
	 * @param {TextureAtlas} textureAtlas
	 * @param {Object} geo The Minecraft geometry object
	 * @param {Object} animations Contents of the `.animation.json` file
	 * @param {Boolean} [showSkybox] If the skybox should show or not
	 */
	constructor(cont, textureAtlas, geo, animations, showSkybox = true) {
		return (async () => {
			let loadingMessage = document.createElement("div");
			loadingMessage.classList.add("previewMessage");
			let p = document.createElement("p");
			let span = document.createElement("span");
			span.dataset.translate = "preview.loading";
			p.appendChild(span);
			let loader = document.createElement("div");
			loader.classList.add("loader");
			p.appendChild(loader);
			loadingMessage.appendChild(p);
			cont.appendChild(loadingMessage);
			
			THREE ??= await import("three"); // @bridge-editor/model-viewer uses this version :(
			StandaloneModelViewer ??= (await import("@bridge-editor/model-viewer")).StandaloneModelViewer;
			
			let can = document.createElement("canvas");
			(new MutationObserver(mutations => {
				mutations.forEach(mutation => {
					if(mutation.attributeName == "style") {
						can.removeAttribute("style"); // @bridge-editor/model-viewer adds the style attribute at the start, and when the viewport is resized :(
					}
				});
			})).observe(can, {
				attributes: true
			});
			let imageBlob = textureAtlas.imageBlobs.at(-1)[1];
			let imageUrl = URL.createObjectURL(imageBlob);
			this.viewer = new StandaloneModelViewer(can, geo, imageUrl, {
				width: min(window.innerWidth, window.innerHeight) * 0.8,
				height: min(window.innerWidth, window.innerHeight) * 0.8,
				antialias: true,
				alpha: !showSkybox
			});
			this.#addLighting();
			if(showSkybox) {
				await this.#addSkybox();
			} else {
				this.viewer.scene.background = null;
			}
			await this.viewer.loadedModel;
			URL.revokeObjectURL(imageUrl);
			this.viewer.positionCamera(1.7);
			this.viewer.camera.far = 5000;
			this.viewer.camera.updateProjectionMatrix();
			this.viewer.requestRendering();
			loadingMessage.replaceWith(can);
			this.viewer.controls.minDistance = 10;
			this.viewer.controls.maxDistance = 1000;
			
			let animator = this.viewer.getModel().animator;
			let animation = animations["animations"]["animation.armor_stand.hologram.spawn"];
			Object.values(animation["bones"] ?? {}).map(bone => Object.values(bone).forEach(animationChannel => {
				animationChannel["Infinity"] = animationChannel[`${max(...Object.keys(animationChannel))}`];
			}));
			animator.addAnimation("spawn", animations["animations"]["animation.armor_stand.hologram.spawn"]);
			animator.play("spawn");
			
			return this;
		})();
	}
	#addLighting() {
		this.viewer.scene.children.shift(); // remove the default ambient light
		
		let directionalLight = new THREE.DirectionalLight(0xFFFFFF, 0.5);
		directionalLight.position.set(6, 16, 0);
		directionalLight.target.position.set(-6, 5, 5);
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