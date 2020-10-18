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
  debug.log("sending broadcast to tell everyone I have video!");
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

  Helpers.setupLogger(this, "Viewer", remoteSocketId);
  Helpers.setupPeerConnection(this);
  this.log("setting up viewer");

  this.setupViewer(remoteSocketId, sdpInfo, {
    onsuccess: () => {
      this.log(
        "setupViewer SUCCESS! - adding video/audio streams and screenshare streams to peer connection"
      );
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
    this.pc.addIceCandidate(new RTCIceCandidate(candidate));
  };

  this.remove = () => {
    this.log("closing peer connection and deleting viewConnection object");
    try {
      this.pc.close();
    } catch (e) {
      this.errorLog(e);
    }
    delete viewerConnections[remoteSocketId];
  };

  this.addStream = (ssStream) => {
    this.log("adding new stream");
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
  Helpers.setupLogger(this, "Broadcaster", remoteSocketId);
  Helpers.setupPeerConnection(this);
  this.setupBroadcaster(remoteSocketId);
  this.log("setting up broadcaster");

  let streams = {};
  this.pc.ontrack = (event) => {
    this.log(`PCEvent:ontrack - ${event.streams.length} streams`);
    event.streams.forEach((stream) => {
      if (streams[stream.id]) {
        return;
      }
      this.log(`Creating a new stream object`);
      streams[stream.id] = new Stream(stream);
    });
  };

  this.setRemoteDescription = (sdpInfo) => {
    this.log("setting remote description for peer connection based on sdpInfo");
    this.pc.setRemoteDescription(sdpInfo);
  };

  this.addIceCandidate = (candidate) => {
    this.pc.addIceCandidate(new RTCIceCandidate(candidate));
  };
  this.unselect = () => {
    Object.values(streams).forEach((s) => s.unselect());
  };
  this.remove = () => {
    this.log(
      "removing all streams, removing broadcaster object, and closing peer connection"
    );
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
    debug.log("retrieved webcam & mic");
    sendBroadcast();
  })
  .catch((error) => console.error(error));

socket.on("connectionAnswer", ({ from, sdpInfo }) => {
  debug.log(`ReceivedSocketEvent - ConnectionAnswer`, from);
  broadcasterConnections[from].setRemoteDescription(sdpInfo);
});

socket.on("broadcastAvailable", ({ from }) => {
  // already established, so ignore the event
  if (!from || broadcasterConnections[from]) {
    return;
  }
  debug.log(
    "ReceivedSocketEvent - broadcastAvailable and creating a broadcaster object",
    from
  );
  broadcasterConnections[from] = new Broadcaster(from);
});

socket.on("sdpInfo", ({ from, sdpInfo }) => {
  if (!from) return;
  debug.log("ReceivedSocketEvent - sdpInfo", from);
  viewerConnections[from] = new Viewer(from, sdpInfo);
});

socket.on("iceCandidate", ({ from, candidate, eventDestination }) => {
  if (eventDestination === "broadcaster") {
    debug.log(
      "ReceivedSocketEvent - iceCandidate from broadcaster and adding ice candidate to peer connection",
      from
    );
    broadcasterConnections[from].addIceCandidate(candidate);
  } else {
    debug.log(
      "ReceivedSocketEvent - iceCandidate from viewer and adding ice candidate to peer connection",
      from
    );
    viewerConnections[from].addIceCandidate(candidate);
  }
});

socket.on("connectionDestroyed", ({ socketId }) => {
  debug.log(`ReceivedSocketEvent - connectionDestroyed`, socketId);
  if (broadcasterConnections[socketId]) {
    broadcasterConnections[socketId].remove();
  }
  if (viewerConnections[socketId]) {
    viewerConnections[socketId].remove();
  }
});
