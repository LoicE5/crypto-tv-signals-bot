import fs from "fs"

function writeFile(path: string, content: string, consoleStatus: boolean = false): void {
    fs.writeFile(path, content, (error) => {
        if(error) throw error
        if(consoleStatus)
            console.info(`File ${path} created successfully`)
    })
}

function appendFile(path: string, content: string, consoleStatus: boolean = false): void {
    fs.appendFile(path, content, (error) => {
        if(error) throw error
        if(consoleStatus)
            console.info(`File ${path} updated successfully`)
    })
}

function readFile(path: string): string {
    return fs.readFileSync(path, { encoding: 'utf8' })
}

function readJsonFile(path: string): unknown {
    const fileContent = readFile(path)
    return parseJsonc(fileContent)
}

function removeCommentsFromString(input: string): string {
    return input.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '')
}

function parseJsonc(jsoncString: string): unknown {
    return JSON.parse(jsoncString.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, ''))
}

function replaceTrailingCommaFromJsonString(jsonString: string, newChar: string): string {
    const latestChar = jsonString.at(-1)

    if(latestChar != ",")
        return jsonString

    return jsonString.replace(/.$/,newChar)
}

function readJsoncOutputFile(path: string): Array<object> {
    let fileContent = readFile(path)
    fileContent = removeCommentsFromString(fileContent)
    fileContent = replaceTrailingCommaFromJsonString(fileContent, ']')

    return JSON.parse(fileContent)
}

function isJsonString(str: string): boolean {
    try {
        JSON.parse(str)
    } catch(error: unknown) {
        return false
    }
    return true
}

function isArray(input: unknown): boolean {
    return Array.isArray(input)
}

function isNull(input: unknown): boolean {
    if(input == null || input == "" || input == undefined)
        return true
    else
        return false
}

function getValueFromArgv(param: string, argv: Array<string>): string | boolean {
    for(const arg of argv) {
        if(arg.includes(param))
            return arg.replace(`${param}=`, '')
    }
    return false
}

function isArgv(param: string, argv: Array<string>): boolean {
    return argv.includes(param) || argv.includes(`${param}=true`)
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
    readJsoncOutputFile,
    getValueFromArgv,
    isArgv
}
