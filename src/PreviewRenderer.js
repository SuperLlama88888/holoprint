import TextureAtlas from "./TextureAtlas.js";
import { abs, AsyncFactory, cosDeg, distanceSquared, downloadFile, max, min, onEventAndNow, pi, sinDeg, tan } from "./utils.js";

import { Model } from "@bridge-editor/model-viewer";

import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import * as THREE from "three";
import Stats from "stats.js";
// let StandaloneModelViewer;

const IN_PRODUCTION = false;

export default class PreviewRenderer extends AsyncFactory {
	static #CAMERA_FOV = 70; // degrees
	static #POINT_LIGHT_MAX_DISTANCE = 30; // pixels
	static #POINT_LIGHTS = {
		"lantern": 0xFFAA55,
		"redstone_torch": 0x990000,
		"powered_repeater": 0x330000,
		"powered_comparator": 0x330000,
		"end_rod": [0xD0C9BE, 1.35],
		"fire": 0xFF9955,
		"lava": 0xFF9955,
		"campfire[extinguished=0]": [0xFF9955, 0.75],
		"soul_campfire[extinguished=0]": [0x00FFFF, 0.5],
		"cave_vines_body_with_berries": [0xFFAA66, 0.75],
		"cave_vines_head_with_berries": [0xFFAA66, 0.75],
		
