const express = require("express");
const fs = require("fs");
const app = express();

app.use(express.json());

app.get("/", (req, res) => {
  res.sendFile(__dirname + `/public/landing.html`);
});

app.use(express.static("public"));

app.get("/:roomname", (req, res) => {
  res.sendFile(__dirname + `/public/index.html`);
});

app.get("/:roomname/screenshare", (req, res) => {
  res.sendFile(__dirname + `/public/screenshare/index.html`);
});

const logFiles = fs.readdirSync("./public/logs");
let logIndex = logFiles.length;
app.post("/report", (req, res) => {
  const { problem, logs, userId } = req.body;
  let fileName = req.body.fileName;
  if (problem) {
    let logContent = {
      recordedAt: Date.now(),
      problem,
      reporter: userId,
    };
    logContent[userId] = logs;
    fileName = `${logIndex}.json`;
    fs.writeFile(
      `./public/logs/${fileName}`,
      JSON.stringify(logContent, null, 2),
      () => {}
    );
    logIndex += 1;
    return res.json({
      url: `/logs/${fileName}`,
      fileName,
    });
  }

  fs.readFile(`./public/logs/${fileName}`, (err, data) => {
    if (err) {
      return res.json({
        status: "unsuccessful",
      });
    }

    const existingLogs = JSON.parse(data);
    existingLogs[userId] = logs;
    fs.writeFile(
      `./public/logs/${fileName}`,
      JSON.stringify(existingLogs, null, 2),
      () => {}
    );
    return res.json({
      status: "successful",
    });
  });
});

app.listen(3006, () => {
  console.log("listening on *:3006, webrtc.songz.dev");
});
