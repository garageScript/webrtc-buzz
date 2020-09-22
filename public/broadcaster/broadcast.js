const root = document.querySelector("#root");

const socket = io("https://realtime.songz.dev/webrtc_songz_dev");

const sendBroadcast = () => {
  console.log("sending broadcast");
  socket.emit("broadcast", {
    eventName: "broadcastAvailable",
    data: {
      from: socket.id,
    },
  });
  setTimeout(sendBroadcast, 2000);
};
sendBroadcast();

const peerConnections = {};

function PeerConnection(remoteSocketId) {
  const peerConnection = new RTCPeerConnection({
    iceServers: [
      {
        urls: ["stun:stun.l.google.com:19302"],
      },
    ],
  });

  const stream = localVideo.srcObject;
  stream.getTracks().forEach((track) => {
    peerConnection.addTrack(track, stream);
  });

  this.addNewStream = (newStream) => {
    peerConnection.addStream(newStream);
  };

  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      console.log("sending candidate info", event.candidate);
      socket.emit("direct", {
        eventName: "broadcasterIceCandidate",
        socketId: remoteSocketId,
        data: {
          candidate: event.candidate,
          from: socket.id,
        },
      });
    }
  };

  peerConnection
    .createOffer()
    .then((sdp) => {
      return peerConnection.setLocalDescription(sdp);
    })
    .then(() => {
      socket.emit("direct", {
        eventName: "sdpInfo",
        socketId: remoteSocketId,
        data: {
          sdpInfo: peerConnection.localDescription,
          from: socket.id,
        },
      });
    });
  this.setRemoteDescription = (sdpInfo) => {
    peerConnection.setRemoteDescription(sdpInfo);
    console.log(
      "local and remote descriptions have been set. We are awesome now"
    );
  };
  this.addIceCandidate = (candidate) => {
    console.log("adding ice candidate");
    peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
  };
}

socket.on("getBroadcast", ({ from }) => {
  console.log("a watcher wants my broadcast!", from);
  peerConnections[from] = new PeerConnection(from);
});

socket.on("connectionAnswer", ({ from, sdpInfo }) => {
  console.log("a watcher send me their remote description", from, sdpInfo);
  peerConnections[from].setRemoteDescription(sdpInfo);
});

socket.on("watcherIceCandidate", ({ from, candidate }) => {
  const connection = peerConnections[from];
  connection.addIceCandidate(candidate);
});

const localVideo = document.querySelector("#broadcastVideo");
navigator.mediaDevices
  .getUserMedia({ video: true, audio: true })
  .then((stream) => {
    localVideo.srcObject = stream;
  })
  .catch((error) => console.error(error));

const watcherConnections = {};

function Stream(remoteSocketId) {
  const video = document.createElement("video");
  video.setAttribute("autoplay", "true");
  const peerConnection = new RTCPeerConnection({
    iceServers: [
      {
        urls: ["stun:stun.l.google.com:19302"],
      },
    ],
  });

  peerConnection.onicecandidate = (event) => {
    console.log("ice candidate", event.candidate);
    if (event.candidate) {
      console.log("sending candidate info", event.candidate);
      socket.emit("direct", {
        eventName: "watcherIceCandidate",
        socketId: remoteSocketId,
        data: {
          candidate: event.candidate,
          from: socket.id,
        },
      });
    }
  };

  peerConnection.ontrack = (event) => {
    console.log("event track");
    console.log("event track");
    console.log("event track");
    console.log("event track");
    console.log("event track");
    console.log("event track");
    console.log("event track");
    console.log("event track");
    console.log("event track");
    console.log("event track");
    console.log("event track");
    video.srcObject = event.streams[0];
    console.log("event.streams.length", event.streams.length);
  };

  this.setRemoteSDP = (sdpInfo) => {
    console.log("setting remote Info", sdpInfo);
    peerConnection
      .setRemoteDescription(sdpInfo)
      .then(() => peerConnection.createAnswer())
      .then((sdp) => peerConnection.setLocalDescription(sdp))
      .then(() => {
        console.log("remote description is set");
        socket.emit("direct", {
          socketId: remoteSocketId,
          eventName: "connectionAnswer",
          data: {
            from: socket.id,
            sdpInfo: peerConnection.localDescription,
          },
        });
        root.append(video);
      });
  };
  this.addIceCandidate = (candidate) => {
    console.log("adding ice candidate");
    peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
  };
}

socket.on("broadcastAvailable", ({ from }) => {
  const connection = watcherConnections[from];
  if (connection) {
    // already established, so ignore this
    return;
  }
  console.log("got a boardcast available event from: ", from);
  socket.emit("direct", {
    socketId: from,
    eventName: "getBroadcast",
    data: {
      from: socket.id,
    },
  });
  watcherConnections[from] = new Stream(from);
});

socket.on("sdpInfo", ({ from, sdpInfo }) => {
  const stream = watcherConnections[from];
  stream.setRemoteSDP(sdpInfo);
});

socket.on("broadcasterIceCandidate", ({ from, candidate }) => {
  const stream = watcherConnections[from];
  stream.addIceCandidate(candidate);
});

document.querySelector("#shareScreenButton").onclick = async () => {
  const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
  const screen = document.createElement("video");
  const body = document.querySelector("body");
  screen.srcObject = stream;
  screen.setAttribute("id", "screenVideo");
  screen.setAttribute("autoplay", true);
  body.append(screen);

  Object.values(peerConnections).forEach((pc) => {
    pc.addNewStream(stream);
  });
};
