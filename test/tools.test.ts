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
    readOutputFile,
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
    it("creates a file with the given content", async () => {
        await writeFile(TEST_FILE, "hello world")
        expect(fs.existsSync(TEST_FILE)).toBe(true)
        expect(fs.readFileSync(TEST_FILE, "utf8")).toBe("hello world")
    })

    it("overwrites an existing file", async () => {
        fs.writeFileSync(TEST_FILE, "old content")
        await writeFile(TEST_FILE, "new content")
        expect(fs.readFileSync(TEST_FILE, "utf8")).toBe("new content")
    })
})

describe("appendFile", () => {
    it("appends content to an existing file", async () => {
        fs.writeFileSync(TEST_FILE, "start")
        await appendFile(TEST_FILE, "-end")
        expect(fs.readFileSync(TEST_FILE, "utf8")).toBe("start-end")
    })

    it("creates a file if it doesn't exist and appends content", async () => {
        await appendFile(TEST_FILE, "appended")
        expect(fs.existsSync(TEST_FILE)).toBe(true)
        expect(fs.readFileSync(TEST_FILE, "utf8")).toBe("appended")
    })
})

describe("readFile", () => {
    it("reads the content of a file as a string", async () => {
        fs.writeFileSync(TEST_FILE, "test content")
        expect(await readFile(TEST_FILE)).toBe("test content")
    })

    it("throws when file does not exist", async () => {
        await expect(readFile("/nonexistent/path/file.txt")).rejects.toThrow()
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

describe("readOutputFile", () => {
    it("parses a .ndjson file with multiple entries (one JSON object per line)", async () => {
        const content = `{"pair":"BTCUSDT","price":50000,"signal":"BUY"}\n{"pair":"BTCUSDT","price":51000,"signal":"SELL"}\n`
        fs.writeFileSync(TEST_JSONC_FILE, content)
        const result = await readOutputFile(TEST_JSONC_FILE)
        expect(Array.isArray(result)).toBe(true)
        expect(result.length).toBe(2)
    })

    it("parses a .ndjson file with a single entry", async () => {
        const content = `{"pair":"BTCUSDT","price":50000,"signal":"BUY"}\n`
        fs.writeFileSync(TEST_JSONC_FILE, content)
        const result = await readOutputFile(TEST_JSONC_FILE)
        expect(Array.isArray(result)).toBe(true)
        expect(result.length).toBe(1)
    })

    it("ignores blank lines", async () => {
        const content = `{"pair":"BTCUSDT","price":50000,"signal":"BUY"}\n\n{"pair":"BTCUSDT","price":51000,"signal":"SELL"}\n`
        fs.writeFileSync(TEST_JSONC_FILE, content)
        const result = await readOutputFile(TEST_JSONC_FILE)
        expect(Array.isArray(result)).toBe(true)
        expect(result.length).toBe(2)
    })

    it("returns an empty array for an empty file", async () => {
        fs.writeFileSync(TEST_JSONC_FILE, "")
        const result = await readOutputFile(TEST_JSONC_FILE)
        expect(Array.isArray(result)).toBe(true)
        expect(result.length).toBe(0)
    })
})

describe("readJsonFile", () => {
    it("reads and parses a JSON file", async () => {
        fs.writeFileSync(TEST_JSON_FILE, '{"name":"test","value":42}')
        const result = await readJsonFile(TEST_JSON_FILE)
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

    it("returns false for 0 (strict equality — 0 is not null/undefined/empty string)", () => {
        expect(isNull(0)).toBe(false)
    })

    it("returns false for false (strict equality — false is not null/undefined/empty string)", () => {
        expect(isNull(false)).toBe(false)
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

    it("returns null when the argument is not present", () => {
        const argv = ["node", "script.js", "--interval=4h"]
        expect(getValueFromArgv("--path", argv)).toBeNull()
    })

    it("returns empty string when argument is provided with no value", () => {
        const argv = ["node", "script.js", "--path="]
        expect(getValueFromArgv("--path", argv)).toBe("")
    })

    it("handles an empty argv array", () => {
        expect(getValueFromArgv("--path", [])).toBeNull()
    })

    it("does not match partial argument names (uses startsWith)", () => {
        const argv = ["node", "script.js", "--pathlength=5"]
        // --path does not startsWith "--pathlength=", so it does not match
        expect(getValueFromArgv("--path", argv)).toBeNull()
    })

    it("does not match a flag without value (--flag with no =)", () => {
        // --path without '=' is handled by isArgv, not getValueFromArgv
        const argv = ["node", "script.js", "--path"]
        expect(getValueFromArgv("--path", argv)).toBeNull()
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
