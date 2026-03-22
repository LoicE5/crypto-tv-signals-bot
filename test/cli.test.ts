import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import fs from "fs"
import path from "path"
import { discoverNdjsonFiles } from "../src/cli"

const TEST_DIR = "/tmp/crypto-tv-signals-bot-cli-tests"

beforeEach(() => {
    if(fs.existsSync(TEST_DIR))
        fs.rmSync(TEST_DIR, { recursive: true })
    fs.mkdirSync(TEST_DIR, { recursive: true })
})

afterEach(() => {
    if(fs.existsSync(TEST_DIR))
        fs.rmSync(TEST_DIR, { recursive: true })
})

describe("discoverNdjsonFiles", () => {
    it("returns ndjson files in the current directory", async () => {
        fs.writeFileSync(path.join(TEST_DIR, "data.ndjson"), "")
        const originalCwd = process.cwd()
        process.chdir(TEST_DIR)
        try {
            const files = await discoverNdjsonFiles()
            expect(files.length).toBe(1)
            expect(files.at(0)).toBe("./data.ndjson")
        } finally {
            process.chdir(originalCwd)
        }
    })

    it("discovers ndjson files recursively in subdirectories", async () => {
        const subDir = path.join(TEST_DIR, "output")
        fs.mkdirSync(subDir, { recursive: true })
        fs.writeFileSync(path.join(subDir, "BTCUSDT_1m.ndjson"), "")
        fs.writeFileSync(path.join(TEST_DIR, "root.ndjson"), "")
        const originalCwd = process.cwd()
        process.chdir(TEST_DIR)
        try {
            const files = await discoverNdjsonFiles()
            expect(files.length).toBe(2)
            expect(files.some(file => file.includes("root.ndjson"))).toBe(true)
            expect(files.some(file => file.includes("output/BTCUSDT_1m.ndjson"))).toBe(true)
        } finally {
            process.chdir(originalCwd)
        }
    })

    it("excludes files inside node_modules", async () => {
        const nodeModDir = path.join(TEST_DIR, "node_modules", "some-pkg")
        fs.mkdirSync(nodeModDir, { recursive: true })
        fs.writeFileSync(path.join(nodeModDir, "data.ndjson"), "")
        fs.writeFileSync(path.join(TEST_DIR, "real.ndjson"), "")
        const originalCwd = process.cwd()
        process.chdir(TEST_DIR)
        try {
            const files = await discoverNdjsonFiles()
            expect(files.length).toBe(1)
            expect(files.at(0)).toBe("./real.ndjson")
        } finally {
            process.chdir(originalCwd)
        }
    })

    it("returns an empty array when no ndjson files exist", async () => {
        const originalCwd = process.cwd()
        process.chdir(TEST_DIR)
        try {
            const files = await discoverNdjsonFiles()
            expect(files).toEqual([])
        } finally {
            process.chdir(originalCwd)
        }
    })

    it("does not include non-ndjson files", async () => {
        fs.writeFileSync(path.join(TEST_DIR, "data.json"), "")
        fs.writeFileSync(path.join(TEST_DIR, "log.txt"), "")
        fs.writeFileSync(path.join(TEST_DIR, "signal.ndjson"), "")
        const originalCwd = process.cwd()
        process.chdir(TEST_DIR)
        try {
            const files = await discoverNdjsonFiles()
            expect(files.length).toBe(1)
            expect(files.at(0)).toBe("./signal.ndjson")
        } finally {
            process.chdir(originalCwd)
        }
    })

    it("returns results sorted alphabetically", async () => {
        fs.writeFileSync(path.join(TEST_DIR, "c.ndjson"), "")
        fs.writeFileSync(path.join(TEST_DIR, "a.ndjson"), "")
        fs.writeFileSync(path.join(TEST_DIR, "b.ndjson"), "")
        const originalCwd = process.cwd()
        process.chdir(TEST_DIR)
        try {
            const files = await discoverNdjsonFiles()
            expect(files).toEqual(["./a.ndjson", "./b.ndjson", "./c.ndjson"])
        } finally {
            process.chdir(originalCwd)
        }
    })
})
