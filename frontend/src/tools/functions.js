"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.jsonParseSimulationFile = exports.isJsonString = exports.readFile = void 0;
function readFile(file, callback, filereader = new FileReader()) {
    const reader = new FileReader();
    reader.onload = function (e) {
        callback(e.target.result);
    };
    reader.readAsText(file);
    return file;
}
exports.readFile = readFile;
function isJsonString(string) {
    try {
        JSON.parse(string);
    }
    catch (e) {
        return false;
    }
    return true;
}
exports.isJsonString = isJsonString;
function jsonParseSimulationFile(jsonSimulationFile) {
    if (isJsonString(jsonSimulationFile)) {
        return JSON.parse(jsonSimulationFile);
    }
    else {
        try {
            let newJsonString = jsonSimulationFile.slice(0, -1).concat(']');
            return JSON.parse(newJsonString);
        }
        catch (err) {
            console.error("The given jsonSimulationFile cannot be parsed.");
        }
    }
}
exports.jsonParseSimulationFile = jsonParseSimulationFile;
