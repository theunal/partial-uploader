const uploadWithPartialFile = async (url: string, file: any, headers?: any, chunkSize: number = 26214400): Promise<{
	success: boolean;
	id: string;
	message: string;
}> => {
	await delay(50);
	const id = generateGuid();

	if (file.size <= chunkSize) {
		// small file
		let res = await upload(url, file, 1, file.size, file.name, id, 0, headers);
		if (!res)
			return { success: false, id, message: "file could not be loaded" };
	}
	else {
		// big file
		const chunks = splitFileIntoChunks(file, chunkSize);

		for (let i = 0; i < chunks.length; i++) {
			let chunk = chunks[i];
			if (!chunk)
				return { success: false, id, message: "chunk is undefined" };

			let res = await upload(url, chunk, chunks.length, file.size, file.name, id, i, headers);
			if (!res)
				return { success: false, id, message: "file could not be loaded" };

			await delay(550);
		};
	};

	return { success: true, id, message: "file uploaded successfully" };
};

const upload = async (url: string, chunk: Blob, chunksLength: number, fileSize: number,
	filename: string, fileGuid: string, index: number, headers?: any) => {
	let formData = new FormData();
	formData.append('file', chunk, `${filename}_chunk_${index}`);
	formData.append('fileGuid', fileGuid);
	let isDone = chunksLength === index + 1;
	formData.append('isDone', isDone.toString());
	formData.append('totalSize', fileSize.toString());
	formData.append('totalChunks', chunksLength.toString());
	formData.append('filename', filename);
	formData.append('index', index.toString());

	return getRes(url, formData, headers);
};

const getRes = async (url: string, formData: FormData, headers?: any) => {
	try {
		let res = await uploadSubscribe(url, formData, headers);
		if (res.status === 406 || res.status === 401)
			return false;
	}
	catch (e) {
		await delay(500);
		let res = await uploadSubscribe(url, formData, headers);
		if (!res.ok)
			return false;
	};

	return true;
};

const delay =  async (ms: number) => {
	await new Promise(f => setTimeout(f, ms));
};

const uploadSubscribe = async (url: string, formData: FormData, headers?: any) =>
	(await fetch(url, { method: 'POST', body: formData, headers: headers ? headers : {} }));

const splitFileIntoChunks = (file: File, chunkSize: number) => {
	const chunks: Blob[] = [];
	let start = 0;
	while (start < file.size) {
		const end = Math.min(start + chunkSize, file.size);
		const chunk = file.slice(start, end);
		chunks.push(chunk);
		start = end;
	};

	return chunks;
};

const generateGuid = () => {
	var chars = '0123456789abcdef';
	var guid = '';

	for (var i = 0; i < 40; i++) {
		var randomIndex = Math.floor(Math.random() * chars.length);
		guid += chars.charAt(randomIndex);
	};

	return guid;
};

export { uploadWithPartialFile };