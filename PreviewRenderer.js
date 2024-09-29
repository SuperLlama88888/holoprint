import * as THREE from "https://esm.run/three@0.166.1";
import Stats from "https://esm.run/three@0.166.1/addons/libs/stats.module.js";
import { GUI } from "https://esm.run/three@0.166.1/addons/libs/lil-gui.module.min.js";
import { OrbitControls } from "https://esm.run/three@0.166.1/addons/controls/OrbitControls.js";
import { EffectComposer } from "https://esm.run/three@0.166.1/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "https://esm.run/three@0.166.1/addons/postprocessing/RenderPass.js";
import { SAOPass } from "https://esm.run/three@0.166.1/addons/postprocessing/SAOPass.js";
import { OutputPass } from "https://esm.run/three@0.166.1/addons/postprocessing/OutputPass.js";
import { floor, max, sqrt } from "./essential.js";

export default class PreviewRenderer {
	static #SHADOW_MAP_RESOLUTION = 512;
	
	containerElement;
	structureSize;
	
	#scene;
	#camera;
	#renderer;
	#effectComposer;
	#controls;
	#textureLoader;
	#stats;
	
	#material;
	#textureW;
	#textureH;
	
	constructor(cont, textureAtlas, structureSize) {
		return (async () => {
			const width = 600;
			const height = 600;
			
			this.containerElement = cont;
			this.structureSize = structureSize;
			
			this.#scene = new THREE.Scene();
			this.#camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 10000);
			this.#camera.position.set(structureSize[0] / 2, structureSize[1] / 2, -5);
			this.#renderer = new THREE.WebGLRenderer();
			this.#renderer.setSize(width, height);
			this.#renderer.setPixelRatio(window.devicePixelRatio);
			this.#renderer.shadowMap.enabled = true;
			this.#renderer.shadowMap.type = THREE.PCFSoftShadowMap;
			this.containerElement.appendChild(this.#renderer.domElement);
			
			this.#effectComposer = new EffectComposer(this.#renderer);
			this.#effectComposer.addPass(new RenderPass(this.#scene, this.#camera));
			let saoPass = new SAOPass( this.#scene, this.#camera );
			saoPass.params.saoIntensity = 0.0001;
			saoPass.params.saoKernelRadius = 32;
			this.#effectComposer.addPass( saoPass );
			this.#effectComposer.addPass(new OutputPass());
			
			let texture = await this.#loadTexture(URL.createObjectURL(textureAtlas.imageBlobs.at(-1)[1]));
			texture.minFilter = texture.magFilter = THREE.NearestFilter; // make it pixelated
			this.#textureW = textureAtlas.atlasWidth;
			this.#textureH = textureAtlas.atlasHeight;
			
			this.#material = new THREE.MeshLambertMaterial({
				map: texture,
				// color: 0x00FF00,
				transparent: true,
				// emissive: 0xFF0000,
				// emissiveIntensity: 0.5,
				side: THREE.DoubleSide
			});
			// let geo = new THREE.BoxGeometry(1, 1, 1);
			// let mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: 0x00FF00 })); // testing cube
			// mesh.castShadow = true;
			// mesh.receiveShadow = true;
			// this.#scene.add(mesh);
			
			this.#scene.add(new THREE.AxesHelper(5));
			// this.#scene.scale.x = -1;
			await this.#addSkybox();
			this.#addLighting();
			
			this.#controls = new OrbitControls(this.#camera, this.#renderer.domElement);
			this.#controls.target = (new THREE.Vector3(...structureSize)).divideScalar(2); // rotation center
			// this.#controls.autoRotate = true;
			
			this.#stats = new Stats();
			this.containerElement.appendChild(this.#stats.dom);
			
			let gui = new GUI({
				container: this.containerElement
			});
			gui.add(saoPass, "enabled").name("Ambient occlusion enabled");
			
			return this;
		})();
	}
	render() {
		this.#stats.begin();
		
		this.#controls.update();
		this.#effectComposer.render(this.#scene, this.#camera);
		
		this.#stats.end();
	}
	addCube(minecraftCube) {
		let cube = structuredClone(minecraftCube);
		// cube["origin"] = [floor(-(cube["origin"][0] + 8) / 16) - (cube["origin"][0] / 16 % 1), cube["origin"][1] / 16, (cube["origin"][2] + 8) / 16]; // x is still messed up.
		cube["origin"] = cube["origin"].map(x => x / 16 + 0.5);
		// // cube["origin"][0] = -floor(cube["origin"][0]) + 1 - (cube["origin"][0] % 1);
		cube["origin"][1] -= 0.5;
		// cube["origin"][0] = -cube["origin"][0];
		console.log(cube["origin"], cube["size"], cube["uv"])
		cube["size"] = cube["size"].map(x => x / 16);
		cube["uv"]
		
		// console.log(JSON.stringify(cube))
		let geo = new THREE.BoxGeometry(...cube["size"]);
		let uvAttribute = geo.attributes.uv;
		let convertUv = (mcUv) => {
			console.log(mcUv)
			if(!mcUv) {
				return [-1, -1, -1, -1, -1, -1, -1, -1];
			}
			let start = [mcUv.uv[0] / this.#textureW, 1 - (mcUv.uv[1] + mcUv.uv_size[1]) / this.#textureH];
			let size = [mcUv.uv_size[0] / this.#textureW, mcUv.uv_size[1] / this.#textureH];
			let end = start.map((x, i) => x + size[i]);
			return [start[0], end[1], end[0], end[1], start[0], start[1], end[0], start[1]];
		};
		let customUVs = [
			convertUv(cube["uv"]["south"]),
			convertUv(cube["uv"]["north"]),
			convertUv(cube["uv"]["up"]),
			convertUv(cube["uv"]["down"]),
			convertUv(cube["uv"]["east"]),
			convertUv(cube["uv"]["west"]),
		]
		// let customUVs = [
		// 	// Front face
		// 	[0, 0, 1, 0, 1, 1, 0, 1],
		// 	// cube["uv"]["north"]
		// 	// Back face
		// 	[1, 0, 0, 0, 0, 1, 1, 1],
		// 	// Top face
		// 	[0, 1, 1, 1, 1, 0, 0, 0],
		// 	// Bottom face
		// 	[1, 1, 0, 1, 0, 0, 1, 0],
		// 	// Right face
		// 	[1, 0, 1, 1, 0, 1, 0, 0],
		// 	// Left face
		// 	[0, 0, 0, 1, 1, 1, 1, 0]
		// ];
		for (let i = 0; i < customUVs.length; i++) {
			let faceUVs = customUVs[i];
			// let faceUVs = [0, 1, 1, 1, 0, 0, 1, 0];
			uvAttribute.setXY(i * 4, faceUVs[0], faceUVs[1]);
			uvAttribute.setXY(i * 4 + 1, faceUVs[2], faceUVs[3]);
			uvAttribute.setXY(i * 4 + 2, faceUVs[4], faceUVs[5]);
			uvAttribute.setXY(i * 4 + 3, faceUVs[6], faceUVs[7]);
		}
		
		// Step 5: Mark the UV attribute as needing an update
		uvAttribute.needsUpdate = true;
		// let index = geo.getIndex();
		// let uv = geo.getAttribute("uv");
		// if(!this.flag) {
		// 	this.flag = true;
		// 	console.log(geo)
		// }
		// for(let i = 0; i < uv.count; i += 3) {
		// 	uv.setXY(index.getX(i), Math.random(), Math.random());
		// 	uv.setXY(index.getX(i + 1), Math.random(), Math.random());
		// 	uv.setXY(index.getX(i + 2), Math.random(), Math.random());
		// }
		
		let mesh = new THREE.Mesh(geo, this.#material);
		// let mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial( {color: 0x00ff00 }));
		mesh.position.set(...cube["origin"]);
		// mesh.position.x *= -1; // because it's negative in the geometry file
		mesh.position.add((new THREE.Vector3(...cube["size"])).divideScalar(2));
		mesh.castShadow = true;
		mesh.receiveShadow = true;

            // Apply rotation if needed (convert degrees to radians)
            // if (rotation) {
            //     mesh.rotation.set(
            //         THREE.MathUtils.degToRad(rotation[0]),
            //         THREE.MathUtils.degToRad(rotation[1]),
            //         THREE.MathUtils.degToRad(rotation[2])
            //     );
            // }

            // // Apply pivot (if needed)
            // if (pivot) {
            //     mesh.position.sub(new THREE.Vector3(pivot[0], pivot[1], pivot[2]));
            // }
		this.#scene.add(mesh);
		this.#renderer.shadowMap.needsUpdate = true;
	}
	async #addSkybox() {
		if(false) {
			// I know I can do it with scene.background but this is more fun
			let texture = await this.#loadTexture("assets/skybox.jpg");
			texture.mapping = THREE.EquirectangularReflectionMapping;
			let sphere = new THREE.Mesh(new THREE.SphereGeometry(500, 60, 40), new THREE.MeshBasicMaterial({
				map: texture,
				side: THREE.BackSide
			}));
			this.#scene.add(sphere);
		} else {
			let loader = new THREE.CubeTextureLoader();
			// loader.setPath("assets/mobVotePanorama/");
			loader.setPath("assets/cavesAndCliffsPanorama/");
			this.#scene.background = loader.load(["1.png", "3.png", "4.png", "5.png", "0.png", "2.png"]);
		}
	}
	#addLighting() {
		let directionalLight = new THREE.DirectionalLight(0xFFFFFF, 5);
		directionalLight.position.set(-this.structureSize[0], this.structureSize[1], -this.structureSize[2]);
		directionalLight.target.position.set(this.structureSize[0], this.structureSize[1] / 2, this.structureSize[2]);
		directionalLight.castShadow = true;
		this.#scene.add(directionalLight);
		this.#scene.add(directionalLight.target);
		
		directionalLight.shadow.mapSize = new THREE.Vector2(PreviewRenderer.#SHADOW_MAP_RESOLUTION, PreviewRenderer.#SHADOW_MAP_RESOLUTION);
		directionalLight.shadow.camera.far = (new THREE.Vector3(...this.structureSize)).multiplyScalar(2).length();
		let shadowCameraSize = max(...this.structureSize) / 2 * sqrt(3); // hmm
		directionalLight.shadow.camera.left = -shadowCameraSize;
		directionalLight.shadow.camera.right = shadowCameraSize;
		directionalLight.shadow.camera.bottom = -shadowCameraSize;
		directionalLight.shadow.camera.top = shadowCameraSize;
		
		this.#scene.add(new THREE.CameraHelper(directionalLight.shadow.camera))
		
		let ambientLight = new THREE.AmbientLight(0xFFFFFF, 1);
		this.#scene.add(ambientLight);
	}
	#loadTexture(url) {
		if(!this.#textureLoader) {
			this.#textureLoader = new THREE.TextureLoader();
		}
		return new Promise((res, rej) => {
			this.#textureLoader.load(url, res, undefined, rej);
		});
	}
}