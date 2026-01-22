"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
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
var uploadWithPartialFile = function (url, file, headers, chunkSize, delay_number, concurrency, onUnauthorized) {
    if (headers === void 0) { headers = {}; }
    if (chunkSize === void 0) { chunkSize = 26214400; }
    if (delay_number === void 0) { delay_number = 50; }
    if (concurrency === void 0) { concurrency = 1; }
    return __awaiter(void 0, void 0, void 0, function () {
        var sharedContext, id, fileName, totalSize, totalChunks, uploadChunk, queue_1, workers, e_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    sharedContext = {
                        url: url,
                        headers: __assign({}, headers)
                    };
                    return [4 /*yield*/, delay(delay_number)];
                case 1:
                    _a.sent();
                    id = generateGuid();
                    fileName = file.name || 'file';
                    totalSize = file.size;
                    totalChunks = Math.ceil(totalSize / chunkSize) || 1;
                    uploadChunk = function (index) { return __awaiter(void 0, void 0, void 0, function () {
                        var start, end, chunk, retry, formData, res, refreshData, e_2;
                        return __generator(this, function (_a) {
                            switch (_a.label) {
                                case 0:
                                    start = index * chunkSize;
                                    end = Math.min(start + chunkSize, totalSize);
                                    chunk = file.slice(start, end);
                                    retry = 0;
                                    _a.label = 1;
                                case 1:
                                    if (!(retry < 3)) return [3 /*break*/, 9];
                                    _a.label = 2;
                                case 2:
                                    _a.trys.push([2, 6, , 8]);
                                    formData = new FormData();
                                    formData.append('file', chunk, "".concat(fileName, "_chunk_").concat(index));
                                    formData.append('fileGuid', id);
                                    formData.append('isDone', (index === totalChunks - 1).toString());
                                    formData.append('totalSize', totalSize.toString());
                                    formData.append('totalChunks', totalChunks.toString());
                                    formData.append('filename', fileName);
                                    formData.append('index', index.toString());
                                    return [4 /*yield*/, fetch(sharedContext.url, {
                                            method: 'POST',
                                            body: formData,
                                            headers: sharedContext.headers
                                        })];
                                case 3:
                                    res = _a.sent();
                                    if (!(res.status === 401 && onUnauthorized)) return [3 /*break*/, 5];
                                    return [4 /*yield*/, onUnauthorized(res)];
                                case 4:
                                    refreshData = _a.sent();
                                    if (refreshData) {
                                        if (refreshData.headers) {
                                            sharedContext.headers = __assign(__assign({}, sharedContext.headers), refreshData.headers);
                                        }
                                        if (refreshData.url) {
                                            sharedContext.url = refreshData.url;
                                        }
                                        // Token yenilendi, bu retry hakkından düşmeden aynı parçayı tekrar dene
                                        retry--;
                                        return [3 /*break*/, 8];
                                    }
                                    _a.label = 5;
                                case 5:
                                    if (res.ok)
                                        return [2 /*return*/, true];
                                    // Diğer hatalarda (500 vb.) retry devam etsin
                                    if (retry === 2)
                                        throw new Error("Server error: ".concat(res.status));
                                    return [3 /*break*/, 8];
                                case 6:
                                    e_2 = _a.sent();
                                    if (retry === 2)
                                        throw e_2;
                                    // Ağ hatalarında bekleme süresini artır
                                    return [4 /*yield*/, delay(delay_number + (retry + 1) * 1000)];
                                case 7:
                                    // Ağ hatalarında bekleme süresini artır
                                    _a.sent();
                                    return [3 /*break*/, 8];
                                case 8:
                                    retry++;
                                    return [3 /*break*/, 1];
                                case 9: return [2 /*return*/, false];
                            }
                        });
                    }); };
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 4, , 5]);
                    queue_1 = Array.from({ length: totalChunks }, function (_, i) { return i; });
                    workers = Array(Math.min(concurrency, totalChunks)).fill(null).map(function () { return __awaiter(void 0, void 0, void 0, function () {
                        var index, success;
                        return __generator(this, function (_a) {
                            switch (_a.label) {
                                case 0:
                                    if (!(queue_1.length > 0)) return [3 /*break*/, 4];
                                    index = queue_1.shift();
                                    return [4 /*yield*/, uploadChunk(index)];
                                case 1:
                                    success = _a.sent();
                                    if (!success)
                                        throw new Error("file could not be loaded");
                                    if (!(delay_number > 0)) return [3 /*break*/, 3];
                                    return [4 /*yield*/, delay(delay_number)];
                                case 2:
                                    _a.sent();
                                    _a.label = 3;
                                case 3: return [3 /*break*/, 0];
                                case 4: return [2 /*return*/];
                            }
                        });
                    }); });
                    return [4 /*yield*/, Promise.all(workers)];
                case 3:
                    _a.sent();
                    return [2 /*return*/, { success: true, id: id, message: "file uploaded successfully" }];
                case 4:
                    e_1 = _a.sent();
                    return [2 /*return*/, { success: false, id: id, message: e_1.message || "file could not be loaded" }];
                case 5: return [2 /*return*/];
            }
        });
    });
};
exports.uploadWithPartialFile = uploadWithPartialFile;
var delay = function (ms) { return new Promise(function (f) { return setTimeout(f, ms); }); };
var generateGuid = function () {
    var chars = '0123456789abcdef';
    var guid = '';
    for (var i = 0; i < 40; i++) {
        var randomIndex = Math.floor(Math.random() * chars.length);
        guid += chars.charAt(randomIndex);
    }
    return guid;
};
