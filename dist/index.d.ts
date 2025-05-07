declare const uploadWithPartialFile: (url: string, file: any, headers?: any, chunkSize?: number) => Promise<{
    success: boolean;
    id: string;
    message: string;
}>;
export { uploadWithPartialFile };
