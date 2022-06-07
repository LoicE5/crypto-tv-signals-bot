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
    isNull
}