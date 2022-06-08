import { getLastPrice, getIndicator, logJsonTable, analyseJsonTable } from './functions'
import { readFile, readJsonFile, readJsoncOutputFile } from './tools'

(async () => {
    console.log(analyseJsonTable("./output/BTCUSDT_5m_23-1-2022.jsonc",true))
    
})()