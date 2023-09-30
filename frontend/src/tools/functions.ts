export function readFile(file:any, callback: Function, filereader: FileReader = new FileReader()):void {
    const reader = new FileReader();
    reader.onload = function (e) {
        callback(e.target!.result)
    };
    reader.readAsText(file);
    return file;
}

export function isJsonString(string: string): boolean {
    try {
        JSON.parse(string)
    } catch (e) {
        return false
    }
    return true
}

export function jsonParseSimulationFile(jsonSimulationFile: string): object | undefined {
    if (isJsonString(jsonSimulationFile)) {
        return JSON.parse(jsonSimulationFile)
    } else {

        try {

            let newJsonString = jsonSimulationFile.slice(0, -1).concat(']')
            return JSON.parse(newJsonString)
            
        } catch (err) {
            console.error("The given jsonSimulationFile cannot be parsed.")
        }
    }
}