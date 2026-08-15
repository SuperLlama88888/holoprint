/**
 * A class for managing multiple entity files (`*.entity.json`).
 * @template {Record<string, object>} T
 */
export default class EntityManager {
	/** @readonly @type {T} */
	entityFilesAndNames;
	/** @readonly @type {object[]} */
	#entities;
	
	/**
	 * @param {T} entityFilesAndNames
	 */
	constructor(entityFilesAndNames) {
		this.entityFilesAndNames = entityFilesAndNames;
		this.#entities = Object.values(entityFilesAndNames).map(entityFile => entityFile["minecraft:client_entity"]["description"]);
	}
	
	addGeometry = this.#addToDictionary("geometry");
	addMaterial = this.#addToDictionary("materials");
	addTexture = this.#addToDictionary("textures");
	addAnimation = this.#addToDictionary("animations");
	addRenderController = this.#pushToArray("render_controllers");
	addParticleEffect = this.#addToDictionary("particle_effects");
	addAnimateScript = this.#pushToArray(["scripts", "animate"]);
	setShouldUpdateBonesAndEffectsOffscreen = this.#setFlag(["scripts", "should_update_bones_and_effects_offscreen"]);
	
	/**
	 * Exports all entity files as JSON.
	 * @returns {{ [K in keyof T]: string }}
	 */
	exportToJson() {
		// @ts-expect-error
		return Object.fromEntries(Object.entries(this.entityFilesAndNames).map(([name, entityFile]) => [name, JSON.stringify(entityFile)]));
	}
	
	/**
	 * Creates a function to add entries to a dictionary (e.g. definitions for textures, geometries, animations etc.) across all entities.
	 * @param {string} dictionaryName
	 * @returns {(shortName: string, identifier: string) => void}
	 */
	#addToDictionary(dictionaryName) {
		return (shortName, identifier) => {
			this.#entities.forEach(entity => {
				entity[dictionaryName] ??= {};
				entity[dictionaryName][shortName] = identifier;
			});
		};
	}
	/**
	 * Creates a function to push items to an array across all entities.
	 * @overload
	 * @param {string} arrayName Name of a top-level array in the client entity JSON.
	 * @returns {(...elements: any[]) => void}
	 */
	/**
	 * Creates a function to push items to an array across all entities.
	 * @overload
	 * @param {string[]} arrayName Key path of a nested array in the client entity JSON.
	 * @returns {(...elements: any[]) => void}
	 */
	/**
	 * @param {string | string[]} arrayName 
	 * @returns {(...elements: any[]) => void}
	 */
	#pushToArray(arrayName) {
		if(typeof arrayName == "string") {
			return (...elements) => {
				this.#entities.forEach(entity => {
					entity[arrayName] ??= [];
					entity[arrayName].push(...elements);
				});
			};
		} else {
			return (...elements) => {
				this.#entities.forEach(entity => {
					let parentDictionary = arrayName.slice(0, -1).reduce((obj, key) => obj[key] ??= {}, entity);
					let actualArrayName = arrayName.at(-1);
					parentDictionary[actualArrayName] ??= [];
					parentDictionary[actualArrayName].push(...elements);
				});
			};
		}
	}
	/**
	 * Sets a nested flag across all entities.
	 * @param {string[]} flagKeyPath
	 * @returns {(value: boolean) => void}
	 */
	#setFlag(flagKeyPath) {
		return value => {
			this.#entities.forEach(entity => {
				let parentDictionary = flagKeyPath.slice(0, -1).reduce((obj, key) => obj[key] ??= {}, entity);
				let flagName = flagKeyPath.at(-1);
				parentDictionary[flagName] = value;
			});
		}
	}
}