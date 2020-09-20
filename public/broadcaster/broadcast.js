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

function PeerConnection(from) {
  const peerConnection = new RTCPeerConnection({
    iceServers: [
      {
        urls: ["stun:stun.l.google.com:19302"],
      },
    ],
  });

  peerConnection.onicecandidate = (event) => {
    console.log("ice candidate", event);
    if (event.candidate) {
      console.log("there is event ice candidate");
      socket.emit("direct", {
        eventName: "iceCandidate",
        socketId: from,
        data: {
          candidate: event.candidate,
        },
      });
    }
  };
  peerConnection
    .createOffer()
    .then((sdp) => {
      console.log("wtf is sdp", sdp);
      return peerConnection.setLocalDescription(sdp);
    })
    .then(() => {
      console.log(
        "sending my localDescription",
        peerConnection.localDescription
      );
      socket.emit("direct", {
        eventName: "sdpInfo",
        socketId: from,
        data: {
          sdpInfo: peerConnection.localDescription,
          from: socket.id,
        },
      });
    });
}

socket.on("getBroadcast", ({ from }) => {
  console.log("a watcher wants my broadcast!", from);
  peerConnections[from] = new PeerConnection(from);
});
