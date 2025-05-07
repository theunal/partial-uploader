"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadWithPartialFile = void 0;
const uploadWithPartialFile = (url, file, headers, chunkSize = 26214400) => __awaiter(void 0, void 0, void 0, function* () {
    yield delay(50);
    const id = generateGuid();
    if (file.size <= chunkSize) {
        // small file
        let res = yield upload(url, file, 1, file.size, file.name, id, 0, headers);
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
            let res = yield upload(url, chunk, chunks.length, file.size, file.name, id, i, headers);
            if (!res)
                return { success: false, id, message: "file could not be loaded" };
            yield delay(550);
        }
        ;
    }
    ;
    return { success: true, id, message: "file uploaded successfully" };
});
exports.uploadWithPartialFile = uploadWithPartialFile;
const upload = (url, chunk, chunksLength, fileSize, filename, fileGuid, index, headers) => __awaiter(void 0, void 0, void 0, function* () {
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
});
const getRes = (url, formData, headers) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        let res = yield uploadSubscribe(url, formData, headers);
        if (res.status === 406 || res.status === 401)
            return false;
    }
    catch (e) {
        yield delay(500);
        let res = yield uploadSubscribe(url, formData, headers);
        if (!res.ok)
            return false;
    }
    ;
    return true;
});
const delay = (ms) => __awaiter(void 0, void 0, void 0, function* () {
    yield new Promise(f => setTimeout(f, ms));
});
const uploadSubscribe = (url, formData, headers) => __awaiter(void 0, void 0, void 0, function* () { return (yield fetch(url, { method: 'POST', body: formData, headers: headers ? headers : {} })); });
const splitFileIntoChunks = (file, chunkSize) => {
    const chunks = [];
    let start = 0;
    while (start < file.size) {
        const end = Math.min(start + chunkSize, file.size);
        const chunk = file.slice(start, end);
        chunks.push(chunk);
        start = end;
    }
    ;
    return chunks;
};
const generateGuid = () => {
    var chars = '0123456789abcdef';
    var guid = '';
    for (var i = 0; i < 40; i++) {
        var randomIndex = Math.floor(Math.random() * chars.length);
        guid += chars.charAt(randomIndex);
    }
    ;
    return guid;
};
