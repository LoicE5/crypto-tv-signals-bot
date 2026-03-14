import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import fs from "fs"
import path from "path"
import {
    writeFile,
    appendFile,
    readFile,
    readJsonFile,
    parseJsonc,
    removeCommentsFromString,
    readJsoncOutputFile,
    isJsonString,
    isArray,
    isNull,
    getValueFromArgv,
    isArgv
} from "../src/tools"

const TEST_DIR = "/tmp/crypto-tv-signals-bot-tests"
const TEST_FILE = path.join(TEST_DIR, "test.txt")
const TEST_JSON_FILE = path.join(TEST_DIR, "test.json")
const TEST_JSONC_FILE = path.join(TEST_DIR, "test.jsonc")

beforeEach(() => {
    if(!fs.existsSync(TEST_DIR))
        fs.mkdirSync(TEST_DIR, { recursive: true })
})

afterEach(() => {
    if(fs.existsSync(TEST_FILE)) fs.unlinkSync(TEST_FILE)
    if(fs.existsSync(TEST_JSON_FILE)) fs.unlinkSync(TEST_JSON_FILE)
    if(fs.existsSync(TEST_JSONC_FILE)) fs.unlinkSync(TEST_JSONC_FILE)
})

describe("writeFile", () => {
    it("creates a file with the given content", () => {
        return new Promise<void>((resolve) => {
            writeFile(TEST_FILE, "hello world")
            setTimeout(() => {
                expect(fs.existsSync(TEST_FILE)).toBe(true)
                expect(fs.readFileSync(TEST_FILE, "utf8")).toBe("hello world")
                resolve()
            }, 100)
        })
    })

    it("overwrites an existing file", () => {
        return new Promise<void>((resolve) => {
            fs.writeFileSync(TEST_FILE, "old content")
            writeFile(TEST_FILE, "new content")
            setTimeout(() => {
                expect(fs.readFileSync(TEST_FILE, "utf8")).toBe("new content")
                resolve()
            }, 100)
        })
    })
})

describe("appendFile", () => {
    it("appends content to an existing file", () => {
        return new Promise<void>((resolve) => {
            fs.writeFileSync(TEST_FILE, "start")
            appendFile(TEST_FILE, "-end")
            setTimeout(() => {
                expect(fs.readFileSync(TEST_FILE, "utf8")).toBe("start-end")
                resolve()
            }, 100)
        })
    })

    it("creates a file if it doesn't exist and appends content", () => {
        return new Promise<void>((resolve) => {
            appendFile(TEST_FILE, "appended")
            setTimeout(() => {
                expect(fs.existsSync(TEST_FILE)).toBe(true)
                expect(fs.readFileSync(TEST_FILE, "utf8")).toBe("appended")
                resolve()
            }, 100)
        })
    })
})

describe("readFile", () => {
    it("reads the content of a file as a string", () => {
        fs.writeFileSync(TEST_FILE, "test content")
        expect(readFile(TEST_FILE)).toBe("test content")
    })

    it("throws when file does not exist", () => {
        expect(() => readFile("/nonexistent/path/file.txt")).toThrow()
    })
})

describe("parseJsonc", () => {
    it("parses a valid JSON string", () => {
        const result = parseJsonc('{"key": "value"}')
        expect(result).toEqual({ key: "value" })
    })

    it("parses a JSON string with single-line comments", () => {
        const result = parseJsonc('{"key": "value"} // comment')
        expect(result).toEqual({ key: "value" })
    })

    it("parses a JSON string with multi-line comments", () => {
        const jsonc = `{
            /* this is a comment */
            "key": "value"
        }`
        const result = parseJsonc(jsonc)
        expect(result).toEqual({ key: "value" })
    })

    it("throws on malformed JSON after stripping comments", () => {
        expect(() => parseJsonc("{invalid json}")).toThrow()
    })
})

describe("removeCommentsFromString", () => {
    it("removes single-line comments", () => {
        const result = removeCommentsFromString("value // comment")
        expect(result).toBe("value ")
    })

    it("removes multi-line comments", () => {
        const result = removeCommentsFromString("value /* multi\nline */ rest")
        expect(result).toBe("value  rest")
    })

    it("leaves strings without comments unchanged", () => {
        const result = removeCommentsFromString("just a string")
        expect(result).toBe("just a string")
    })
})

describe("readJsoncOutputFile", () => {
    it("parses a .jsonc file with trailing comma (logJsonTable format) into an array", () => {
        // logJsonTable format: starts with '[', each entry has a trailing comma, no closing bracket
        const content = `[{"pair":"BTCUSDT","price":50000,"signal":"BUY"},{"pair":"BTCUSDT","price":51000,"signal":"SELL"},`
        fs.writeFileSync(TEST_JSONC_FILE, content)
        const result = readJsoncOutputFile(TEST_JSONC_FILE)
        expect(Array.isArray(result)).toBe(true)
        expect(result.length).toBe(2)
    })

    it("parses a .jsonc file without trailing comma into an array", () => {
        const content = `[{"pair":"BTCUSDT","price":50000,"signal":"BUY"}]`
        fs.writeFileSync(TEST_JSONC_FILE, content)
        const result = readJsoncOutputFile(TEST_JSONC_FILE)
        expect(Array.isArray(result)).toBe(true)
        expect(result.length).toBe(1)
    })

    it("parses a .jsonc file with inline comments", () => {
        const content = `[
            // first entry
            {"pair":"BTCUSDT","price":50000,"signal":"BUY"},
            /* second entry */
            {"pair":"BTCUSDT","price":51000,"signal":"SELL"}
        ]`
        fs.writeFileSync(TEST_JSONC_FILE, content)
        const result = readJsoncOutputFile(TEST_JSONC_FILE)
        expect(Array.isArray(result)).toBe(true)
        expect(result.length).toBe(2)
    })
})

