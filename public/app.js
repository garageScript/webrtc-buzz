const root = document.querySelector("#root");
const reportProblem = document.querySelector("#reportProblem");
reportProblem.onclick = () => {
  const problem = prompt(
    "Sorry to hear about your issue. Briefly describe what problem you see, then press enter."
  );
  debug.sendLog(problem);
};

const screenShares = [];
document.querySelector("#screenShareUrl").addEventListener("click", (e) => {
  screenShares.push(
    new Screenshare((stream) => {
      // Update existing viewers
      Object.values(allPeers).forEach((peer) => {
        peer.addStream(stream);
      });
    })
  );
  e.preventDefault();
  return false;
});

const socket = io(`https://realtime.songz.dev/${Helpers.getNameSpace()}`);

const sendBroadcast = () => {
  debug.log("sending broadcast to tell everyone I have video!");
  socket.emit("broadcast", {
    eventName: "broadcastAvailable",
    data: {
      from: socket.id,
    },
  });
  setTimeout(sendBroadcast, 5000);
};

function Stream(stream) {
  const videoContainer = document.createElement("div");
  videoContainer.classList.add("videoContainer");

  const video = document.createElement("video");
  videoContainer.append(video);
  videoContainer.onclick = () => {
    if (videoContainer.classList.contains("selectedVideo")) {
      return videoContainer.classList.remove("selectedVideo");
    }
    Object.values(allPeers).forEach((wc) => wc.unselect());
    videoContainer.classList.add("selectedVideo");
  };
  video.srcObject = stream;
  video.setAttribute("autoplay", "true");
  root.append(videoContainer);
  this.remove = () => {
    videoContainer.remove();
  };
  this.unselect = () => {
    videoContainer.classList.remove("selectedVideo");
  };
}

const allPeers = {};

const startApp = () => {
  sendBroadcast();
  socket.on("connectionAnswer", ({ from, sdpInfo }) => {
    debug.log(`ReceivedSocketEvent - ConnectionAnswer`, from);
    allPeers[from].completeConnection(sdpInfo);
  });

  socket.on("broadcastAvailable", ({ from }) => {
    // already established, so ignore the event
    if (!from || allPeers[from]) {
      return;
    }
    debug.log(
      "ReceivedSocketEvent - broadcastAvailable and creating a broadcaster object",
      from
    );
    allPeers[from] = new Peer(from);
  });

  socket.on("sdpInfo", ({ from, sdpInfo }) => {
    if (!from || allPeers[from]) {
      debug.log(
        `WIERD state if ${from} is truthy - this is a request to estiablish a new peer connection, so how did a peer connection with the requestor already exist?`
      );

      return;
    }

    allPeers[from] = new Peer(from, sdpInfo);
  });

  socket.on("iceCandidate", ({ from, candidate, eventDestination }) => {
    debug.log(
      "ReceivedSocketEvent - iceCandidate adding ice candidate to peer connection",
      from
    );
    allPeers[from].addIceCandidate(candidate);
  });

  socket.on("connectionDestroyed", ({ socketId }) => {
    debug.log(`ReceivedSocketEvent - connectionDestroyed for ${socketId}`);
    if (allPeers[socketId]) {
      allPeers[socketId].remove();
    }
  });

  socket.on("sendDebugger", ({ fileName }) => {
    debug.sendLogData(fileName);
  });
};

let sendingBroadcast = false;
const localVideo = document.querySelector("#broadcastVideo");
navigator.mediaDevices
  .getUserMedia({ video: true, audio: true })
  .then((stream) => {
    localVideo.srcObject = stream;
    debug.log("retrieved webcam & mic");
    // Fire broadcast event only when we are sure there are playable video / audio
    localVideo.addEventListener("canplay", () => {
      debug.log("Video can be played now");
      sendingBroadcast = true;
      startApp();
    });
    setTimeout(() => {
      // TODO: figure out what causes this intermittent issue
      if (!sendingBroadcast) {
        alert("problem playing your mediastream, refreshing the page...");
        window.location.reload();
      }
    }, 3000);
  })
  .catch((error) => console.error(error));
