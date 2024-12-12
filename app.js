//Importing required modules / destructuring
const { spawn, exec } = require("child_process");
const express = require("express");
const { createServer } = require('node:http');
const { Server } = require('socket.io');
const path = require("path");
const { captureRejectionSymbol } = require("events");

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);

//Env variables
const PORT = process.env.PORT || 3000;

//serving only the static files inside the folder public preventing other files to be accessed
app.use(express.static(path.join(__dirname, 'public')));

app.use(express.json()); // Middleware for parsing JSON requests

//Serving login page at start
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, "public", "login.html"));
});

app.get('/predict', (req, res) => {
    res.sendFile(path.join(__dirname, "public", "predict.html"));
});

httpServer.listen(PORT, () => {
    console.log(` server is running on http://localhost:${PORT} (local testing)`);
});

io.on('connection', (socket) => {
    console.log(`user connected: ${socket.id}`);

    socket.on("getSymptoms", () => {
        console.log(`Recieved request for symptoms from ${socket.id}`);
        getSymptoms();
    });

    socket.on('predict', async (symptoms) => {
        console.log("Recieved symptoms : " + symptoms);

        let result;
        try {
            result = await runPredictInPython(symptoms)
            console.log(result);

            //Emit to the client
            socket.emit("prediction", result);
        } catch {
            // log the error
            console.error(`error: ${result}`);
        }

    });

    socket.on('disconnect', (socket) => {
        console.log(`Socket ${socket} disconnected.`);
    });

    function getSymptoms() {
        if (symptomsList) {
            socket.emit("symptomsList", symptomsList);
            return;
        }
    
        if (!modelsTrained) {
            socket.emit("error");
            console.log("Models not trained yet");
            return false;
        }
    
        let stdin = pythonProcess.stdin.write("get\n");
        console.log(stdin);
    
        pythonProcess.stdout.once("data", (data) => {
    
            //replacing the tokens : '[', '\', ']' in the recieced python stdout 
            data = String(data).replace(/[\[\]\']/g, '');
            symptomsList = data.split(",").map(word => word.trim());
    
            //Emitting the list to the client/s
            socket.emit("symptomsList", symptomsList);
        });
    }
});

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
                }
            } catch (err) {
                reject(err);
            }
        });
    });
}

function installLibraries() {
    return new Promise((resolve, reject) => {
        exec('pip install -r requirements.txt', (error, stdout, stderr) => {
            if (error) {
                console.log(`Error installing requirements: ${error.message}`);
                resolve(false);
            }
            if (stderr) {
                console.log(`Stderr: ${stderr}`);
                resolve(false);
            }

            console.log('Requirements installed successfully');
            console.log(stdout);
            resolve(true);
        });
    });
}


let pythonProcess;
let symptomsList;
let modelsTrained;

async function startPythonScript() {

    //INstallling required libraries for python
    let install = await installLibraries();

    //Running the script
    if (install !== false) {
        console.log(`Runnig the script!`);
        pythonProcess = spawn('python', ['predict.py']);

        pythonProcess.stdout.on('data', (data) => {
            console.log(`just output: ${data}, ${typeof (data)}`);
            try {
                const response = JSON.parse(data.toString());
                if (response.models_trained !== undefined) modelsTrained = response.models_trained;
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
    } else {
        console.log("Exiting the node script!");
    }
}

//start the script as soon as the server powers up!
startPythonScript()