describe("readJsonFile", () => {
    it("reads and parses a JSON file", () => {
        fs.writeFileSync(TEST_JSON_FILE, '{"name":"test","value":42}')
        const result = readJsonFile(TEST_JSON_FILE)
        expect(result).toEqual({ name: "test", value: 42 })
    })
})

describe("isJsonString", () => {
    it("returns true for a valid JSON string", () => {
        expect(isJsonString('{"key":"value"}')).toBe(true)
    })

    it("returns true for a JSON array string", () => {
        expect(isJsonString('[1,2,3]')).toBe(true)
    })

    it("returns true for a JSON number", () => {
        expect(isJsonString('42')).toBe(true)
    })

    it("returns false for an invalid JSON string", () => {
        expect(isJsonString('{invalid}')).toBe(false)
    })

    it("returns false for an empty string", () => {
        expect(isJsonString('')).toBe(false)
    })

    it("returns false for a plain string", () => {
        expect(isJsonString('hello world')).toBe(false)
    })
})

describe("isArray", () => {
    it("returns true for an array", () => {
        expect(isArray([1, 2, 3])).toBe(true)
    })

    it("returns true for an empty array", () => {
        expect(isArray([])).toBe(true)
    })

    it("returns false for an object", () => {
        expect(isArray({})).toBe(false)
    })

    it("returns false for a string", () => {
        expect(isArray("string")).toBe(false)
    })

    it("returns false for null", () => {
        expect(isArray(null)).toBe(false)
    })

    it("returns false for a number", () => {
        expect(isArray(42)).toBe(false)
    })
})

describe("isNull", () => {
    it("returns true for null", () => {
        expect(isNull(null)).toBe(true)
    })

    it("returns true for undefined", () => {
        expect(isNull(undefined)).toBe(true)
    })

    it("returns true for empty string", () => {
        expect(isNull("")).toBe(true)
    })

    it("returns false for a non-empty string", () => {
        expect(isNull("value")).toBe(false)
    })

    it("returns true for 0 due to JS coercion (0 == '')", () => {
        // 0 == "" is true in JS due to type coercion, so isNull treats 0 as null-like
        expect(isNull(0)).toBe(true)
    })

    it("returns true for false due to JS coercion (false == '')", () => {
        // false == "" is true in JS due to type coercion, so isNull treats false as null-like
        expect(isNull(false)).toBe(true)
    })

    it("returns false for an object", () => {
        expect(isNull({})).toBe(false)
    })
})

describe("getValueFromArgv", () => {
    it("returns the value of an argument given as --key=value", () => {
        const argv = ["node", "script.js", "--path=/some/path", "--interval=4h"]
        expect(getValueFromArgv("--path", argv)).toBe("/some/path")
        expect(getValueFromArgv("--interval", argv)).toBe("4h")
    })

    it("returns false when the argument is not present", () => {
        const argv = ["node", "script.js", "--interval=4h"]
        expect(getValueFromArgv("--path", argv)).toBe(false)
    })

    it("returns empty string when argument is provided with no value", () => {
        const argv = ["node", "script.js", "--path="]
        expect(getValueFromArgv("--path", argv)).toBe("")
    })

    it("handles an empty argv array", () => {
        expect(getValueFromArgv("--path", [])).toBe(false)
    })

    it("matches partial argument names since the function uses String.includes()", () => {
        const argv = ["node", "script.js", "--pathlength=5"]
        // --path is a substring of --pathlength=5 so the function matches it
        // arg.replace("--path=", "") on "--pathlength=5" leaves "--pathlength=5" as-is
        // because "--path=" is not a substring of "--pathlength=5"
        const result = getValueFromArgv("--path", argv)
        // includes("--path") matches, but replace("--path=", "") doesn't change anything
        expect(result).toBe("--pathlength=5")
    })
})

describe("isArgv", () => {
    it("returns true when the flag is present in argv", () => {
        const argv = ["node", "script.js", "--inverted"]
        expect(isArgv("--inverted", argv)).toBe(true)
    })

    it("returns true when the flag is present as --flag=true", () => {
        const argv = ["node", "script.js", "--inverted=true"]
        expect(isArgv("--inverted", argv)).toBe(true)
    })

    it("returns false when the flag is not present", () => {
        const argv = ["node", "script.js", "--interval=4h"]
        expect(isArgv("--inverted", argv)).toBe(false)
    })

    it("returns false for --flag=false variant", () => {
        const argv = ["node", "script.js", "--inverted=false"]
        expect(isArgv("--inverted", argv)).toBe(false)
    })

    it("handles an empty argv array", () => {
        expect(isArgv("--inverted", [])).toBe(false)
    })
})
