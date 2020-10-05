const root = document.querySelector("#root");
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const errorLog = console.error;

const createPeerConnection = () => {
  return new RTCPeerConnection({
    iceServers: [
      {
        urls: ["stun:stun.l.google.com:19302"],
      },
    ],
  });
};

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

function Viewer(remoteSocketId, sdpInfo) {
  const { log, error } = createLogger("Viewer");
  const peerConnection = createPeerConnection();
  const stream = localVideo.srcObject;
  this.pc = peerConnection;

  this.runStream = () => {};

  peerConnection
    .setRemoteDescription(sdpInfo)
    .then(() => peerConnection.createAnswer())
    .then((sdp) => peerConnection.setLocalDescription(sdp))
    .then(() => {
      return socket.emit("direct", {
        socketId: remoteSocketId,
        eventName: "connectionAnswer",
        data: {
          from: socket.id,
          sdpInfo: peerConnection.localDescription,
        },
      });
    });

  let negotiating; // Chrome workaround
  peerConnection.onnegotiationneeded = () => {
    log("negotiations needed", negotiating);
    if (negotiating) return;
    negotiating = true;
    peerConnection
      .createOffer()
      .then((d) => peerConnection.setLocalDescription(d))
      .then(
        () =>
          live &&
          signaling.send(
            JSON.stringify({ sdp: peerConnection.localDescription })
          )
      )
      .catch(errorLog);
  };
  peerConnection.onsignalingstatechange = () => {
    negotiating = peerConnection.signalingState != "stable";
    log(
      `signaling State: ${peerConnection.signalingState}, resulting negotiating state is`,
      negotiating
    );
  };

  let live = false;
  peerConnection.onicecandidate = (event) => {
    log("onicecandidate");
    if (!event.candidate) return;
    return socket.emit("direct", {
      socketId: remoteSocketId,
      eventName: "iceCandidate",
      data: {
        eventDestination: "broadcaster",
        from: socket.id,
        candidate: event.candidate,
      },
    });
  };

  let signaling;
  peerConnection.ondatachannel = (e) => {
    log("live, setting signaling and sending track");
    if (!signaling) {
      signaling = e.channel;
      bindSignaling(signaling, peerConnection, log);
    }
    live = true;
    stream.getTracks().forEach((track) => {
      peerConnection.addTrack(track, stream);
    });
  };

  peerConnection.onclose = () => {
    log("Connection closed");
    this.remove();
    delete viewerConnections[remoteSocketId];
  };

  this.addTrack = () => {};

  this.addIceCandidate = (candidate) => {
    console.log("adding ice candidate");
    peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
  };

  this.remove = () => {
    peerConnection.close();
  };
}

const broadcasterConnections = {};

const bindSignaling = (sc, pc, log) => {
  sc.onmessage = (e) =>
    wait(0)
      .then(() => {
        const msg = JSON.parse(e.data);
        log(`signaling: message received`);
        if (msg.sdp) {
          log(`signaling: sdp`);
          var desc = new RTCSessionDescription(JSON.parse(e.data).sdp);
          if (desc.type == "offer") {
            pc.setRemoteDescription(desc)
              .then(() => pc.createAnswer())
              .then((answer) => pc.setLocalDescription(answer))
              .then(() => {
                sc.send(JSON.stringify({ sdp: pc.localDescription }));
              })
              .catch(errorLog);
          } else {
            pc.setRemoteDescription(desc).catch(errorLog);
          }
        } else if (msg.candidate) {
          log(`signaling: candidate`);
          pc.addIceCandidate(new RTCIceCandidate(msg.candidate)).catch(
            errorLog
          );
        }
      })
      .catch(errorLog);
  return sc;
};

const createLogger = (label) => {
  return {
    log: (...data) => {
      console.log(label, ...data);
    },
    error: (...data) => {
      console.error(label, ...data);
    },
  };
};

