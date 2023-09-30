"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const Dropzone_1 = __importDefault(require("./Dropzone"));
const react_1 = __importStar(require("react"));
const functions_1 = require("../tools/functions");
const recharts_1 = require("recharts");
function Main() {
    const [charts, setCharts] = (0, react_1.useState)([]);
    function pushInCharts(chart) {
        setCharts([...charts, chart]);
    }
    const onDrop = (0, react_1.useCallback)((acceptedFiles) => {
        acceptedFiles.map((file) => {
            (0, functions_1.readFile)(file, (res) => {
                handleData(res);
            });
        });
    }, []);
    function handleData(data) {
        let formattedData = (0, functions_1.jsonParseSimulationFile)(data);
        const chart = (<recharts_1.LineChart width={window.innerWidth} height={window.innerHeight} data={formattedData}>
                <recharts_1.XAxis dataKey="unix_time"/>
                <recharts_1.YAxis domain={['dataMin', 'dataMax']}/>
                <recharts_1.Line type="monotone" dataKey="price" stroke="#8884d8"/>
                <recharts_1.Line type="monotone" dataKey="signal" stroke="darkgray"/>
                <recharts_1.Tooltip />
                <recharts_1.Legend />
            </recharts_1.LineChart>);
        pushInCharts(chart);
    }
    return (<>
            <h1>Hello world !!!</h1>
            <Dropzone_1.default onDrop={onDrop}/>
            {charts}
        </>);
}
exports.default = Main;
