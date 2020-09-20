const root = document.querySelector("#root");

const socket = io("https://realtime.songz.dev/webrtc_songz_dev");

const peerConnections = {};

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

socket.on("broadcasterIceCandidate", ({ from, candidate }) => {
  const stream = peerConnections[from];
  stream.addIceCandidate(candidate);
});
