const root = document.querySelector("#root");

const socket = io("https://realtime.songz.dev/webrtc_songz_dev");

const peerConnections = {};

function Stream(remoteSocketId) {
  const peerConnection = new RTCPeerConnection({
    iceServers: [
      {
        urls: ["stun:stun.l.google.com:19302"],
      },
    ],
  });

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
      });
  };
}

socket.on("broadcastAvailable", ({ from }) => {
  const connection = peerConnections[from];
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
  peerConnections[from] = new Stream(from);
});

socket.on("sdpInfo", ({ from, sdpInfo }) => {
  const stream = peerConnections[from];
  stream.setRemoteSDP(sdpInfo);
});
