import { exp, max } from "./utils.js";

export default class SpawnAnimationMaker {
	config;
	structureSize;
	/** @type {Array<SpawnAnimationBone>} */
	#animatedBones = [];
	#totalAnimationLength = 0;
	#randomness;
	/**
	 * Creates a SpawnAnimationMaker for managing the spawn animation.
	 * @param {HoloPrintConfig} config
	 * @param {I32Vec3 | Vec3} structureSize
	 */
	constructor(config, structureSize) {
		this.config = config;
		this.structureSize = structureSize;
		
		let totalVolume = this.structureSize[0] * this.structureSize[1] * this.structureSize[2];
		this.#randomness = 2 - 1.9 * exp(-0.005 * totalVolume); // 100 -> ~0.85, 1000 -> ~1.99, asymptotic to 2
	}
	/**
	 * Adds a bone to the animation.
	 * @param {string} boneName
	 * @param {Vec3} blockPos
	 * @param {Vec3} bonePos
	 */
	addBone(boneName, blockPos, bonePos) {
		this.#animatedBones.push({ boneName, blockPos, bonePos });
	}
	/**
	 * Makes the animation and returns it.
	 * @returns {MinecraftAnimation}
	 */
	makeAnimation() {
		let delayRanking = this.#animatedBones.map(({ blockPos: [x, y, z] }) => this.#getDelayRank(x, y, z));
		let orderedRanking = this.#orderDelayRanking(delayRanking);
		let delays = orderedRanking.map(order => this.#calculateDelay(order));
		let bones = {};
		this.#animatedBones.forEach(({ boneName, bonePos }, i) => {
			let delay = +delays[i].toFixed(2);
			bones[boneName] = this.#makeBoneAnimation(delay, bonePos);
		});
		return {
			"animation_length": this.#totalAnimationLength,
			"bones": bones
		};
	}
	/**
	 * Gets the rank of the delay of a spawn animation block based on its position. These are processed into a proper order then used in delay calculations.
	 * @param {number} x
	 * @param {number} y
	 * @param {number} z
	 * @returns {number}
	 */
	#getDelayRank(x, y, z) {
		return this.structureSize[0] - x + y + this.structureSize[2] - z;
	}
	/**
	 * Sorts and condenses a ranking into a proper order. Returns each original rank's value in the new order.
	 * @param {Array<number>} ranking E.g. [1, 5, 3, 5, 2, 8]
	 * @returns {Array<number>} E.g. [0, 3, 2, 3, 1, 4]
	 */
	#orderDelayRanking(ranking) {
		let offset = 0;
		let order = [];
		let mappedRankings = [];
		let sortedIndexedRanking = ranking.map((rank, i) => [rank, i]).sort(([a], [b]) => a - b);
		sortedIndexedRanking.forEach(([rank, originalI], i) => { // condense "gaps". e.g. [1, 2, 3, 3, 5, 5] becomes [1, 2, 3, 3, 4, 4]. this is so there aren't any large pauses in the animation and it flows continuously
			rank -= offset;
			let prev = order[i - 1] ?? -1;
			let gap = rank - prev;
			if(gap <= 1) {
				order[i] = rank;
			} else {
				offset += gap - 1;
				order[i] = prev + 1;
			}
			mappedRankings[originalI] = order[i];
		});
		return mappedRankings;
	}
	/**
	 * Calculates the animation delay for an individual bone based on its order.
	 * @param {number} order
	 * @returns {number}
	 */
	#calculateDelay(order) {
		return this.config.SPAWN_ANIMATION_LENGTH * 0.25 * (order + Math.random() * this.#randomness) + 0.05;
	}
	/**
	 * Makes the animation for a single bone.
	 * @param {number} delay
	 * @param {Vec3} bonePos
	 */
	#makeBoneAnimation(delay, bonePos) {
		let animationEnd = Number((delay + this.config.SPAWN_ANIMATION_LENGTH).toFixed(2));
		this.#totalAnimationLength = max(this.#totalAnimationLength, animationEnd);
		let keyframes = [0, 0.2, 0.4, 0.6, 0.8, 1]; // this is smooth enough
		let positionOffset = [-bonePos[0] - 8, -bonePos[1], -bonePos[2] - 8]; // the offset to go back to [0, 0, 0] in the structure.
		return {
			"scale": this.#createAnimFromKeyframes(keyframe => {
				let keyframeValue = +this.#animationTimingFunc(keyframe).toFixed(2); // TWO SIG FIGS
				return [keyframeValue, keyframeValue, keyframeValue]; // has to be an array here...
			}, keyframes, delay),
			"position": this.#createAnimFromKeyframes(keyframe => positionOffset.map(x => {
				let offset = x * (1 - this.#animationTimingFunc(keyframe)); // the coefficient means the offset transformation to the structure origin will decrease over time
				return +offset.toFixed(2);
			}), keyframes, delay)
		};
	}
	/**
	 * Creates an animation from keyframes.
	 * @param {(keyframe: number) => any} animFunc The function to be animated with keyframes
	 * @param {Array<number>} keyframes
	 * @param {number} delay
	 * @returns {Record<string, number>}
	 */
	#createAnimFromKeyframes(animFunc, keyframes, delay) {
		return Object.fromEntries(keyframes.map(keyframe => {
			let absoluteKeyframeTime = delay + keyframe * this.config.SPAWN_ANIMATION_LENGTH;
			return [absoluteKeyframeTime.toFixed(2), animFunc(keyframe)];
		}));
	}
	/**
	 * The timing function for each ghost block's animation.
	 * @param {number} x
	 * @returns {number}
	 */
	#animationTimingFunc(x) {
		return 1 - (1 - x) ** 3;
	}
}

/** @import { HoloPrintConfig, Vec3, I32Vec3, SpawnAnimationBone, MinecraftAnimation } from "./HoloPrint.js" */