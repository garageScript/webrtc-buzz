const express = require("express");
const app = express();

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

app.listen(3006, () => {
  console.log("listening on *:3005, webrtc.songz.dev");
});
