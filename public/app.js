const peerConfig = {
  iceServers: [
    {
      urls: [
        "stun:stun.l.google.com:19302",
        "turn:webrtc.songz.dev:3478?transport=udp",
        "turn:webrtc.songz.dev:3478?transport=tcp",
      ],
    },
  ],
};

const rootElement = document.querySelector("#root");

navigator.mediaDevices
  .getUserMedia({ video: true, audio: true })
  .then((stream) => {
    const localVideo = document.getElementById("local-video");
    if (localVideo) {
      localVideo.srcObject = stream;
    }
    socket.emit("broadcast", {
      eventName: "webrtc-start-app",
      data: {
        from: socket.id,
      },
    });
  });

const socket = io("https://realtime.songz.dev/webrtc_songz_dev");
socket.on("connectionCreated", ({ socketId }) => {
  allSockets[socketId] = new User(socketId);
});

const peerConnections = {};
socket.on("watcher", ({ from }) => {
  const peerConnection = new RTCPeerConnection(config);
  const id = from;
  peerConnections[id] = peerConnection;

  let stream = video.srcObject;
  stream.getTracks().forEach((track) => peerConnection.addTrack(track, stream));

  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit("candidate", id, event.candidate);
    }
  };

  peerConnection
    .createOffer()
    .then((sdp) => peerConnection.setLocalDescription(sdp))
    .then(() => {
      socket.emit("offer", id, peerConnection.localDescription);
    });
});

socket.on("answer", (id, description) => {
  peerConnections[id].setRemoteDescription(description);
});

socket.on("candidate", (id, candidate) => {
  peerConnections[id].addIceCandidate(new RTCIceCandidate(candidate));
});

window.onunload = window.onbeforeunload = () => {
  socket.close();
};

/*
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

const allSockets = {};
socket.on("connect", () => {});

socket.on("offerCreated", async ({ from, offer }) => {
  console.log("received offer start", from);
  const peerConnection = new RTCPeerConnection(peerConfig);

  await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(new RTCSessionDescription(answer));

  socket.emit("direct", {
    eventName: "answerCreated",
    data: {
      from: socket.id,
      answer,
    },
  });
});

socket.on("answerCreated", ({ from, answer }) => {
  allSockets[from].setupAnswer(answer);
});

socket.on("candidateCreated", ({ from, answer }) => {
  allSockets[from].setupAnswer(answer);
});
*/
