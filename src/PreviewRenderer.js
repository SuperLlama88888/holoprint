import { abs, AsyncFactory, cosDeg, distanceSquared, downloadFile, JSONSet, max, min, pi, round, sinDeg, subVec2, tanDeg, toImageData } from "./utils.js";
import PolyMeshMaker from "./PolyMeshMaker.js";

import Stats from "stats.js"; // library not a file

/** @type {typeof import("three")} */
let THREE;
let OrbitControls;

const IN_PRODUCTION = false;

export default class PreviewRenderer extends AsyncFactory {
	static #CAMERA_FOV = 70; // degrees
	static #POINT_LIGHT_MAX_DISTANCE = 30; // pixels
	static #POINT_LIGHTS = {
		"lantern": 0xFFAA55,
		"redstone_torch": 0x990000,
		"powered_repeater": 0x330000,
		"powered_comparator": 0x330000,
		"end_rod": [0xD0C9BE, 67.5],
		"fire": 0xFF9955,
		"lava": 0xFF9955,
		"campfire[extinguished=0]": [0xFF9955, 37.5],
		"soul_campfire[extinguished=0]": [0x00FFFF, 25],
		"cave_vines_body_with_berries": [0xFFAA66, 37.5],
		"cave_vines_head_with_berries": [0xFFAA66, 37.5],
		
