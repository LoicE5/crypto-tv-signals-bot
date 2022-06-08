import fs from "fs"

function writeFile(path: string, content: any, consoleStatus:boolean=false):void {
    fs.writeFile(path, content, (err) => {
        if (err) throw err
        if(consoleStatus)
            console.log(`File ${path} created successfully`)
    })
}

function appendFile(path:string, content:any, consoleStatus:boolean=false):void {
    fs.appendFile(path, content, (err) => {
        if (err) throw err
        if(consoleStatus)
            console.log(`File ${path} updated successfully`)
    })
}

function readFile(path: string): string {
    return fs.readFileSync(path,{encoding:'utf8'})
}

function readJsonFile(path: string): Object {
    let fileContent = readFile(path)
    return parseJsonc(fileContent)
}

function removeCommentsFromString(input: string) {
    return input.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '')
}

function parseJsonc(jsoncString: string) {
    return JSON.parse(jsoncString.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, ''))
}

function replaceTrailingCommaFromJsonString(jsonString: string, newChar: string): string {
    let latestChar = jsonString.charAt(jsonString.length - 1)
    
    if (latestChar != ",")
        return jsonString
    
    return jsonString.replace(/.$/,newChar)
}

function readJsoncOutputFile(path: string): Array<Object> { // Specific

    let fileContent = readFile(path)
    fileContent = removeCommentsFromString(fileContent)
    fileContent = replaceTrailingCommaFromJsonString(fileContent, ']')
    
    return JSON.parse(fileContent)
}

function isJsonString(str:string):boolean {
    try {
        JSON.parse(str);
    } catch (e) {
        return false;
    }
    return true;
}

function isArray(input:any):boolean {
    return Array.isArray(input)
}

function isNull(input:any):boolean {
    if (input == null || input == "" || input == undefined)
        return true
    else
        return false
}

export {
    writeFile,
    appendFile,
    isJsonString,
    isArray,
    isNull,
    readFile,
    readJsonFile,
    parseJsonc,
    removeCommentsFromString,
    readJsoncOutputFile
}