		"torch": 0xEFE39D, // source: https://learn.microsoft.com/en-us/minecraft/creator/documents/deferredlighting/lightingcustomization?view=minecraft-bedrock-stable
		"soul_lantern": 0x00FFFF,
		"soul_torch": 0x00FFFF
	};
	static #POINT_LIGHT_DEFAULT_INTENSITY = 1.5;
	static #DIRECTIONAL_LIGHT_STRENGTH = 0.5;
	static #FLOOR_SHADOW_DARKNESS = 0.3;
	
	cont;
	packName;
	textureAtlas;
	boneTemplatePalette;
	structureSize;
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
	#center;
	#maxDim;
	#maxDimPixels;
	#lastFrameTime = performance.now();
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
	#skyboxCubemap;
	#shouldRenderNextFrame = true;
	#stats;
	#optionsGui;
	#debugHelpers = [];
	/**
	 * Create a preview renderer for a completed geometry file.
	 * @param {Node} cont
	 * @param {string} packName
	 * @param {TextureAtlas} textureAtlas
	 * @param {I32Vec3} structureSize
	 * @param {Array<Block>} blockPalette
	 * @param {Array<BoneTemplate>} boneTemplatePalette
	 * @param {[Int32Array, Int32Array]} blockIndices
	 * @param {Partial<typeof this.options>} [options]
	 */
	constructor(cont, packName, textureAtlas, structureSize, blockPalette, boneTemplatePalette, blockIndices, options = {}) {
		super();
		this.cont = cont;
		this.packName = packName;
		this.textureAtlas = textureAtlas;
		this.structureSize = structureSize;
		this.boneTemplatePalette = boneTemplatePalette;
		this.options = { ...this.options, ...options };
		
		this.#center = new THREE.Vector3(-this.structureSize[0] * 8, this.structureSize[1] * 8, -this.structureSize[2] * 8);
		this.#maxDim = max(...this.structureSize);
		this.#maxDimPixels = this.#maxDim * 16;
		
		if(this.options.showFps) {
			this.#stats = new Stats();
			this.#stats.showPanel(0);
			this.#stats.dom.classList.add("statsPanel");
			this.#stats.dom.childNodes.forEach(can => {
				let ctx = can.getContext("2d");
				const defaultFontFamilies = "Helvetica"; // https://github.com/mrdoob/stats.js/blob/71e88f65280fd5c6e91d1f84f0f633d372ed7eae/src/Stats.js#L128
				ctx.font = ctx.font.replace(defaultFontFamilies, `"Space Grotesk", ${defaultFontFamilies}`);
			});
		}
		if(this.options.showOptions) {
			/** @type {import("./components/LilGui.js").default} */
			let guiEl = document.createElement("lil-gui");
			this.cont.appendChild(guiEl);
			this.#optionsGui = guiEl.gui;
			this.#optionsGui.title("Options");
			this.#optionsGui.hide();
			this.#optionsGui.close();
			this.#optionsGui.onChange(() => {
				this.#shouldRenderNextFrame = true;
			});
		}
		
		let palettePointLights = blockPalette.map(block => PreviewRenderer.#POINT_LIGHTS[block["name"]] ?? Object.entries(PreviewRenderer.#POINT_LIGHTS).find(([stringifiedBlock]) => this.#checkBlockNameAndStates(stringifiedBlock, block))?.[1]);
		
		for(let x = 0; x < this.structureSize[0]; x++) {
			for(let y = 0; y < this.structureSize[1]; y++) {
				for(let z = 0; z < this.structureSize[2]; z++) {
					let blockI = (x * this.structureSize[1] + y) * this.structureSize[2] + z;
					for(let layerI = 0; layerI < 2; layerI++) {
						let paletteI = blockIndices[layerI][blockI];
						if(!(paletteI in this.boneTemplatePalette)) {
							continue;
						}
						this.#blockPositions[paletteI] ??= [];
						this.#blockPositions[paletteI].push([x, y, z]);
						
						let lightInfo = palettePointLights[paletteI];
						if(lightInfo) {
							let [col, intensity] = Array.isArray(lightInfo)? lightInfo : [lightInfo, PreviewRenderer.#POINT_LIGHT_DEFAULT_INTENSITY];
							this.#pointLights.push({
								"pos": [-16 * x, 16 * y + 8, -16 * z],
								"col": col,
								"intensity": intensity
							});
						}
					}
				}
			}
		}
		this.options.maxPointLights = min(this.options.maxPointLights, this.#pointLights.length);
	}
	async init() {
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
		this.cont.appendChild(loadingMessage);
		
		// THREE ??= await import("three");
		
		let can = document.createElement("canvas");
		let imageBlob = this.textureAtlas.imageBlobs.at(-1)[1];
		let imageUrl = URL.createObjectURL(imageBlob);
		
		this.#renderer = new THREE.WebGLRenderer({
			canvas: can,
			alpha: true,
			antialias: true,
		});
		this.#renderer.setPixelRatio(window.devicePixelRatio);
		this.#renderer.shadowMap.enabled = true;
		this.#renderer.shadowMap.type = THREE.PCFShadowMap;
		this.#setupCameraAndControls(can);
		this.#scene = new THREE.Scene();
		window[onEventAndNow]("resize", () => this.#setSize());
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
		loadingMessage.replaceWith(can);
		
		if(this.options.showFps) {
			this.cont.appendChild(this.#stats.dom);
		}
		if(this.options.showOptions) {
			if(this.#pointLights.length > 0) {
				this.#optionsGui.add(this.options, "maxPointLights", 0, this.#pointLights.length, 1).name("Max point lights").onChange(() => this.#initPointLights());
			}
			let shadowOption;
			this.#optionsGui.add(this.#directionalLight, "castShadow").name("Shadows").onChange(() => {
				if(this.#directionalLight.castShadow) {
					shadowOption.show();
				} else {
					shadowOption.hide();
				}
			});
			shadowOption = this.#optionsGui.add(this.options, "directionalLightShadowMapResolution", 1, 5, 1).name("Shadow quality").onChange(() => this.#updateDirectionalLightShadowMapSize());
			this.#optionsGui.add(this.options, "directionalLightAngle", 0, 360, 1).name("Light angle");
			this.#optionsGui.add(this.options, "directionalLightHeight", 0.1, 2, 0.01).name("Light height");
			this.#optionsGui.add(this.options, "showSkybox").name("Show skybox").onChange(() => this.#initBackground());
			this.#optionsGui.add(this.options, "highResolution").name("High resolution").onChange(() => this.#setSize());
			this.#optionsGui.add(this, "downloadScreenshot").name("Screenshot");
			if(!IN_PRODUCTION) {
				this.#optionsGui.add(this.options, "debugHelpersVisible").name("Debug").onChange(() => {
					if(this.options.debugHelpersVisible) {
						this.#scene.add(...this.#debugHelpers);
					} else {
						this.#scene.remove(...this.#debugHelpers);
					}
				});
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
		
		for(let i in this.#blockPositions) {
			let geo = this.#boneTemplateToGeo(this.boneTemplatePalette[i]);
			let model = new Model(geo, imageUrl);
			let group = model.getGroup();
			group.rotation.set(0, pi, 0);
			await model.create();
			let positions = this.#blockPositions[i].map(([x, y, z]) => [-16 * x - 8, 16 * y, -16 * z + 8]);
			let material = group.getObjectByProperty("isMesh", true)?.material;
			if(!material) {
				continue;
			}
			let instancedGroup = this.#instanceGroupAtPositions(group, positions, material);
			instancedGroup.castShadow = true;
			instancedGroup.receiveShadow = true;
			this.#scene.add(instancedGroup);
			this.#shouldRenderNextFrame = true;
		}

		
		URL.revokeObjectURL(imageUrl);
	}
	async downloadScreenshot() {
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
	#setSize() {
		let size = this.#canvasSize * (this.options.highResolution + 1);
		this.#renderer.setSize(size, size, false);
	}
	#setDirectionalLightPos() {
		let lightSin = sinDeg(this.options.directionalLightAngle);
		let lightCos = cosDeg(this.options.directionalLightAngle);
		this.#directionalLight.position.set(this.#center.x + this.#maxDimPixels * lightSin, this.#center.y + this.#maxDimPixels * this.options.directionalLightHeight, this.#center.z + this.#maxDimPixels * lightCos);
	}
	#setupCameraAndControls(can) {
		this.#camera = new THREE.PerspectiveCamera(PreviewRenderer.#CAMERA_FOV, 1, 0.1, 5000); // FIX
		this.#camera.position.x = -20;
		this.#camera.position.y = 20;
		this.#camera.position.z = -20;
		this.#controls = new OrbitControls(this.#camera, can);
		this.#controls.minDistance = 10;
		this.#controls.maxDistance = this.#maxDimPixels / tan(PreviewRenderer.#CAMERA_FOV / 2) * 4;
		this.#controls.enableDamping = true;
		this.#controls.dampingFactor = 0.1;
		
		// this part is adapted from @bridge-core/model-viewer, itself adapted from https://github.com/mrdoob/three.js/issues/6784#issuecomment-315963625
		const scale = 1.7;
		let boundingSphere = new THREE.Box3(new THREE.Vector3(this.structureSize[0] * -16, 0, this.structureSize[2] * -16), new THREE.Vector3(0, this.structureSize[1] * 16, 0)).getBoundingSphere(new THREE.Sphere());
		let objectAngularSize = this.#camera.fov * pi / 180 * scale;
		let distanceToCamera = boundingSphere.radius / tan(objectAngularSize / 2);
		let len = distanceToCamera * Math.SQRT2;
		this.#camera.position.set(len, len, len);
		this.#camera.lookAt(boundingSphere.center);
		this.#camera.updateProjectionMatrix();
		this.#controls.target.set(boundingSphere.center.x, boundingSphere.center.y, boundingSphere.center.z);
	}
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
		this.#scene.add(this.#directionalLight);
		this.#scene.add(this.#directionalLight.target);
		this.#updateDirectionalLightShadowMapSize();
		this.#debugHelpers.push(new THREE.CameraHelper(this.#directionalLight.shadow.camera));
		
		// these lights add extra shading on z-facing faces. this is vanilla MC behaviour. lines 53-54 in shaders/glsl/entity.vertex
		let zLight1 = new THREE.DirectionalLight(0xFFFFFF, 0.1);
		zLight1.position.set(this.#center.x + this.#maxDimPixels * 0.6, this.#center.y + this.#maxDimPixels, this.#center.z + this.#maxDimPixels * 3);
		zLight1.target.position.copy(this.#center);
		this.#scene.add(zLight1);
		this.#scene.add(zLight1.target);
		let zLight2 = new THREE.DirectionalLight(0xFFFFFF, 0.1);
		zLight2.position.set(this.#center.x - this.#maxDimPixels * 0.6, this.#center.y + this.#maxDimPixels, this.#center.z - this.#maxDimPixels * 3);
		zLight2.target.position.copy(this.#center);
		this.#scene.add(zLight2);
		this.#scene.add(zLight2.target);
		this.#debugHelpers.push(new THREE.DirectionalLightHelper(zLight1, 5), new THREE.DirectionalLightHelper(zLight2, 5));
		
		let ambientLight = new THREE.AmbientLight(0xFFFFFF, 0.6);
		this.#scene.add(ambientLight);
		
		let shadowFloor = new THREE.Mesh(new THREE.PlaneGeometry(this.#maxDimPixels * 3, this.#maxDimPixels * 3), new THREE.ShadowMaterial({
			opacity: PreviewRenderer.#FLOOR_SHADOW_DARKNESS
		}));
		shadowFloor.rotation.x = -pi / 2;
		shadowFloor.position.set(this.#center.x, 0, this.#center.z);
		shadowFloor.receiveShadow = true;
		this.#scene.add(shadowFloor);
		
		this.#initPointLights();
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
	#updateDirectionalLightShadowMapSize() {
		let shadowMapSize = (this.#maxDim < 24? 1024 : this.#maxDim < 45? 2048 : 4096) * 2 ** (this.options.directionalLightShadowMapResolution - 2);
		this.#directionalLight.shadow.mapSize.set(shadowMapSize, shadowMapSize)
		this.#directionalLight.shadow.map?.setSize(shadowMapSize, shadowMapSize);
		this.#directionalLight.shadow.normalBias = 0.1;
	}
	#initPointLights() {
		while(this.#pointLightsInScene.length < this.options.maxPointLights) {
			let light = new THREE.PointLight(0, 0, PreviewRenderer.#POINT_LIGHT_MAX_DISTANCE, 0.7);
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
			this.#pointLightsInScene[i].color.setHex(lightInfo["col"])
		});
		if(closestSortedLights.length < maxLightsInScene) {
			for(let i = closestSortedLights.length; i < maxLightsInScene; i++) {
				this.#pointLightsInScene[i].intensity = 0; // setting .visible = false causes lag
			}
		}
	}
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
	/**
	 * Converts a bone template to a geometry object.
	 * @param {BoneTemplate} boneTemplate
	 * @returns {import("@bridge-editor/model-viewer").IGeoSchema}
	 */
	#boneTemplateToGeo(boneTemplate) {
		return {
			"description": {
				"texture_width": this.textureAtlas.atlasWidth,
				"texture_height": this.textureAtlas.atlasHeight
			},
			"bones": [boneTemplate]
		};
	}
	// these functions are for the instancing. chatgpt generated these. i have no clue how they work but they do
	#instanceGroupAtPositions(group, positions, material) {
		// Collect geometries, apply local transforms
		let geometries = [];
		group.updateWorldMatrix(true, true);
		group.traverse(child => {
			if(child.isMesh) {
				let geom = child.geometry.clone();
				let mat4 = child.matrixWorld.clone();
				geom.applyMatrix4(mat4);
				geometries.push(geom);
			}
		});
		if(geometries.length == 0) {
			console.warn("Group contains no meshes");
			return null;
		}
		// Merge geometries manually
		let mergedGeo = this.#mergeBufferGeometries(geometries);
		let instancedMesh = new THREE.InstancedMesh(mergedGeo, material, positions.length);
		let dummy = new THREE.Object3D();
		positions.forEach((pos, i) => {
			let vecPos = new THREE.Vector3(...pos);
			dummy.position.copy(vecPos);
			dummy.updateMatrix();
			instancedMesh.setMatrixAt(i, dummy.matrix);
		});
		return instancedMesh;
	}
	#mergeBufferGeometries(geometries) {
		let mergedGeometry = new THREE.BufferGeometry();
		let attributes = ["position", "uv"];
		let mergedAttributes = {};
		let attrArrays = {};
		let attrItemSizes = {};
		let vertexCountOffsets = [];
		let totalVertices = 0;
		// Track vertex offsets and gather attribute arrays
		geometries.forEach((geom, i) => {
			vertexCountOffsets[i] = totalVertices;
			attributes.forEach(name => {
				let attr = geom.getAttribute(name);
				if(!attr) {
					return;
				}
				if(!attrArrays[name]) {
					attrArrays[name] = [];
				}
				attrArrays[name].push(attr.array);
				attrItemSizes[name] = attr.itemSize;
			});
			totalVertices += geom.getAttribute("position").count;
		});
		// Merge each attribute
		Object.entries(attrArrays).forEach(([name, arrays]) => {
			let totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
			let merged = new Float32Array(totalLength);
			let offset = 0;
			arrays.forEach(arr => {
				merged.set(arr, offset);
				offset += arr.length;
			});
			mergedAttributes[name] = new THREE.BufferAttribute(merged, attrItemSizes[name]);
		});
		Object.entries(mergedAttributes).forEach(([name, attr]) => {
			mergedGeometry.setAttribute(name, attr);
		});
		// Merge indices
		let indexArrays = geometries.map((geom, i) => {
			let index = geom.index;
			let offset = vertexCountOffsets[i];
			if(!index) {
				// Build index manually if non-indexed
				let count = geom.getAttribute("position").count;
				let generated = new Uint32Array(count);
				for(let j = 0; j < count; j++) {
					generated[j] = j + offset;
				}
				return generated;
			} else {
				let arr = index.array;
				let adjusted = new Uint32Array(arr.length);
				for(let j = 0; j < arr.length; j++) {
					adjusted[j] = arr[j] + offset;
				}
				return adjusted;
			}
		});
		let totalIndexCount = indexArrays.reduce((sum, arr) => sum + arr.length, 0);
		let mergedIndex = new Uint32Array(totalIndexCount);
		let indexOffset = 0;
		indexArrays.forEach(arr => {
			mergedIndex.set(arr, indexOffset);
			indexOffset += arr.length;
		});
		mergedGeometry.setIndex(new THREE.BufferAttribute(mergedIndex, 1));
		mergedGeometry.computeVertexNormals(); // fix normals because the bridge model viewer has broken normals on rotated bones
		return mergedGeometry;
	}
}

/**
 * @typedef {import("./HoloPrint.js").I32Vec3} I32Vec3
 */
/**
 * @typedef {import("./HoloPrint.js").Block} Block
 */
/**
 * @typedef {import("./HoloPrint.js").BoneTemplate} BoneTemplate
 */
/**
 * @typedef {import("./HoloPrint.js").PreviewPointLight} PreviewPointLight
 */