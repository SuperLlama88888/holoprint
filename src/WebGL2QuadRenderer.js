import vertexShaderSource from "./WebGL2QuadRendererShader.vertex.glsl" with { type: "text" };
import fragmentShaderSource from "./WebGL2QuadRendererShader.fragment.glsl" with { type: "text" };
import { getOffscreenCanvasContext } from "./utils.js";

/** A lightweight WebGL 2 utility to render arbitrary quads directly to an `ImageBitmap`. */
export default class WebGL2QuadRenderer {
	static #VERTEX_INDICES = new Uint16Array([0, 1, 2, 0, 2, 3]);
	
	/** @readonly */
	size;
	/** @readonly */
	#gl;
	/** @readonly */
	#program;
	/** @readonly */
	#glTexture;
	/** @readonly */
	#positionBuffer;
	/** @readonly */
	#uvBuffer;
	/** @readonly */
	#indexBuffer;
	
	/** @returns {boolean} */
	static isSupported() {
		if(typeof WebGL2RenderingContext == "undefined") {
			return false;
		}
		// idk
		let can = new OffscreenCanvas(100, 100);
		try {
			getOffscreenCanvasContext(can, "webgl2", { 
				preserveDrawingBuffer: true,
				antialias: false 
			});
		} catch {
			return false;
		}
		return true;
	}
	
	/**
	 * @param {number} size Resolution of the output canvas (width and height)
	 * @param {HTMLImageElement} textureImage Source image for the texture
	 */
	constructor(size, textureImage) {
		this.size = size;
		
		let canvas = new OffscreenCanvas(size, size);
		let gl = getOffscreenCanvasContext(canvas, "webgl2", { 
			preserveDrawingBuffer: true,
			antialias: false 
		});
		if(!gl) {
			throw new Error("WebGL 2 not supported.");
		}
		this.#gl = gl;
		
		let vertexShader = this.#createShader(gl.VERTEX_SHADER, vertexShaderSource);
		let fragmentShader = this.#createShader(gl.FRAGMENT_SHADER, fragmentShaderSource);
		
		this.#program = gl.createProgram();
		gl.attachShader(this.#program, vertexShader);
		gl.attachShader(this.#program, fragmentShader);
		gl.linkProgram(this.#program);

		this.#positionBuffer = gl.createBuffer();
		this.#uvBuffer = gl.createBuffer();
		this.#indexBuffer = gl.createBuffer();
		
		gl.enable(gl.BLEND);
		gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

		// I got AI to write this stuff for me, I have no idea what this does. But it works!
		this.#glTexture = gl.createTexture();
		gl.bindTexture(gl.TEXTURE_2D, this.#glTexture);
		gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, textureImage);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
	}
	
	/**
	 * Renders a list of independent quads and returns the compiled `ImageBitmap`.
	 * @param {{ positions: F32Vec8, uvs: F32Vec8 }[]} quads Array of position/UV pairings.
	 * @returns {ImageBitmap}
	 */
	render(quads) {
		let gl = this.#gl; // I wish JS would just let me write #gl. What else could the # mean?!?! SMHHHH
		
		gl.viewport(0, 0, this.size, this.size);
		gl.clearColor(0, 0, 0, 0);
		gl.clear(gl.COLOR_BUFFER_BIT);
		gl.useProgram(this.#program);
		
		quads.forEach(({ positions, uvs }) => {
			gl.bindBuffer(gl.ARRAY_BUFFER, this.#positionBuffer);
			gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STREAM_DRAW);
			let posLoc = gl.getAttribLocation(this.#program, "a_position");
			gl.enableVertexAttribArray(posLoc);
			gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
			
			gl.bindBuffer(gl.ARRAY_BUFFER, this.#uvBuffer);
			gl.bufferData(gl.ARRAY_BUFFER, uvs, gl.STREAM_DRAW);
			let uvLoc = gl.getAttribLocation(this.#program, "a_uv");
			gl.enableVertexAttribArray(uvLoc);
			gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, false, 0, 0);
			
			gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.#indexBuffer);
			gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, WebGL2QuadRenderer.#VERTEX_INDICES, gl.STREAM_DRAW);

			gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
		});
		
		return gl.canvas.transferToImageBitmap();
	}
	
	/**
	 * Creates and compiles a WebGL shader because nothing is easy in WebGL :(
	 * @param {WebGLRenderingContext["VERTEX_SHADER"] | WebGLRenderingContext["FRAGMENT_SHADER"]} type
	 * @param {string} source
	 * @returns {WebGLShader}
	 */
	#createShader(type, source) {
		let shader = this.#gl.createShader(type);
		this.#gl.shaderSource(shader, source);
		this.#gl.compileShader(shader);
		if(!this.#gl.getShaderParameter(shader, this.#gl.COMPILE_STATUS)) {
			console.error(this.#gl.getShaderInfoLog(shader));
			this.#gl.deleteShader(shader);
		}
		return shader;
	};
}

/** @import { F32Vec8 } from "./HoloPrint.js" */