export type FetchFunc = (filePath: string) => Promise<Response>;
export type GetResponseContentsFunc = (resPromise: Promise<Response>, filePath: string) => Promise<any>;
export type AddFileOptions = {
	/** An optional comment to add to the file entry. */
	comment?: string;
};
export type ExportOptions = {
	zipCompressionLevel?: number;
};