const localVideo = document.querySelector("#localVideo");

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

const startApp = async () => {
  const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
  localVideo.srcObject = stream;
  localVideo.setAttribute("autoplay", true);
  sendBroadcast();
};
document.querySelector("#shareScreen").onclick = () => {
  startApp();
};
