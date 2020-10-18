const root = document.querySelector("#root");

const screenShares = [];
document.querySelector("#screenShareUrl").addEventListener("click", (e) => {
  screenShares.push(
    new Screenshare((stream) => {
      // Update existing viewers
      Object.values(viewerConnections).forEach((viewer) => {
        viewer.addStream(stream);
      });
    })
  );
  e.preventDefault();
  return false;
});

const socket = io(`https://realtime.songz.dev/${Helpers.getNameSpace()}`);

const sendBroadcast = () => {
  console.log("sending broadcast");
  socket.emit("broadcast", {
    eventName: "broadcastAvailable",
    data: {
      from: socket.id,
    },
  });
  setTimeout(sendBroadcast, 5000);
};

const viewerConnections = {};

const broadcasterConnections = {};

function Viewer(remoteSocketId, sdpInfo) {
  const stream = localVideo.srcObject;
  let isReady = false;

  Helpers.setupLogger(this, "Viewer");
  Helpers.setupPeerConnection(this);
  this.setupViewer(remoteSocketId, sdpInfo, {
    onsuccess: () => {
      isReady = true;
      stream.getTracks().forEach((track) => {
        this.pc.addTrack(track, stream);
      });
      screenShares.forEach((ss) => {
        const ssStream = ss.getStream();
        // not ready yet
        if (!ssStream) return;
        ssStream.getTracks().forEach((track) => {
          this.pc.addTrack(track, ssStream);
        });
      });
    },
  });

  this.addIceCandidate = (candidate) => {
    this.log("adding ice candidate");
    this.pc.addIceCandidate(new RTCIceCandidate(candidate));
  };

  this.remove = () => {
    try {
      this.pc.close();
    } catch (e) {
      this.errorLog(e);
    }
    delete viewerConnections[remoteSocketId];
  };

  this.addStream = (ssStream) => {
    ssStream.getTracks().forEach((track) => {
      this.pc.addTrack(track, ssStream);
    });
  };
}

function Stream(stream) {
  const videoContainer = document.createElement("div");
  videoContainer.classList.add("videoContainer");

  const video = document.createElement("video");
  videoContainer.append(video);
  videoContainer.onclick = () => {
    if (videoContainer.classList.contains("selectedVideo")) {
      return videoContainer.classList.remove("selectedVideo");
    }
    Object.values(broadcasterConnections).forEach((wc) => wc.unselect());
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

function Broadcaster(remoteSocketId) {
  Helpers.setupLogger(this, "Broadcaster");
  Helpers.setupPeerConnection(this);
  this.setupBroadcaster(remoteSocketId);

  let streams = {};
  this.pc.ontrack = (event) => {
    this.log("track received");
    event.streams.forEach((stream) => {
      if (streams[stream.id]) {
        return;
      }
      streams[stream.id] = new Stream(stream);
    });
    this.log("event.streams.length", event.streams.length);
  };

  this.setRemoteDescription = (sdpInfo) => {
    this.log("sdpInfo Received, local and remote peer config complete");
    this.pc.setRemoteDescription(sdpInfo);
  };

  this.addIceCandidate = (candidate) => {
    this.log("adding ice candidate");
    this.pc.addIceCandidate(new RTCIceCandidate(candidate));
  };
  this.unselect = () => {
    Object.values(streams).forEach((s) => s.unselect());
  };
  this.remove = () => {
    this.log("Removing broadcaster");
    try {
      Object.values(streams).forEach((s) => s.remove());
      this.pc.close();
    } catch (e) {
      this.errorLog(e);
    }
    delete broadcasterConnections[remoteSocketId];
  };
}

const localVideo = document.querySelector("#broadcastVideo");
navigator.mediaDevices
  .getUserMedia({ video: true, audio: true })
  .then((stream) => {
    localVideo.srcObject = stream;
    sendBroadcast();
  })
  .catch((error) => console.error(error));

socket.on("connectionAnswer", ({ from, sdpInfo }) => {
  console.log("connectionAnswer from: ", from);
  broadcasterConnections[from].setRemoteDescription(sdpInfo);
});

socket.on("broadcastAvailable", ({ from }) => {
  // already established, so ignore the event
  if (!from || broadcasterConnections[from]) {
    return;
  }
  console.log("Broadcast Available event... creating a broadcaster");
  broadcasterConnections[from] = new Broadcaster(from);
});

socket.on("sdpInfo", ({ from, sdpInfo }) => {
  if (!from) return;
  console.log("a viewer wants my broadcast! creating a Viewer Peer", from);
  viewerConnections[from] = new Viewer(from, sdpInfo);
});

socket.on("iceCandidate", ({ from, candidate, eventDestination }) => {
  if (eventDestination === "broadcaster") {
    broadcasterConnections[from].addIceCandidate(candidate);
  } else {
    viewerConnections[from].addIceCandidate(candidate);
  }
});

socket.on("connectionDestroyed", ({ socketId }) => {
  console.log(`${socketId} left the room. Cleaning up`);
  if (broadcasterConnections[socketId]) {
    broadcasterConnections[socketId].remove();
  }
  if (viewerConnections[socketId]) {
    viewerConnections[socketId].remove();
  }
});
