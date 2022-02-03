const pty = require("node-pty");
import { createServer } from "http";
import { WebSocketServer } from "ws";
import os from "os";
import path from "path";
import fs from "fs";
import { execSync } from "child_process";

const server = createServer();

const wss1 = new WebSocketServer({ noServer: true });
const wss2 = new WebSocketServer({ noServer: true });

const codeDir = path.join(__dirname, "code");

const fileContentProvider = () => {
    const fileContent: { fileName: string; content: string }[] = [];
    const files = fs.readdirSync(codeDir);

    files.map((file: string) => {
        const content = fs.readFileSync(path.join(__dirname, `code/${file}`)).toString();
        fileContent.push({
            fileName: file,
            content,
        });
    });
    return fileContent;
};

const readAllDir = () => {
    return fs.readdirSync(codeDir);
};

wss1.on("connection", function connection(ws) {
    ws.on("message", function message(data) {
        console.log("received: %s", data);
    });

    ws.on("open", () => {
        console.log("Open");
        ws.send(
            JSON.stringify({
                type: "update-all-files",
                contents: fileContentProvider(),
            })
        );
        console.log("Message sent");
    });

    ws.on("close", () => {
        console.log("closed");
    });

    ws.on("message", (message) => {
        const receivedMessage = JSON.parse(message.toString());
        console.log(`Received message ${receivedMessage.type}`);

        if (receivedMessage.type === "get-all-files") {
            ws.send(
                JSON.stringify({
                    type: "update-all-files",
                    contents: fileContentProvider(),
                })
            );
        }

        if (receivedMessage.type === "update-file") {
            console.log(receivedMessage.content.fileName);
            fs.writeFileSync(
                path.join(__dirname, `code/${receivedMessage.content.fileName}`),
                `${receivedMessage.content.fileContent}`
            );
            ws.send(
                JSON.stringify({
                    type: "updated-file",
                })
            );
        }

        if (receivedMessage.type === "create-file") {
            const fileName = receivedMessage.content.fileName;
            const type = receivedMessage.content.type;
            if (type === "file") {
                execSync(`cd code ; touch ${fileName} `);
            }

            ws.send(
                JSON.stringify({
                    type: "update-file-column",
                    contents: readAllDir(),
                })
            );
        }
    });
});

wss2.on("connection", function connection(ws) {
    ws.on("message", function message(data) {
        console.log("received: %s", data);
    });

    console.log("Connected to client");

    ws.on("close", () => {
        console.log("The client disconnected");
    });

    const shell = os.platform() === "win32" ? "powershell.exe" : "bash";

    const ptyEnv: any = process.env;

    const ptyProcess = pty.spawn(shell, [], {
        name: "xterm-color",
        cols: 80,
        rows: 30,
        cwd: path.join(__dirname, `/code`),
        env: ptyEnv,
    });

    ptyProcess.onData((data: string) => {
        console.log("I am serving the output now");
        ws.send(data);
    });

    ptyProcess.write("static-server -p 1337\r");

    ws.on("message", (input: string) => {
        console.log("I am getting the input now");
        ptyProcess.write(input);
    });
});

server.on("upgrade", function upgrade(request, socket, head) {
    const pathname = request.url;
    console.log("server on");

    if (pathname === "/fileSys") {
        wss1.handleUpgrade(request, socket, head, function done(ws) {
            wss1.emit("connection", ws, request);
            console.log("fileSys");
        });
    } else if (pathname === "/terminal") {
        wss2.handleUpgrade(request, socket, head, function done(ws) {
            wss2.emit("connection", ws, request);
            console.log("connection started , terminal");
        });
    } else {
        socket.destroy();
    }
});

server.listen(8081, () => {
    console.log("server listening on port 8081");
});
