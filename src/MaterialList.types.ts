export type MaterialListEntry = {
	itemName: string;
	translationKey: string;
	translatedName: string;
	/** How many of this item is required */
	count: number;
	/** A formatted string representing partitions of the total count */
	partitionedCount: string;
	/** Same as partitionedCount, but without the "[total count] = " at the start */
	partitionedCountWithoutTotal: string;
	/** The item's aux ID */
	auxId: number | undefined;
};
export type ExportedMaterialListJsonUi = {
	entries: Record<string, object>[];
	visibleHeight: number;
	longestItemNameLength: number;
	longestCountLength: number;
	itemNameColumnSize: [string | number, string | number];
};