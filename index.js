const express = require("express");
const app = express();

app.use(express.static("public"));

app.listen(3006, () => {
  console.log("listening on *:3005, webrtc.songz.dev");
});
