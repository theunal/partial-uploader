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
var vitest_1 = require("vitest");
var index_1 = require("./index");
// @vitest-environment happy-dom
(0, vitest_1.describe)('uploadWithPartialFile', function () {
    var mockUrl = 'https://api.example.com/upload';
    var mockFile = new File(['hello world'], 'test.txt', { type: 'text/plain' });
    (0, vitest_1.beforeEach)(function () {
        vitest_1.vi.stubGlobal('fetch', vitest_1.vi.fn());
        vitest_1.vi.useFakeTimers();
    });
    (0, vitest_1.it)('should upload a small file in a single chunk successfully', function () { return __awaiter(void 0, void 0, void 0, function () {
        var resultPromise, result, formData;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    fetch.mockResolvedValue({
                        ok: true,
                        status: 200
                    });
                    resultPromise = (0, index_1.uploadWithPartialFile)(mockUrl, mockFile, {}, 1024, 0);
                    // Fast-forward any delays
                    return [4 /*yield*/, vitest_1.vi.runAllTimersAsync()];
                case 1:
                    // Fast-forward any delays
                    _b.sent();
                    return [4 /*yield*/, resultPromise];
                case 2:
                    result = _b.sent();
                    (0, vitest_1.expect)(result.success).toBe(true);
                    (0, vitest_1.expect)(fetch).toHaveBeenCalledTimes(1);
                    formData = (_a = vitest_1.vi.mocked(fetch).mock.calls[0][1]) === null || _a === void 0 ? void 0 : _a.body;
                    (0, vitest_1.expect)(formData.get('isDone')).toBe('true');
                    (0, vitest_1.expect)(formData.get('totalChunks')).toBe('1');
                    return [2 /*return*/];
            }
        });
    }); });
    (0, vitest_1.it)('should upload a large file in multiple chunks', function () { return __awaiter(void 0, void 0, void 0, function () {
        var largeFile, resultPromise, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    fetch.mockResolvedValue({
                        ok: true,
                        status: 200
                    });
                    largeFile = new File(['0123456789a'], 'large.txt');
                    resultPromise = (0, index_1.uploadWithPartialFile)(mockUrl, largeFile, {}, 5, 0, 1);
                    return [4 /*yield*/, vitest_1.vi.runAllTimersAsync()];
                case 1:
                    _a.sent();
                    return [4 /*yield*/, resultPromise];
                case 2:
                    result = _a.sent();
                    (0, vitest_1.expect)(result.success).toBe(true);
                    (0, vitest_1.expect)(fetch).toHaveBeenCalledTimes(3);
                    return [2 /*return*/];
            }
        });
    }); });
    (0, vitest_1.it)('should retry on network error and succeed', function () { return __awaiter(void 0, void 0, void 0, function () {
        var resultPromise, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    fetch
                        .mockRejectedValueOnce(new Error('Network error'))
                        .mockResolvedValueOnce({ ok: true, status: 200 });
                    resultPromise = (0, index_1.uploadWithPartialFile)(mockUrl, mockFile, {}, 1024, 10);
                    // First attempt fails, wait for delay
                    return [4 /*yield*/, vitest_1.vi.runAllTimersAsync()];
                case 1:
                    // First attempt fails, wait for delay
                    _a.sent();
                    return [4 /*yield*/, resultPromise];
                case 2:
                    result = _a.sent();
                    (0, vitest_1.expect)(result.success).toBe(true);
                    (0, vitest_1.expect)(fetch).toHaveBeenCalledTimes(2);
                    return [2 /*return*/];
            }
        });
    }); });
    (0, vitest_1.it)('should refresh token on 401 and retry successfully', function () { return __awaiter(void 0, void 0, void 0, function () {
        var onUnauthorized, resultPromise, result, secondCallHeaders;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    fetch
                        .mockResolvedValueOnce({ ok: false, status: 401 }) // First attempt: 401
                        .mockResolvedValueOnce({ ok: true, status: 200 }); // Second attempt: Success
                    onUnauthorized = vitest_1.vi.fn().mockResolvedValue({
                        headers: { 'Authorization': 'Bearer new-token' }
                    });
                    resultPromise = (0, index_1.uploadWithPartialFile)(mockUrl, mockFile, { 'Authorization': 'Bearer old' }, 1024, 0, 1, onUnauthorized);
                    return [4 /*yield*/, vitest_1.vi.runAllTimersAsync()];
                case 1:
                    _b.sent();
                    return [4 /*yield*/, resultPromise];
                case 2:
                    result = _b.sent();
                    (0, vitest_1.expect)(onUnauthorized).toHaveBeenCalled();
                    (0, vitest_1.expect)(result.success).toBe(true);
                    (0, vitest_1.expect)(fetch).toHaveBeenCalledTimes(2);
                    secondCallHeaders = (_a = vitest_1.vi.mocked(fetch).mock.calls[1][1]) === null || _a === void 0 ? void 0 : _a.headers;
                    (0, vitest_1.expect)(secondCallHeaders['Authorization']).toBe('Bearer new-token');
                    return [2 /*return*/];
            }
        });
    }); });
    (0, vitest_1.it)('should fail after maximum retries', function () { return __awaiter(void 0, void 0, void 0, function () {
        var resultPromise, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    fetch.mockRejectedValue(new Error('Persistent error'));
                    resultPromise = (0, index_1.uploadWithPartialFile)(mockUrl, mockFile, {}, 1024, 0);
                    return [4 /*yield*/, vitest_1.vi.runAllTimersAsync()];
                case 1:
                    _a.sent();
                    return [4 /*yield*/, resultPromise];
                case 2:
                    result = _a.sent();
                    (0, vitest_1.expect)(result.success).toBe(false);
                    (0, vitest_1.expect)(fetch).toHaveBeenCalledTimes(3); // Retry limit is 3 in code
                    return [2 /*return*/];
            }
        });
    }); });
    (0, vitest_1.it)('should handle concurrency correctly', function () { return __awaiter(void 0, void 0, void 0, function () {
        var largeFile, resultPromise, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    fetch.mockResolvedValue({ ok: true, status: 200 });
                    largeFile = new File(['a'.repeat(100)], 'concurrency.txt');
                    resultPromise = (0, index_1.uploadWithPartialFile)(mockUrl, largeFile, {}, 10, 0, 5);
                    return [4 /*yield*/, vitest_1.vi.runAllTimersAsync()];
                case 1:
                    _a.sent();
                    return [4 /*yield*/, resultPromise];
                case 2:
                    result = _a.sent();
                    (0, vitest_1.expect)(result.success).toBe(true);
                    (0, vitest_1.expect)(fetch).toHaveBeenCalledTimes(10);
                    return [2 /*return*/];
            }
        });
    }); });
});
