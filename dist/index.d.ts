type RefreshResult = {
    headers?: any;
    url?: string;
};
type UnauthorizedCallback = (error: Response) => Promise<RefreshResult | null>;
declare const uploadWithPartialFile: (url: string, file: any, headers?: any, chunkSize?: number, delay_number?: number, concurrency?: number, onUnauthorized?: UnauthorizedCallback) => Promise<{
    success: boolean;
    id: string;
    message: string;
}>;
export { uploadWithPartialFile };
