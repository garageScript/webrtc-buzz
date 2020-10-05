const root = document.querySelector("#root");

const lowerCasePath = window.location.pathname.toLowerCase().split("/");

const getNameSpace = () => {
  const pathName = lowerCasePath
    .filter((e) => e.trim() && e !== "screenshare")
    .join("_");
  const hostName = window.location.hostname.split(".").join("_").toLowerCase();
  return `${hostName}_${pathName}`;
};

const getScreenshareUrl = () => {
  let screenSharePath = `/${lowerCasePath.filter((e) => e !== "")}/screenshare`;

  // in the event that there is no room name
  if (screenSharePath === "//screenshare") screenSharePath = "/screenshare";
  return screenSharePath;
};

document
  .querySelector("#screenShareUrl")
  .setAttribute("href", getScreenshareUrl());

const socket = io(`https://realtime.songz.dev/${getNameSpace()}`);

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

  Helpers.setupLogger(this, "Viewer");
  Helpers.setupPeerConnection(this);
  this.setupViewer(remoteSocketId, sdpInfo, {
    onsuccess: () => {
      stream.getTracks().forEach((track) => {
        this.pc.addTrack(track, stream);
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
}

function Broadcaster(remoteSocketId) {
  Helpers.setupLogger(this, "Broadcaster");
  Helpers.setupPeerConnection(this);
  this.setupBroadcaster(remoteSocketId);

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
  video.setAttribute("autoplay", "true");

  this.pc.ontrack = (event) => {
    this.log("track received");
    video.srcObject = event.streams[0];
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
    videoContainer.classList.remove("selectedVideo");
  };
  this.remove = () => {
    try {
      videoContainer.remove();
      this.pc.close();
    } catch (e) {
      this.errorLog(e);
    }
    delete broadcasterConnections[remoteSocketId];
  };
  root.append(videoContainer);
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
