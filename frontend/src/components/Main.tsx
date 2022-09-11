import Dropzone from "./Dropzone";
import React, { ReactElement, useCallback, useState } from "react";
import { jsonParseSimulationFile, readFile } from "../tools/functions";
import { LineChart, XAxis, YAxis, CartesianGrid, Line, Tooltip, Legend, Cell } from "recharts";

export default function Main() {

    const [charts, setCharts]: Array<any> = useState([])
    function pushInCharts(chart: ReactElement) {
        setCharts([...charts, chart])
    }

    const onDrop = useCallback((acceptedFiles: any) => {
        acceptedFiles.map((file: any) => {
            readFile(file, (res:any) => {
                handleData(res)
            })
        });
    },[])


    function handleData(data: string): void {
        let formattedData = jsonParseSimulationFile(data) as Array<any>

        const chart = (
            <LineChart width={window.innerWidth} height={window.innerHeight} data={formattedData as any}>
                <XAxis dataKey="unix_time"/>
                <YAxis domain={['dataMin', 'dataMax']} />
                <Line type="monotone" dataKey="price" stroke="#8884d8" />
                <Line type="monotone" dataKey="signal" stroke="darkgray" />
                <Tooltip />
                <Legend />
            </LineChart>
        )

        pushInCharts(chart)
    }

    return (
        <>
            <h1>Hello world !!!</h1>
            <Dropzone onDrop={onDrop} />
            {charts}
        </>
    )
}