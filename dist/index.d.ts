declare function uploadWithPartialFile(url: string, file: any, chunkSize?: number): Promise<{
	isSuccess: boolean;
	id: string;
	message: string;
}>;
export { uploadWithPartialFile };