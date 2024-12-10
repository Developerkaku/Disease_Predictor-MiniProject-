// import { exec } from "child_process";
// import { Socket } from "socket.io";
// import express from "express";
// import { createServer, Server } from "http";
// import path from "path";
// import { fileURLToPath } from "url";

const { exec, spawn } = require("child_process");
const express = require("express");
// const cors = require('cors');
// const bodyParser = require("body-parser");
const { createServer } = require('node:http');
const { join, dirname } = require("node:path");
const { Server } = require('socket.io');
const fs = require("fs");
const path = require("path");
const { Console } = require("console");
const { type } = require("os");

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);
const PORT = 3000;

app.use(express.static(path.join(__dirname, 'public')));

app.use(express.json()); // Middleware for parsing JSON requests

let pythonProcess;
let symptomsList;
let modelsTrained;

function startPythonScript() {
    console.log(`Script started!`);

    // return new Promise((resolve, reject) => {
        //spawn input data to the Python script
        pythonProcess = spawn('python', ['predict.py']);

        pythonProcess.stdout.on('data', (data) => {
            console.log(`just output: ${data}, ${typeof (data)}`);
            try {
                const response = JSON.parse(data.toString());
                if(response.models_trained !== undefined) modelsTrained = response.models_trained;
                console.log(modelsTrained);
            } catch (err) {
                console.log(err);
            }
        });

        pythonProcess.stderr.on("data", (data) => {
            console.error(`Python stderr: ${data}`);
        });
        pythonProcess.on("close", (code) => {
            console.log(`Python script exited with code ${code}`);
        });
    // });
}
startPythonScript();

function runPredictInPython(inputData) {
    return new Promise((resolve, reject) => {
        let stdin = pythonProcess.stdin.write(inputData + "\n");

        console.log(`writing to stdin done! ${stdin}`);

        pythonProcess.stdout.once('data', (data) => {
            try {
                const response = JSON.parse(data.toString());

                if (response.error) {
                    reject(response.error);
                } else {
                    resolve(response);
                }                                              //promise tisi stdout ni repat cheyakunda try cheyyi
            } catch (err) {
                reject(err);
            }
        });
    });
}

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, "public", "login.html"));
});
app.get('/predict', (req, res) => {
    res.sendFile(path.join(__dirname, "public", "predict.html"));
});

io.on('connection', (socket) => {
    console.log(`user connected: ${socket}`);

    socket.on("getSymptoms", () => {
        console.log("ochchcindi bey !!!");
        
        if(!modelsTrained){
            socket.emit("error");
            console.log("dengey antunna");
            return "fuck away!";
        }

        let stdin = pythonProcess.stdin.write("get\n");
        console.log(stdin);

        pythonProcess.stdout.once("data", (data) => {
            
            data = String(data).replace(/[\[\]\']/g, '');
            symptomsList = data.split(",").map(word => word.trim());

            socket.emit("symptomsList", symptomsList);
        });
    });

    socket.on('predict', async (symptoms) => {
        console.log("Recieved symptoms : " + symptoms);

        let result;
        try {
            result = await runPredictInPython(symptoms)
            console.log(result)

            socket.emit("prediction", result.prediction);
            if(result.warning) socket.emit("error");
        } catch {
            // Do nothing , (server aagipotundi bayya error oste, try catch pettina 😅)
            console.error(`error: ${result}`);
        }

    });

    socket.on('disconnect', (socket) => {
        console.log(`Socket ${socket} disconnected.`);
    });
})

httpServer.listen(PORT, () => {
    console.log(` server is running on http://localhost:${PORT}`);
});