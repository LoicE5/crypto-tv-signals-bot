import { appendFile as nodeAppendFile } from "node:fs"

async function writeFile(path: string, content: string, consoleStatus: boolean = false): Promise<void> {
    await Bun.write(path, content)
    if(consoleStatus)
        console.info(`File ${path} created successfully`)
}

async function appendFile(path: string, content: string, consoleStatus: boolean = false): Promise<void> {
    return new Promise((resolve, reject) => {
        nodeAppendFile(path, content, (error: NodeJS.ErrnoException | null) => {
            if(error) { reject(error); return }
            if(consoleStatus)
                console.info(`File ${path} updated successfully`)
            resolve()
        })
    })
}

async function readFile(path: string): Promise<string> {
    return Bun.file(path).text()
}

async function readJsonFile(path: string): Promise<unknown> {
    const fileContent = await readFile(path)
    return parseJsonc(fileContent)
}

function removeCommentsFromString(input: string): string {
    return input.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '')
}

function parseJsonc(jsoncString: string): unknown {
    return JSON.parse(jsoncString.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, ''))
}

async function readOutputFile(path: string): Promise<Array<object>> {
    const fileContent = await readFile(path)
    return fileContent
        .split('\n')
        .filter(line => line.trim().length > 0)
        .map(line => JSON.parse(line))
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
    readOutputFile,
    getValueFromArgv,
    isArgv
}
