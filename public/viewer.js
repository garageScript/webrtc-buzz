const peerConfig = {
  iceServers: [
    {
      urls: ["stun:stun.l.google.com:19302"],
    },
  ],
};

function User(socketId) {
  const container = document.createElement("div");
  container.innerHTML = `
    <h2>${socketId}</h2>
    <video></video>
  `;
  const $video = container.querySelector("video");

  const peerConnection = new RTCPeerConnection(peerConfig);

  const startConnection = async () => {
    localStream
      .getTracks()
      .forEach((track) => peerConnection.addTrack(track, localStream));

    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit("direct", {
          socketId,
          data: { candidate: event.candidate, from: socket.id },
          eventName: "candidateCreated",
        });
      }
    };
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(new RTCSessionDescription(offer));

    socket.emit("direct", {
      socketId,
      data: { offer, from: socket.id },
      eventName: "offerCreated",
    });

    peerConnection.ontrack = ({ streams: [stream] }) => {
      console.log("received remote video");
      $video.srcObject = stream;
    };
  };
  startConnection();

  this.setupAnswer = async (answer) => {
    await peerConnection.setRemoteDescription(
      new RTCSessionDescription(answer)
    );
  };
}

const socket = io("https://realtime.songz.dev/webrtc_songz_dev");
socket.on("connectionCreated", ({ socketId }) => {});

socket.on("webrtc-start-app", ({ from, answer }) => {
  console.log("from", from);
  const peerConnection = new RTCPeerConnection(peerConfig);

  await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
  const answer = await peerConnection.createAnswer();
});

const allStreams = {}

socket.on("webrtc-start-app", ({from}) => {
  if (allStreams[from]) {
    return
  }
  socket.emit("direct",{
    socketId: from,
    data: {
      from: socket.id
    }
  });
});
