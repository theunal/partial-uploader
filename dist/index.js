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
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadWithPartialFile = void 0;
var uploadWithPartialFile = function (url, file, headers, chunkSize) {
    if (chunkSize === void 0) { chunkSize = 26214400; }
    return __awaiter(void 0, void 0, void 0, function () {
        var id, res, chunks, i, chunk, res;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, delay(50)];
                case 1:
                    _a.sent();
                    id = generateGuid();
                    if (!(file.size <= chunkSize)) return [3 /*break*/, 3];
                    return [4 /*yield*/, upload(url, file, 1, file.size, file.name, id, 1, headers)];
                case 2:
                    res = _a.sent();
                    if (!res)
                        return [2 /*return*/, { success: false, id: id, message: "file could not be loaded" }];
                    return [3 /*break*/, 9];
                case 3:
                    chunks = splitFileIntoChunks(file, chunkSize);
                    i = 1;
                    _a.label = 4;
                case 4:
                    if (!(i < chunks.length + 1)) return [3 /*break*/, 8];
                    chunk = chunks[i - 1];
                    if (!chunk)
                        return [2 /*return*/, { success: false, id: id, message: "chunk is undefined" }];
                    return [4 /*yield*/, upload(url, chunks[i - 1], chunks.length, file.size, file.name, id, i, headers)];
                case 5:
                    res = _a.sent();
                    if (!res)
                        return [2 /*return*/, { success: false, id: id, message: "file could not be loaded" }];
                    return [4 /*yield*/, delay(550)];
                case 6:
                    _a.sent();
                    _a.label = 7;
                case 7:
                    i++;
                    return [3 /*break*/, 4];
                case 8:
                    ;
                    _a.label = 9;
                case 9:
                    ;
                    return [2 /*return*/, { success: true, id: id, message: "file uploaded successfully" }];
            }
        });
    });
};
exports.uploadWithPartialFile = uploadWithPartialFile;
var upload = function (url, chunk, chunksLength, fileSize, filename, fileGuid, index, headers) { return __awaiter(void 0, void 0, void 0, function () {
    var formData, isDone;
    return __generator(this, function (_a) {
        formData = new FormData();
        formData.append('file', chunk, "".concat(filename, "_chunk_").concat(index));
        formData.append('fileGuid', fileGuid);
        isDone = chunksLength === index;
        formData.append('isDone', isDone.toString());
        formData.append('totalSize', fileSize.toString());
        formData.append('totalChunks', chunksLength.toString());
        formData.append('filename', filename);
        return [2 /*return*/, getRes(url, formData, headers)];
    });
}); };
var getRes = function (url, formData, headers) { return __awaiter(void 0, void 0, void 0, function () {
    var res, e_1, res;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 2, , 5]);
                return [4 /*yield*/, uploadSubscribe(url, formData, headers)];
            case 1:
                res = _a.sent();
                if (res.status === 406 || res.status === 401)
                    return [2 /*return*/, false];
                return [3 /*break*/, 5];
            case 2:
                e_1 = _a.sent();
                return [4 /*yield*/, delay(500)];
            case 3:
                _a.sent();
                return [4 /*yield*/, uploadSubscribe(url, formData, headers)];
            case 4:
                res = _a.sent();
                if (!res.ok)
                    return [2 /*return*/, false];
                return [3 /*break*/, 5];
            case 5:
                ;
                return [2 /*return*/, true];
        }
    });
}); };
var delay = function (ms) { return __awaiter(void 0, void 0, void 0, function () { return __generator(this, function (_a) {
    switch (_a.label) {
        case 0: return [4 /*yield*/, new Promise(function (f) { return setTimeout(f, ms); })];
        case 1: return [2 /*return*/, _a.sent()];
    }
}); }); };
var uploadSubscribe = function (url, formData, headers) { return __awaiter(void 0, void 0, void 0, function () { return __generator(this, function (_a) {
    switch (_a.label) {
        case 0: return [4 /*yield*/, fetch(url, { method: 'POST', body: formData, headers: headers ? headers : {} })];
        case 1: return [2 /*return*/, (_a.sent())];
    }
}); }); };
var splitFileIntoChunks = function (file, chunkSize) {
    var chunks = [];
    var start = 0;
    while (start < file.size) {
        var end = Math.min(start + chunkSize, file.size);
        var chunk = file.slice(start, end);
        chunks.push(chunk);
        start = end;
    }
    ;
    return chunks;
};
var generateGuid = function () {
    var chars = '0123456789abcdef';
    var guid = '';
    for (var i = 0; i < 40; i++) {
        var randomIndex = Math.floor(Math.random() * chars.length);
        guid += chars.charAt(randomIndex);
    }
    ;
    return guid;
};
