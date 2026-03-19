import { appendFile as nodeAppendFile } from "node:fs"

export async function writeFile(path: string, content: string, consoleStatus: boolean = false): Promise<void> {
    await Bun.write(path, content)
    if(consoleStatus)
        console.info(`File ${path} created successfully`)
}

export async function appendFile(path: string, content: string, consoleStatus: boolean = false): Promise<void> {
    return new Promise((resolve, reject) => {
        nodeAppendFile(path, content, (error: NodeJS.ErrnoException | null) => {
            if(error)
                return reject(error)
            if(consoleStatus)
                console.info(`File ${path} updated successfully`)
            resolve()
        })
    })
}

export async function readFile(path: string): Promise<string> {
    return Bun.file(path).text()
}

export async function readOutputFile(path: string): Promise<Array<object>> {
    const fileContent = await readFile(path)
    return fileContent
        .split('\n')
        .filter(line => line.trim().length > 0)
        .map(line => JSON.parse(line))
}

export function isJsonString(str: string): boolean {
    try {
        JSON.parse(str)
    } catch(parseError: unknown) {
        console.error('JSON parse failed:', parseError)
        return false
    }
    return true
}

export function isArray(input: unknown): boolean {
    return Array.isArray(input)
}

export function isNull(input: unknown): boolean {
    return input === null || input === undefined || input === ""
}

export function getValueFromArgv(param: string, argv: string[]): string | null {
    for(const arg of argv) {
        if(arg.startsWith(`${param}=`))
            return arg.slice(param.length + 1)
    }
    return null
}

export function isArgv(param: string, argv: string[]): boolean {
    return argv.includes(param) || argv.includes(`${param}=true`)
}