export type TypedBlockStateProperty = {
	/** An integer property. */
	int?: number;
	/** A string property. */
	string?: string;
	/** A byte property. */
	byte?: number;
};
export type BlockUpdateSchemaFlattenRule = {
	/** The prefix for the flattened property. */
	prefix: string;
	/** The name of the flattened property. */
	flattenedProperty: string;
	/** The type of the flattened property. */
	flattenedPropertyType?: "int" | "string" | "byte";
	/** The suffix for the flattened property. */
	suffix: string;
	/** A mapping of flattened values. */
	flattenedValueRemaps?: Record<string, string>;
};
export type BlockUpdateSchemaRemappedState = {
	/** The property values before the remapping. */
	oldState: Record<string, TypedBlockStateProperty> | null;
	/** An optional new name for the block. */
	newName?: string;
	/** An optional flattened property rule providing a new name. */
	newFlattenedName?: BlockUpdateSchemaFlattenRule;
	/** The new property values after the remapping. */
	newState: Record<string, TypedBlockStateProperty> | null;
	/** Optional list of property names to copy from the old state. */
	copiedState?: string[];
};
export type BlockUpdateSchemaSkeleton = {
	filename: string;
	/** The major version (must be >= 0). */
	maxVersionMajor: number;
	/** The minor version (must be >= 0). */
	maxVersionMinor: number;
	/** The patch version (must be >= 0). */
	maxVersionPatch: number;
	/** The revision version (must be >= 0). */
	maxVersionRevision: number;
};
export type BlockUpdateSchema = {
	/** The major version (must be >= 0). */
	maxVersionMajor: number;
	/** The minor version (must be >= 0). */
	maxVersionMinor: number;
	/** The patch version (must be >= 0). */
	maxVersionPatch: number;
	/** The revision version (must be >= 0). */
	maxVersionRevision: number;
	/** Mapping of renamed IDs. */
	renamedIds?: Record<string, string>;
	/** Mapping of added properties. */
	addedProperties?: Record<string, Record<string, TypedBlockStateProperty>>;
	/** Mapping of renamed properties. */
	renamedProperties?: Record<string, Record<string, string>>;
	/** Mapping of removed properties. */
	removedProperties?: Record<string, string[]>;
	/** Mapping of remapped property values. */
	remappedPropertyValues?: Record<string, Record<string, string>>;
	/** Index of remapped property values. */
	remappedPropertyValuesIndex?: Record<string, {
		old: TypedBlockStateProperty;
		new: TypedBlockStateProperty;
	}[]>;
	/** Mapping of flattened properties. */
	flattenedProperties?: Record<string, BlockUpdateSchemaFlattenRule>;
	/** Mapping of remapped states. */
	remappedStates?: Record<string, BlockUpdateSchemaRemappedState[]>;
};