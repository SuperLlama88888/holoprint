import TextureAtlas from "./TextureAtlas.js";
import { AsyncFactory, floor, ln, max, min, onEventAndNow, pi, tan } from "./utils.js";

import { Model } from "@bridge-editor/model-viewer";

let THREE;
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
// let StandaloneModelViewer;

export default class PreviewRenderer extends AsyncFactory {
	static #DIRECTIONAL_LIGHT_STRENGTH = 0.5;
	static #FLOOR_SHADOW_DARKNESS = 0.3;
	
	cont;
	textureAtlas;
	boneTemplatePalette;
	structureSize;
	blockIndices;
	showSkybox;
	#width;
	#height;
	#renderer;
	#scene;
	#camera;
	#controls;
	
	#controlsBeingUpdated;
	/**
	 * Create a preview renderer for a completed geometry file.
	 * @param {HTMLElement} cont
	 * @param {TextureAtlas} textureAtlas
	 * @param {Array<BoneTemplate>} boneTemplatePalette
	 * @param {I32Vec3} structureSize
	 * @param {[Int32Array, Int32Array]} blockIndices
	 * @param {boolean} [showSkybox] If the skybox should show or not
	 */
	constructor(cont, textureAtlas, boneTemplatePalette, structureSize, blockIndices, showSkybox = true, blocksWithPointLights) {
		super();
		this.cont = cont;
		this.textureAtlas = textureAtlas;
		this.boneTemplatePalette = boneTemplatePalette;
		this.structureSize = structureSize;
		this.blockIndices = blockIndices;
		this.showSkybox = showSkybox;
		this.blocksWithPointLights = blocksWithPointLights;
		
		this.#width = min(window.innerWidth, window.innerHeight) * 0.8;
		this.#height = min(window.innerWidth, window.innerHeight) * 0.8;
		this.#controlsBeingUpdated = false;
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
		
		THREE ??= await import("three"); // @bridge-editor/model-viewer uses this version :(
		
		let can = document.createElement("canvas");
		let imageBlob = this.textureAtlas.imageBlobs.at(-1)[1];
		let imageUrl = URL.createObjectURL(imageBlob);
		
		this.#renderer = new THREE.WebGLRenderer({
			canvas: can,
			alpha: !this.showSkybox,
			antialias: true,
		});
		this.#renderer.setPixelRatio(window.devicePixelRatio);
		this.#renderer.shadowMap.enabled = true;
		this.#renderer.shadowMap.type = THREE.PCFShadowMap;
		this.#setupCameraAndControls(can);
		this.#scene = new THREE.Scene();
		if(!this.showSkybox) {
			this.#scene.background = new THREE.Color(0xCAF0F8);
		}
		window[onEventAndNow]("resize", () => this.#setSize());
		// this.#controls.addEventListener("change", () => {
		// 	if(!this.#controlsBeingUpdated) {
		// 		window.requestAnimationFrame(() => this.#render(false));
		// 	}
		// });
		this.#render();
		
		this.#addLighting();
		if(this.showSkybox) {
			await this.#addSkybox();
		} else {
			this.#scene.background = null;
		}
		loadingMessage.replaceWith(can);
		
		// let animator = this.#viewer.getModel().animator;
		// let animation = this.animations["animations"]["animation.armor_stand.hologram.spawn"];
		// Object.values(animation["bones"] ?? {}).map(bone => Object.values(bone).forEach(animationChannel => {
		// 	animationChannel["Infinity"] = Object.values(animationChannel).at(-1); // hold last keyframe. 
		// }));
		// animator.addAnimation("spawn", animation);
		// animator.play("spawn");
		
		let blockPositions = [];
		for(let x = 0; x < this.structureSize[0]; x++) {
			for(let y = 0; y < this.structureSize[1]; y++) {
				for(let z = 0; z < this.structureSize[2]; z++) {
					let blockI = (x * this.structureSize[1] + y) * this.structureSize[2] + z;
					for(let layerI = 0; layerI < 1; layerI++) {
						let paletteI = this.blockIndices[layerI][blockI];
						if(!(paletteI in this.boneTemplatePalette)) {
							continue;
						}
						blockPositions[paletteI] ??= [];
						blockPositions[paletteI].push([x, y, z]);
					}
				}
			}
		}
		for(let i in blockPositions) {
			let geo = this.#boneTemplateToGeo(this.boneTemplatePalette[i]);
			let model = new Model(geo, imageUrl);
			let group = model.getGroup();
			group.rotation.set(0, pi, 0);
			await model.create();
			let positions = blockPositions[i].map(([x, y, z]) => [-16 * x - 8, 16 * y, -16 * z + 8]);
			let material = group.getObjectByProperty("isMesh", true)?.material;
			if(!material) {
				console.error(i);
				continue;
			}
			let instancedGroup = this.#instanceGroupAtPositions(group, positions, material);
			instancedGroup.castShadow = true;
			instancedGroup.receiveShadow = true;
			this.#scene.add(instancedGroup);
		}
		
		URL.revokeObjectURL(imageUrl);
	}
	#render(loop = true) {
		this.#updateControls();
		this.#renderer.render(this.#scene, this.#camera);
		
		if(loop) {
			window.requestAnimationFrame(() => this.#render());
		}
	}
	#updateControls() {
		this.#controlsBeingUpdated = true;
		this.#controls.update();
		this.#controlsBeingUpdated = false;
	}
	#setSize() {
		this.#renderer.setSize(this.#width, this.#height, false);
	}
	#setupCameraAndControls(can) {
		this.#camera = new THREE.PerspectiveCamera(70, 1, 0.1, 5000);
		this.#camera.position.x = -20;
		this.#camera.position.y = 20;
		this.#camera.position.z = -20;
		this.#controls = new OrbitControls(this.#camera, can);
		this.#controls.minDistance = 10;
		this.#controls.maxDistance = 2000;
		this.#controls.enableDamping = true;
		
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
		this.#updateControls();
	}
	#addLighting() {
		let maxDim = max(...this.structureSize);
		let maxDimPixels = maxDim * 16;
		let center = new THREE.Vector3(-this.structureSize[0] * 8, this.structureSize[1] * 8, -this.structureSize[2] * 8);
		let directionalLight = new THREE.DirectionalLight(0xFFFFFF, PreviewRenderer.#DIRECTIONAL_LIGHT_STRENGTH);
		directionalLight.position.set(center.x + maxDimPixels, center.y + maxDimPixels, center.z + maxDimPixels);
		directionalLight.target.position.copy(center);
		function run() {
			requestAnimationFrame(run);
			directionalLight.position.set(center.x+maxDimPixels * Math.cos(performance.now() / 1000), center.y + maxDimPixels, center.x+maxDimPixels * Math.sin(performance.now() / 1000))
		}
		// run();
		directionalLight.castShadow = true;
		let shadowMapSize = min(2 ** floor(2 * ln(maxDim + 10)) * 16, 4096);
		directionalLight.shadow.mapSize.width = shadowMapSize;
		directionalLight.shadow.mapSize.height = shadowMapSize;
		directionalLight.shadow.camera.near = 0.1;
		directionalLight.shadow.camera.far = maxDimPixels * 4;
		directionalLight.shadow.camera.left = -maxDimPixels;
		directionalLight.shadow.camera.right = maxDimPixels;
		directionalLight.shadow.camera.bottom = -maxDimPixels;
		directionalLight.shadow.camera.top = maxDimPixels;
		directionalLight.shadow.bias = -0.001;
		this.#scene.add(directionalLight);
		this.#scene.add(directionalLight.target);
		
		let l = new THREE.DirectionalLight(0xFFFFFF, 0.1);
		l.position.set(center.x + maxDimPixels * 0.6, center.y + maxDimPixels, center.z + maxDimPixels * 3);
		l.target.position.copy(center);
		this.#scene.add(l);
		this.#scene.add(l.target);
		let l2 = new THREE.DirectionalLight(0xFFFFFF, 0.1);
		l2.position.set(center.x - maxDimPixels * 0.6, center.y + maxDimPixels, center.z - maxDimPixels * 3);
		l2.target.position.copy(center);
		this.#scene.add(l2);
		this.#scene.add(l2.target);
		// this.#scene.add(new THREE.DirectionalLightHelper(l, 5))
		// this.#scene.add(new THREE.DirectionalLightHelper(l2, 5))
		// this.#scene.add(new THREE.CameraHelper(directionalLight.shadow.camera));
		
		let ambientLight = new THREE.AmbientLight(0xFFFFFF, 0.6);
		this.#scene.add(ambientLight);
		
		let shadowFloor = new THREE.Mesh(new THREE.PlaneGeometry(maxDimPixels * 3, maxDimPixels * 3), new THREE.ShadowMaterial({
			opacity: PreviewRenderer.#FLOOR_SHADOW_DARKNESS
		}));
		shadowFloor.rotation.x = -pi / 2;
		shadowFloor.position.set(center.x, 0, center.z);
		shadowFloor.receiveShadow = true;
		this.#scene.add(shadowFloor);
		
		
		this.blocksWithPointLights.forEach(([i, col]) => {
			let z = i % this.structureSize[2];
			let y = floor(i / this.structureSize[2]) % this.structureSize[1];
			let x = floor(i / this.structureSize[2] / this.structureSize[1]);
			let light = new THREE.PointLight(col, 3, 40, 1);
			light.position.set(-16 * x, 16 * y + 8, -16 * z);
			this.#scene.add(light);
			// this.#scene.add(new THREE.PointLightHelper(light,16))
		});
	}
	async #addSkybox() {
		let loader = new THREE.CubeTextureLoader();
		loader.setPath("assets/previewPanorama/");
		let cubemap = await loader.loadAsync([1, 3, 4, 5, 0, 2].map(x => `${x}.png`));
		this.#scene.background = cubemap;
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
	#instanceGroupAtPositions(group, positions, material = new THREE.MeshStandardMaterial({ color: 0x00ff00 })) {
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
		if(geometries.length === 0) {
			console.warn("Group contains no meshes");
			return null;
		}
		// Merge geometries manually
		let merged = this.#mergeBufferGeometries(geometries);
		let instancedMesh = new THREE.InstancedMesh(merged, material, positions.length);
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
					attrArrays[name] = []
				};
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
 * @typedef {import("./HoloPrint.js").BoneTemplate} BoneTemplate
 */
/**
 * @typedef {import("./HoloPrint.js").I32Vec3} I32Vec3
 */