function Broadcaster(remoteSocketId) {
  const { log, error } = createLogger("BROADCASTER");
  let live = false;
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

  const peerConnection = createPeerConnection();
  this.pc = peerConnection;
  const signaling = peerConnection.createDataChannel("signaling");
  bindSignaling(signaling, peerConnection, log);
  signaling.onopen = () => {
    log("signaling open, went live");
    live = true;
  };

  let negotiating; // Chrome workaround
  peerConnection.onnegotiationneeded = () => {
    if (negotiating) return;
    negotiating = true;
    peerConnection
      .createOffer()
      .then((d) => peerConnection.setLocalDescription(d))
      .then(
        () =>
          live &&
          signaling.send(
            JSON.stringify({ sdp: peerConnection.localDescription })
          )
      )
      .catch(errorLog);
  };
  peerConnection.onsignalingstatechange = () => {
    negotiating = peerConnection.signalingState != "stable";
    log(
      `signaling State: ${peerConnection.signalingState}, resulting negotiating state is`,
      negotiating
    );
  };

  peerConnection.onicecandidate = (event) => {
    log("signaling onicecandidate");
    if (!live) {
      if (!event.candidate) {
        log("sending SDP Info");
        socket.emit("direct", {
          eventName: "sdpInfo",
          socketId: remoteSocketId,
          data: {
            sdpInfo: peerConnection.localDescription,
            from: socket.id,
          },
        });
      }
      return;
    }
    if (!event.candidate) {
      return error("not live an no candidate, should not happen");
    }
    log("---sending signaling info---");
    signaling.send(JSON.stringify({ candidate: event.candidate }));
  };

  peerConnection.ontrack = (event) => {
    console.log("track received");
    console.log("track received");
    console.log("track received");
    console.log("track received");
    console.log("track received");
    console.log("track received");
    console.log("track received");
    console.log("track received");
    console.log("track received");
    console.log("track received");
    console.log("track received");
    console.log("track received");
    console.log("track received");
    console.log("track received");
    video.srcObject = event.streams[0];
    console.log("event.streams.length", event.streams.length);
  };

  peerConnection.onopen = () => {
    console.log("connection is live!");
    console.log("connection is live!");
    console.log("connection is live!");
    live = true;
    console.log("connection is live!");
  };

  peerConnection.onclose = () => {
    log("Connection closed");
    this.remove();
    delete broadcasterConnections[remoteSocketId];
  };

  this.setRemoteDescription = (sdpInfo) => {
    log("sdpInfo Received, local and remote peer config complete");
    peerConnection.setRemoteDescription(sdpInfo);
  };

  this.addIceCandidate = (candidate) => {
    console.log("adding ice candidate");
    peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
  };
  this.unselect = () => {
    videoContainer.classList.remove("selectedVideo");
  };
  this.remove = () => {
    videoContainer.remove();
    peerConnection.close();
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
  if (broadcasterConnections[from]) {
    return;
  }
  console.log("Broadcast Available event... creating a broadcaster");
  broadcasterConnections[from] = new Broadcaster(from);
});

socket.on("sdpInfo", ({ from, sdpInfo }) => {
  console.log("a viewer wants my broadcast! creating a Viewer Peer", from);
  viewerConnections[from] = new Viewer(from, sdpInfo);
});

socket.on("iceCandidate", ({ from, candidate, eventDestination }) => {
  if (eventDestination === "broadCaster") {
    viewerConnections[from].addIceCandidate(candidate);
  } else {
    broadcasterConnections[from].addIceCandidate(candidate);
  }
});

socket.on("connectionDestroyed", ({ socketId }) => {
  console.log(`${socketId} left the room`);
  if (broadcasterConnections[socketId]) {
    broadcasterConnections[socketId].remove();
    delete broadcasterConnections[socketId];
  }
  if (viewerConnections[socketId]) {
    viewerConnections[socketId].remove();
    delete viewerConnections[socketId];
  }
});