		"torch": 0xEFE39D, // source: https://learn.microsoft.com/en-us/minecraft/creator/documents/deferredlighting/lightingcustomization?view=minecraft-bedrock-stable
		"soul_lantern": 0x00FFFF,
		"soul_torch": 0x00FFFF
	};
	static #POINT_LIGHT_DEFAULT_INTENSITY = 75;
	static #DIRECTIONAL_LIGHT_STRENGTH = 1.57;
	static #FLOOR_SHADOW_DARKNESS = 0.3;
	
	cont;
	packName;
	textureAtlas;
	structureSize;
	blockPalette;
	polyMeshTemplatePalette;
	blockIndices;
	options = {
		showSkybox: true,
		maxPointLights: 100, // limited by WebGL uniform limit since Three.js uses uniforms to pass lights to shaders
		directionalLightHeight: 1, // multiples of the max dimension
		directionalLightAngle: 120,
		directionalLightShadowMapResolution: 2,
		highResolution: false,
		debugHelpersVisible: false,
		showFps: true,
		showOptions: true
	};
	#canvasSize = min(window.innerWidth, window.innerHeight) * 0.8;
	#loadingMessage;
	#can;
	#imageBlob;
	/** @type {ImageData} */
	#imageBlobData;
	/** @type {THREE.Vector3} */
	#center;
	#maxDim;
	#maxDimPixels;
	#lastFrameTime = performance.now();
	/** @type {Array<Array<Vec3>>} */
	#blockPositions = [];
	/** @type {THREE.DirectionalLight} */
	#directionalLight;
	/** @type {Array<PreviewPointLight>} */
	#pointLights = [];
	/** @type {Array<THREE.PointLight>} */
	#pointLightsInScene = [];
	/** @type {WeakMap<THREE.PointLight, THREE.PointLightHelper>} */
	#pointLightHelpers = new WeakMap();
	/** @type {THREE.WebGLRenderer} */
	#renderer;
	/** @type {THREE.Scene} */
	#scene;
	/** @type {THREE.PerspectiveCamera} */
	#camera;
	/** @type {OrbitControls} */
	#controls;
	/** @type {THREE.CubeTexture} */
	#skyboxCubemap;
	#shouldRenderNextFrame = true;
	#stats;
	#optionsGui;
	/** @type {Array<THREE.Object3D>} */
	#debugHelpers = [];
	/**
	 * Create a preview renderer for a completed geometry file.
	 * @param {Node} cont
	 * @param {string} packName
	 * @param {TextureAtlas} textureAtlas
	 * @param {I32Vec3} structureSize
	 * @param {Array<Block>} blockPalette
	 * @param {Array<Array<PolyMeshTemplateFaceWithUvs>>} polyMeshTemplatePalette
	 * @param {[Int32Array, Int32Array]} blockIndices
	 * @param {Partial<typeof this.options>} [options]
	 */
	constructor(cont, packName, textureAtlas, structureSize, blockPalette, polyMeshTemplatePalette, blockIndices, options = {}) {
		super();
		this.cont = cont;
		this.packName = packName;
		this.textureAtlas = textureAtlas;
		this.structureSize = structureSize;
		this.blockPalette = blockPalette;
		this.polyMeshTemplatePalette = polyMeshTemplatePalette;
		this.blockIndices = blockIndices;
		this.options = { ...this.options, ...options };
		
		this.#can = document.createElement("canvas");
		this.#imageBlob = this.textureAtlas.imageBlobs.at(-1)[1];
		this.#maxDim = max(...this.structureSize);
		this.#maxDimPixels = this.#maxDim * 16;
		
		this.#loadingMessage = document.createElement("div");
		this.#loadingMessage.classList.add("previewMessage");
		let p = document.createElement("p");
		let span = document.createElement("span");
		span.dataset.translate = "preview.loading";
		p.appendChild(span);
		let loader = document.createElement("div");
		loader.classList.add("loader");
		p.appendChild(loader);
		this.#loadingMessage.appendChild(p);
		this.cont.appendChild(this.#loadingMessage);
		
		if(this.options.showFps) {
			this.#stats = new Stats();
			this.#stats.showPanel(0);
			this.#stats.dom.classList.add("statsPanel");
			this.#stats.dom.childNodes.forEach(can => {
				if(!(can instanceof HTMLCanvasElement)) {
					return;
				}
				let ctx = can.getContext("2d");
				const defaultFontFamilies = "Helvetica"; // https://github.com/mrdoob/stats.js/blob/71e88f65280fd5c6e91d1f84f0f633d372ed7eae/src/Stats.js#L128
				ctx.font = ctx.font.replace(defaultFontFamilies, `"Space Grotesk", ${defaultFontFamilies}`);
			});
		}
		if(this.options.showOptions) {
			/** @type {LilGui} */
			let guiEl = document.createElement("lil-gui");
			this.cont.appendChild(guiEl);
			this.#optionsGui = guiEl.gui;
			this.#optionsGui.$title.dataset.translate = "preview.options";
			this.#optionsGui.hide();
			this.#optionsGui.close();
			this.#optionsGui.onChange(() => {
				this.#shouldRenderNextFrame = true;
			});
		}
	}
	async init() {
		THREE ??= await import("three");
		OrbitControls ??= (await import("three/examples/jsm/controls/OrbitControls.js")).OrbitControls;
		
		this.#center = new THREE.Vector3(-this.structureSize[0] * 8, this.structureSize[1] * 8, -this.structureSize[2] * 8);
		this.#imageBlobData = await toImageData(this.#imageBlob);
		
		this.#renderer = new THREE.WebGLRenderer({
			canvas: this.#can,
			alpha: true,
			antialias: true,
		});
		this.#renderer.setPixelRatio(window.devicePixelRatio);
		this.#renderer.shadowMap.enabled = true;
		this.#renderer.shadowMap.type = THREE.PCFShadowMap;
		this.#setupCameraAndControls();
		this.#setSize();
		this.#scene = new THREE.Scene();
		this.#controls.addEventListener("change", () => {
			this.#shouldRenderNextFrame = true;
			const epsilon = 0.001;
			const targetFps = 60;
			let timeSinceLastFrame = performance.now() - this.#lastFrameTime;
			let fps = 1000 / timeSinceLastFrame;
			let effectiveEpsilon = epsilon * targetFps / fps;
			if(abs(this.#controls._sphericalDelta.phi) < effectiveEpsilon) {
				this.#controls._sphericalDelta.phi = 0;
			}
			if(abs(this.#controls._sphericalDelta.theta) < effectiveEpsilon) {
				this.#controls._sphericalDelta.theta = 0;
			}
		});
		
		this.#addLighting();
		await this.#initBackground();
		this.#loop();
		this.#loadingMessage.replaceWith(this.#can);
		
		if(this.options.showFps) {
			this.cont.appendChild(this.#stats.dom);
		}
		if(this.options.showOptions) {
			if(this.#pointLights.length > 0) {
				this.#guiLocName(this.#optionsGui.add(this.options, "maxPointLights", 0, this.#pointLights.length, 1).onChange(() => this.#createPointLightsInScene()), "preview.options.maxPointLights");
			}
			let shadowOption;
			this.#guiLocName(this.#optionsGui.add(this.#directionalLight, "castShadow").onChange(() => {
				if(this.#directionalLight.castShadow) {
					shadowOption.show();
				} else {
					shadowOption.hide();
				}
			}), "preview.options.shadowsEnabled");
			shadowOption = this.#guiLocName(this.#optionsGui.add(this.options, "directionalLightShadowMapResolution", 1, 5, 1).onChange(() => this.#updateDirectionalLightShadowMapSize()), "preview.options.shadowQuality");
			this.#guiLocName(this.#optionsGui.add(this.options, "directionalLightAngle", 0, 360, 1), "preview.options.lightAngle");
			this.#guiLocName(this.#optionsGui.add(this.options, "directionalLightHeight", 0.1, 2, 0.01), "preview.options.lightHeight");
			this.#guiLocName(this.#optionsGui.add(this.options, "showSkybox").onChange(() => this.#initBackground()), "preview.options.showSkybox");
			this.#guiLocName(this.#optionsGui.add(this.options, "highResolution").onChange(() => this.#setSize()), "preview.options.highRes");
			this.#guiLocName(this.#optionsGui.add(this, "downloadScreenshot"), "preview.options.takeScreenshot");
			if(!IN_PRODUCTION) {
				this.#optionsGui.add(this.options, "debugHelpersVisible").onChange(() => {
					if(this.options.debugHelpersVisible) {
						this.#scene.add(...this.#debugHelpers);
					} else {
						this.#scene.remove(...this.#debugHelpers);
					}
				}).name("Debug");
			}
			this.#optionsGui.show();
		}
		
		// let animator = this.#viewer.getModel().animator;
		// let animation = this.animations["animations"]["animation.armor_stand.hologram.spawn"];
		// Object.values(animation["bones"] ?? {}).map(bone => Object.values(bone).forEach(animationChannel => {
		// 	animationChannel["Infinity"] = Object.values(animationChannel).at(-1); // hold last keyframe. 
		// }));
		// animator.addAnimation("spawn", animation);
		// animator.play("spawn");
		
		let texture = await this.#createTexture();
		let regularMat = new THREE.MeshLambertMaterial({
			map: texture,
			side: THREE.DoubleSide,
			alphaTest: 0.2
		});
		let transparentMat = new THREE.MeshLambertMaterial({
			map: texture,
			side: THREE.DoubleSide,
			alphaTest: 0.2,
			transparent: true
		});
		for(let i in this.#blockPositions) {
			let polyMeshTemplate = this.polyMeshTemplatePalette[i];
			if(!polyMeshTemplate.length) {
				continue;
			}
			let geo = this.#polyMeshTemplateToBufferGeo(polyMeshTemplate);
			let positions = this.#blockPositions[i].map(([x, y, z]) => [-16 * x - 16, 16 * y, -16 * z - 16]);
			let isTranslucent = this.#isPolyMeshTemplateTranslucent(polyMeshTemplate);
			let material = isTranslucent? transparentMat : regularMat;
			let instancedMesh = this.#instanceBufferGeoAtPositions(geo, positions, material);
			if(isTranslucent) {
				instancedMesh.renderOrder = positions.length; // more common transparent blocks will be rendered after less common transparent blocks, minimising the amount of visual issues
			}
			instancedMesh.castShadow = true;
			instancedMesh.receiveShadow = true;
			this.#scene.add(instancedMesh);
			this.#shouldRenderNextFrame = true;
		}
	}
	/** Downloads a screenshot of the preview. */
	downloadScreenshot() {
		this.#render();
		this.#renderer.domElement.toBlob(imageBlob => {
			let imageFile = new File([imageBlob], `Screenshot ${this.packName}.png`);
			downloadFile(imageFile);
		});
	}
	
	#loop() {
		this.#controls.update();
		if(this.#shouldRenderNextFrame) {
			this.#shouldRenderNextFrame = false;
			this.#render();
		}
		
		this.#lastFrameTime = performance.now();
		window.requestAnimationFrame(() => this.#loop());
	}
	#render() {
		this.#stats?.begin();
		
		this.#setDirectionalLightPos();
		this.#updatePointLights();
		// console.log(this.#renderer.capabilities.maxVertexUniforms, this.#renderer.capabilities.maxFragmentUniforms);
		this.#renderer.render(this.#scene, this.#camera);
		
		this.#stats?.end();
	}
	/**
	 * Adds the localised name to a lil-gui controller.
	 * @template {Controller} T
	 * @param {T} controller
	 * @param {string} translationKey
	 * @returns {T}
	 */
	#guiLocName(controller, translationKey) {
		controller.$name.dataset.translate = translationKey;
		return controller;
	}
	/** Sets the canvas size, scaling up if the high resolution option is enabled. */
	#setSize() {
		let size = this.#canvasSize * (this.options.highResolution + 1);
		this.#renderer.setSize(size, size, false);
	}
	/** Sets the directional light position. */
	#setDirectionalLightPos() {
		let lightSin = sinDeg(this.options.directionalLightAngle);
		let lightCos = cosDeg(this.options.directionalLightAngle);
		this.#directionalLight.position.set(this.#center.x + this.#maxDimPixels * lightSin, this.#center.y + this.#maxDimPixels * this.options.directionalLightHeight, this.#center.z + this.#maxDimPixels * lightCos);
	}
	/** Initialises and positions the camera and orbit controls. */
	#setupCameraAndControls() {
		let controlsMaxDist = this.#maxDimPixels / tanDeg(PreviewRenderer.#CAMERA_FOV / 2) * 5;
		this.#camera = new THREE.PerspectiveCamera(PreviewRenderer.#CAMERA_FOV, 1, 0.1, controlsMaxDist * 1.25);
		this.#controls = new OrbitControls(this.#camera, this.#can);
		this.#controls.minDistance = 10;
		this.#controls.maxDistance = controlsMaxDist;
		this.#controls.enableDamping = true;
		this.#controls.dampingFactor = 0.1;
		
		// this part is adapted from @bridge-core/model-viewer, itself adapted from https://github.com/mrdoob/three.js/issues/6784#issuecomment-315963625
		const scale = 1.7;
		let boundingBox = new THREE.Box3(new THREE.Vector3(this.structureSize[0] * -16, 0, this.structureSize[2] * -16), new THREE.Vector3(0, this.structureSize[1] * 16, 0));
		let boundingSphere = boundingBox.getBoundingSphere(new THREE.Sphere());
		let objectAngularSize = this.#camera.fov * scale;
		let distanceToCamera = boundingSphere.radius / tanDeg(objectAngularSize / 2);
		let len = distanceToCamera * Math.SQRT2;
		this.#camera.position.set(len, len, len);
		this.#camera.lookAt(boundingSphere.center);
		this.#camera.updateProjectionMatrix();
		this.#controls.target.copy(boundingSphere.center);
		
		this.#debugHelpers.push(new THREE.AxesHelper(16));
	}
	/** Adds the main directional light, the z-lights, the ambient light, the shadow floor, and the point lights. */
	#addLighting() {
		this.#directionalLight = new THREE.DirectionalLight(0xFFFFFF, PreviewRenderer.#DIRECTIONAL_LIGHT_STRENGTH);
		this.#directionalLight.position.set(this.#center.x + this.#maxDimPixels, this.#center.y + this.#maxDimPixels, this.#center.z + this.#maxDimPixels);
		this.#directionalLight.target.position.copy(this.#center);
		this.#directionalLight.castShadow = true;
		this.#directionalLight.shadow.camera.near = 0.1;
		this.#directionalLight.shadow.camera.far = this.#maxDimPixels * 4;
		this.#directionalLight.shadow.camera.left = -this.#maxDimPixels;
		this.#directionalLight.shadow.camera.right = this.#maxDimPixels;
		this.#directionalLight.shadow.camera.bottom = -this.#maxDimPixels;
		this.#directionalLight.shadow.camera.top = this.#maxDimPixels;
		this.#directionalLight.shadow.bias = -0.001;
		this.#directionalLight.shadow.normalBias = 0.1;
		this.#scene.add(this.#directionalLight);
		this.#scene.add(this.#directionalLight.target);
		this.#updateDirectionalLightShadowMapSize();
		this.#debugHelpers.push(new THREE.CameraHelper(this.#directionalLight.shadow.camera));
		
		// these lights add extra shading on z-facing faces. this is vanilla MC behaviour. lines 53-54 in shaders/glsl/entity.vertex
		let zLight1 = new THREE.DirectionalLight(0xFFFFFF, 0.31);
		zLight1.position.set(this.#center.x + this.#maxDimPixels * 0.6, this.#center.y + this.#maxDimPixels, this.#center.z + this.#maxDimPixels * 3);
		zLight1.target.position.copy(this.#center);
		this.#scene.add(zLight1);
		this.#scene.add(zLight1.target);
		let zLight2 = new THREE.DirectionalLight(0xFFFFFF, 0.31);
		zLight2.position.set(this.#center.x - this.#maxDimPixels * 0.6, this.#center.y + this.#maxDimPixels, this.#center.z - this.#maxDimPixels * 3);
		zLight2.target.position.copy(this.#center);
		this.#scene.add(zLight2);
		this.#scene.add(zLight2.target);
		this.#debugHelpers.push(new THREE.DirectionalLightHelper(zLight1, 5), new THREE.DirectionalLightHelper(zLight2, 5));
		
		let ambientLight = new THREE.AmbientLight(0xFFFFFF, 1.88);
		this.#scene.add(ambientLight);
		
		let shadowFloor = new THREE.Mesh(new THREE.PlaneGeometry(this.#maxDimPixels * 5, this.#maxDimPixels * 5), new THREE.ShadowMaterial({
			opacity: PreviewRenderer.#FLOOR_SHADOW_DARKNESS
		}));
		shadowFloor.rotation.x = -pi / 2;
		shadowFloor.position.set(this.#center.x, 0, this.#center.z);
		shadowFloor.receiveShadow = true;
		this.#scene.add(shadowFloor);
		
		this.#initPointLights();
		this.#createPointLightsInScene();
	}
	/**
	 * Checks if a block matches a stringified block.
	 * @param {string} stringifiedBlock
	 * @param {Block} block
	 */
	#checkBlockNameAndStates(stringifiedBlock, block) {
		let blockName = stringifiedBlock.includes("[")? stringifiedBlock.slice(0, stringifiedBlock.indexOf("[")) : stringifiedBlock;
		if(blockName != block["name"]) {
			return false;
		}
		let allBlockStates = stringifiedBlock.match(/\[(.+)\]/)?.[1];
		if(allBlockStates) {
			let blockStates = allBlockStates.split(",").map(stateAndValue => stateAndValue.split("="));
			if(!blockStates.every(([name, value]) => block["states"]?.[name] == value)) {
				return false;
			}
		}
		return true;
	}
	/** Sets the size of the directional light's shadow map. */
	#updateDirectionalLightShadowMapSize() {
		let optionsFactor = 2 ** (this.options.directionalLightShadowMapResolution - 2);
		let shadowMapSize = (this.#maxDim < 24? 1024 : this.#maxDim < 45? 2048 : 4096) * optionsFactor;
		this.#directionalLight.shadow.mapSize.set(shadowMapSize, shadowMapSize)
		this.#directionalLight.shadow.map?.setSize(shadowMapSize, shadowMapSize);
	}
	#initPointLights() {
		let palettePointLights = this.blockPalette.map(block => PreviewRenderer.#POINT_LIGHTS[block["name"]] ?? Object.entries(PreviewRenderer.#POINT_LIGHTS).find(([stringifiedBlock]) => this.#checkBlockNameAndStates(stringifiedBlock, block))?.[1]);
		for(let x = 0; x < this.structureSize[0]; x++) {
			for(let y = 0; y < this.structureSize[1]; y++) {
				for(let z = 0; z < this.structureSize[2]; z++) {
					let blockI = (x * this.structureSize[1] + y) * this.structureSize[2] + z;
					for(let layerI = 0; layerI < 2; layerI++) {
						let paletteI = this.blockIndices[layerI][blockI];
						if(!(paletteI in this.polyMeshTemplatePalette)) {
							continue;
						}
						this.#blockPositions[paletteI] ??= [];
						this.#blockPositions[paletteI].push([x, y, z]);
						
						let lightInfo = palettePointLights[paletteI];
						if(lightInfo) {
							let [col, intensity] = Array.isArray(lightInfo)? lightInfo : [lightInfo, PreviewRenderer.#POINT_LIGHT_DEFAULT_INTENSITY];
							this.#pointLights.push({
								"pos": [-16 * x - 8, 16 * y + 8, -16 * z - 8],
								"col": new THREE.Color(col),
								"intensity": intensity
							});
						}
					}
				}
			}
		}
		this.options.maxPointLights = min(this.options.maxPointLights, this.#pointLights.length);
	}
	/** Syncs the number of point lights in the scene with how many should be rendered. */
	#createPointLightsInScene() {
		while(this.#pointLightsInScene.length < this.options.maxPointLights) {
			let light = new THREE.PointLight(0, 0, PreviewRenderer.#POINT_LIGHT_MAX_DISTANCE, 0.35);
			this.#pointLightsInScene.push(light);
			this.#scene.add(light);
			let helper = new THREE.PointLightHelper(light, PreviewRenderer.#POINT_LIGHT_MAX_DISTANCE);
			this.#debugHelpers.push(helper);
			this.#pointLightHelpers.set(light, helper);
			if(this.options.debugHelpersVisible && this.#debugHelpers.length) {
				this.#scene.add(helper);
			}
		}
		while(this.#pointLightsInScene.length > this.options.maxPointLights) {
			let light = this.#pointLightsInScene.pop();
			this.#scene.remove(light);
			let helper = this.#pointLightHelpers.get(light);
			this.#scene.remove(helper);
			this.#debugHelpers.splice(this.#debugHelpers.indexOf(helper), 1);
		}
	}
	/** Finds which point lights should be rendered, and shows them. */
	#updatePointLights() {
		let maxLightsInScene = min(this.#pointLights.length, this.options.maxPointLights);
		if(maxLightsInScene == 0) {
			return;
		}
		let cameraPosVec = this.#camera.getWorldPosition(new THREE.Vector3());
		let cameraPos = [cameraPosVec.x, cameraPosVec.y, cameraPosVec.z];
		
		let lightsInView = this.#getPointLightsInView();
		
		let sortedLights = lightsInView.sort((a, b) => distanceSquared(a.pos, cameraPos) - distanceSquared(b.pos, cameraPos));
		let closestSortedLights = sortedLights.slice(0, this.options.maxPointLights);
		
		closestSortedLights.forEach((lightInfo, i) => {
			this.#pointLightsInScene[i].visible = true;
			this.#pointLightsInScene[i].position.set(...lightInfo.pos);
			this.#pointLightsInScene[i].intensity = lightInfo["intensity"];
			this.#pointLightsInScene[i].color.copy(lightInfo["col"])
		});
		if(closestSortedLights.length < maxLightsInScene) {
			for(let i = closestSortedLights.length; i < maxLightsInScene; i++) {
				this.#pointLightsInScene[i].intensity = 0; // setting .visible = false causes lag
			}
		}
	}
	/**
	 * Finds all the point lights in the camera's view.
	 * @returns {Array<PreviewPointLight>}
	 */
	#getPointLightsInView() {
		let cameraFrustum = new THREE.Frustum();
		let projMatrix = new THREE.Matrix4();
		projMatrix.multiplyMatrices(this.#camera.projectionMatrix, this.#camera.matrixWorldInverse);
		cameraFrustum.setFromProjectionMatrix(projMatrix);
		return this.#pointLights.filter(light => {
			let lightSphere = new THREE.Sphere(new THREE.Vector3(...light["pos"]), PreviewRenderer.#POINT_LIGHT_MAX_DISTANCE);
			return cameraFrustum.intersectsSphere(lightSphere);
		});
	}
	/** Adds the background skybox, or clears the background, depending on current options. */
	async #initBackground() {
		if(this.options.showSkybox) {
			if(!this.#skyboxCubemap) {
				let loader = new THREE.CubeTextureLoader();
				loader.setPath("assets/previewPanorama/");
				this.#skyboxCubemap = await loader.loadAsync([1, 3, 4, 5, 0, 2].map(x => `${x}.png`));
			}
			this.#scene.background = this.#skyboxCubemap;
		} else {
			this.#scene.background = null;
		}
	}
	/** @returns {Promise<THREE.Texture>} */
	async #createTexture() {
		let texture = new THREE.DataTexture(this.#imageBlobData.data, this.#imageBlobData.width, this.#imageBlobData.height, THREE.RGBAFormat);
		texture.colorSpace = THREE.SRGBColorSpace;
		texture.minFilter = THREE.LinearFilter; // helps make the texture outlines more visible and far-away textures less noisy, at the expense of occasional texture bleeding
		texture.flipY = true;
		texture.needsUpdate = true;
		return texture;
	}
	/**
	 * Converts a poly mesh template to a Three.js BufferGeometry.
	 * @param {Array<PolyMeshTemplateFaceWithUvs>} polyMeshTemplate
	 * @returns {THREE.BufferGeometry}
	 */
	#polyMeshTemplateToBufferGeo(polyMeshTemplate) {
		let polyMeshMaker = new PolyMeshMaker();
		polyMeshMaker.add(polyMeshTemplate);
		let polyMesh = polyMeshMaker.export();
		let i = 0;
		let positions = [], normals = [], uvs = [], indices = [];
		polyMesh["polys"].forEach(face => {
			face.forEach(([posIndex, normalIndex, uvIndex]) => {
				let pos = polyMesh.positions[posIndex];
				positions.push(pos[0], pos[1], 16 - pos[2]);
				normals.push(...polyMesh.normals[normalIndex]);
				uvs.push(...polyMesh.uvs[uvIndex]);
			});
			indices.push(i + 2, i + 1, i, i + 2, i, i + 3);
			i += face.length;
		});
		let geo = new THREE.BufferGeometry();
		geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(positions), 3));
		geo.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(normals), 3));
		geo.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(uvs), 2));
		geo.setIndex(indices);
		geo.computeVertexNormals();
		return geo;
	}
	/**
	 * Checks whether a poly mesh template has translucent textures.
	 * @param {Array<PolyMeshTemplateFaceWithUvs>} polyMeshTemplate
	 * @returns {boolean}
	 */
	#isPolyMeshTemplateTranslucent(polyMeshTemplate) {
		let allUvs = polyMeshTemplate.map(face => {
			let uvCoords = face["vertices"].map(v => v["uv"]);
			let xs = uvCoords.map(([x]) => round(x * this.#imageBlobData.width));
			let ys = uvCoords.map(([, y]) => round((1 - y) * this.#imageBlobData.height));
			let minUvCoords = [min(...xs), min(...ys)];
			let maxUvCoords = [max(...xs), max(...ys)];
			let unscaledUvSize = subVec2(maxUvCoords, minUvCoords);
			let uv = [minUvCoords[0], minUvCoords[1]];
			let uvSize = [unscaledUvSize[0], unscaledUvSize[1]];
			return { uv, uvSize };
		});
		let uvs = Array.from(new JSONSet(allUvs));
		return uvs.some(({ uv, uvSize }) => {
			for(let x = uv[0]; x < uv[0] + uvSize[0]; x++) {
				for(let y = uv[1]; y < uv[1] + uvSize[1]; y++) {
					let i = (y * this.#imageBlobData.width + x) * 4;
					let alpha = this.#imageBlobData.data[i + 3];
					if(alpha > 0 && alpha < 255) { // any pixel with a non-full or non-empty alpha channel makes the entire geo translucent
						return true;
					}
				}
			}
			return false;
		});
	}
	/**
	 * Creates an instanced mesh from a group.
	 * @param {THREE.BufferGeometry} bufferGeo
	 * @param {Array<Vec3>} positions
	 * @param {THREE.Material} material
	 * @returns {THREE.InstancedMesh}
	 */
	#instanceBufferGeoAtPositions(bufferGeo, positions, material) { // todo: investigate better performance w/ InstancedBufferGeometry
		let instancedMesh = new THREE.InstancedMesh(bufferGeo, material, positions.length);
		let dummy = new THREE.Object3D();
		positions.forEach((pos, i) => {
			let vecPos = new THREE.Vector3(...pos);
			dummy.position.copy(vecPos);
			dummy.updateMatrix();
			instancedMesh.setMatrixAt(i, dummy.matrix);
		});
		return instancedMesh;
	}
}

/** @import { I32Vec3, Vec3, Block, PreviewPointLight, PolyMeshTemplateFaceWithUvs} from "./HoloPrint.js" */
/** @import TextureAtlas from "./TextureAtlas.js" */
/** @import LilGui from "./components/LilGui.js" */
/** @import { Controller } from "lil-gui" */
/** @import * as THREE from "three" */
/** @import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js" */