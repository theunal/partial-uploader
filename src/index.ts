type RefreshResult = { headers?: any; url?: string };
type UnauthorizedCallback = (error: Response) => Promise<RefreshResult | null>;

export interface PartialUploadResponse {
	success: boolean;
	message: string;
	statusCode: number;
	data?: {
		id: string;
	}
}

const uploadWithPartialFile = async (
	url: string,
	file: any,
	headers: any = {},
	chunkSize: number = 26214400,
	delay_number: number = 50,
	concurrency: number = 1,
	onUnauthorized?: UnauthorizedCallback
): Promise<PartialUploadResponse> => {
	// İstek bilgilerini dinamik tutmak için bir context oluşturuyoruz
	const sharedContext = {
		url: url,
		headers: { ...headers }
	};

	await delay(delay_number);
	const id = generateGuid();
	const fileName = file.name || 'file';
	const totalSize = file.size;
	const totalChunks = Math.ceil(totalSize / chunkSize) || 1;
	let lastStatusCode = 200;

	const uploadChunk = async (index: number) => {
		const start = index * chunkSize;
		const end = Math.min(start + chunkSize, totalSize);
		const chunk = file.slice(start, end);

		for (let retry = 0; retry < 3; retry++) {
			try {
				const formData = new FormData();
				formData.append('file', chunk, `${fileName}_chunk_${index}`);
				formData.append('fileGuid', id);
				formData.append('isDone', (index === totalChunks - 1).toString());
				formData.append('totalSize', totalSize.toString());
				formData.append('totalChunks', totalChunks.toString());
				formData.append('filename', fileName);
				formData.append('index', index.toString());

				const res = await fetch(sharedContext.url, {
					method: 'POST',
					body: formData,
					headers: sharedContext.headers
				});

				lastStatusCode = res.status;

				// Token bitmişse (401) callback'i çağır
				if (res.status === 401 && onUnauthorized) {
					const refreshData = await onUnauthorized(res);
					if (refreshData) {
						if (refreshData.headers) {
							sharedContext.headers = { ...sharedContext.headers, ...refreshData.headers };
						}
						if (refreshData.url) {
							sharedContext.url = refreshData.url;
						}
						// Token yenilendi, bu retry hakkından düşmeden aynı parçayı tekrar dene
						retry--;
						continue;
					}
				}

				if (res.ok) return true;

				// Diğer hatalarda (500 vb.) retry devam etsin
				if (retry === 2) throw new Error(`Server error: ${res.status}`);

			} catch (e) {
				if (retry === 2) throw e;
				// Ağ hatalarında bekleme süresini artır
				await delay(delay_number + (retry + 1) * 1000);
			}
		}
		return false;
	};

	try {
		const queue = Array.from({ length: totalChunks }, (_, i) => i);

		const workers = Array(Math.min(concurrency, totalChunks)).fill(null).map(async () => {
			while (queue.length > 0) {
				const index = queue.shift()!;
				const success = await uploadChunk(index);
				if (!success) throw new Error("file could not be loaded");
				if (delay_number > 0) await delay(delay_number);
			}
		});

		await Promise.all(workers);
		return {
			success: true,
			message: "file uploaded successfully",
			statusCode: lastStatusCode,
			data: {
				id
			}
		};
	} catch (e: any) {
		return {
			success: false,
			message: e.message || "file could not be loaded",
			statusCode: lastStatusCode
		};
	}
};

const delay = (ms: number) => new Promise(f => setTimeout(f, ms));

const generateGuid = () => {
	const chars = '0123456789abcdef';
	let guid = '';
	for (let i = 0; i < 40; i++) {
		const randomIndex = Math.floor(Math.random() * chars.length);
		guid += chars.charAt(randomIndex);
	}
	return guid;
};

export { uploadWithPartialFile };