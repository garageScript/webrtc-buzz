const peerConfig = {
  iceServers: [
    {
      urls: [
        "stun:stun.l.google.com:19302",
        "turn:webrtc.songz.dev:3478?transport=udp",
        "turn:webrtc.songz.dev:3478?transport=tcp",
      ],
      username: "c0d3_student",
      credential: "c0d3s_really_hard",
    },
  ],
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const Helpers = {};

Helpers.wait = wait;

Helpers.setupLogger = (obj, label) => {
  obj.log = (...data) => {
    console.log(label, ...data);
  };
  obj.errorLog = (...data) => {
    console.error(label, ...data);
  };
};

Helpers.setupPeerConnection = (parent) => {
  let isLive = false;
  let signaling;
  const peerConnection = new RTCPeerConnection({
    iceServers: [
      {
        urls: ["stun:stun.l.google.com:19302"],
      },
    ],
  });

  const signalOnMessageHandler = (e) => {
    return wait(0)
      .then(() => {
        const msg = JSON.parse(e.data);
        parent.log(`signaling: message received`);
        if (msg.sdp) {
          parent.log(`signaling: sdp`);
          var desc = new RTCSessionDescription(JSON.parse(e.data).sdp);
          if (desc.type == "offer") {
            peerConnection
              .setRemoteDescription(desc)
              .then(() => peerConnection.createAnswer())
              .then((answer) => peerConnection.setLocalDescription(answer))
              .then(() => {
                signaling.send(
                  JSON.stringify({ sdp: peerConnection.localDescription })
                );
              })
              .catch(parent.errorLog);
          } else {
            peerConnection.setRemoteDescription(desc).catch(parent.errorLog);
          }
        }
      })
      .catch(parent.errorLog);
  };

  peerConnection.onclose = () => {
    parent.log("Connection closed");
    parent.remove();
  };

  let negotiating; // Chrome workaround
  peerConnection.onnegotiationneeded = () => {
    parent.log("negotiations needed", negotiating);
    if (negotiating) return;
    negotiating = true;
    peerConnection
      .createOffer()
      .then((d) => peerConnection.setLocalDescription(d))
      .then(
        () =>
          isLive &&
          signaling.send(
            JSON.stringify({ sdp: peerConnection.localDescription })
          )
      )
      .catch(parent.errorLog);
  };
  peerConnection.onsignalingstatechange = () => {
    negotiating = peerConnection.signalingState != "stable";
    parent.log(
      `signaling State: ${peerConnection.signalingState}, resulting negotiating state is`,
      negotiating
    );
  };

  parent.pc = peerConnection;

  parent.setupViewer = (remoteSocketId, sdpInfo, { onsuccess }) => {
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

    peerConnection.onicecandidate = (event) => {
      parent.log("onicecandidate");
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

    peerConnection.ondatachannel = (e) => {
      parent.log("live, setting signaling and sending track");
      if (!signaling) {
        signaling = e.channel;
        signaling.onmessage = signalOnMessageHandler;
      }
      isLive = true;
      onsuccess();
    };
  };

  parent.setupBroadcaster = (remoteSocketId) => {
    signaling = peerConnection.createDataChannel("signaling");
    signaling.onmessage = signalOnMessageHandler;

    signaling.onopen = () => {
      parent.log("signaling open, went live");
      isLive = true;
    };

    let sentSdp = false;
    peerConnection.onicecandidate = (event) => {
      parent.log("onicecandidate");
      if (!sentSdp) {
        sentSdp = true;
        parent.log("sending SDP Info");
        return socket.emit("direct", {
          eventName: "sdpInfo",
          socketId: remoteSocketId,
          data: {
            sdpInfo: peerConnection.localDescription,
            from: socket.id,
          },
        });
      }
      if (!event.candidate) {
        return parent.errorLog("not live an no candidate, should not happen");
      }
      parent.log("---sending signaling info---");
      return socket.emit("direct", {
        socketId: remoteSocketId,
        eventName: "iceCandidate",
        data: {
          eventDestination: "viewer",
          from: socket.id,
          candidate: event.candidate,
        },
      });
    };
  };
};
