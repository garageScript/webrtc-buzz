const peerConfig = {
  iceServers: [
    {
      urls: ["stun:stun.l.google.com:19302", "stun:stun.stunprotocol.org:3478"],
    },
    {
      urls: [
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

Helpers.getNameSpace = () => {
  const lowerCasePath = window.location.pathname.toLowerCase().split("/");

  const pathName = lowerCasePath
    .filter((e) => e.trim() && e !== "screenshare")
    .join("_");
  const hostName = window.location.hostname.split(".").join("_").toLowerCase();
  return `${hostName}_${pathName}`;
};

Helpers.setupLogger = (obj, label, remoteSocketId) => {
  obj.log = (...data) => {
    debug.log(`${label} ${data[0]}`, remoteSocketId);
  };
  obj.errorLog = (...data) => {
    console.error(label, ...data);
  };
};

Helpers.setupPeerConnection = (parent) => {
  let isLive = false;
  let signaling;
  const peerConnection = new RTCPeerConnection(peerConfig);

  const signalOnMessageHandler = (e) => {
    return wait(0)
      .then(() => {
        const msg = JSON.parse(e.data);
        if (msg.sdp) {
          const desc = new RTCSessionDescription(JSON.parse(e.data).sdp);
          if (desc.type == "offer") {
            parent.log(
              `PC:signaling: sdp message is an offer - setting remote description, creating answer, then setting localDescription to answer`
            );
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
            parent.log(
              `PC:signaling: sdp message is not an offer - setting remote description`
            );
            peerConnection.setRemoteDescription(desc).catch(parent.errorLog);
          }
        }
      })
      .catch(parent.errorLog);
  };

  peerConnection.onclose = () => {
    parent.log("PC:Connection closed");
    parent.remove();
  };

  let negotiating; // Chrome workaround
  peerConnection.onnegotiationneeded = () => {
    if (negotiating) return;
    parent.log(
      "PC:negotiations needed - creating offer and setting localDescription to offer, then sending offer as sdp over peerConnection signal data channel"
    );
    negotiating = true;
    peerConnection
      .createOffer()
      .then((d) => peerConnection.setLocalDescription(d))
      .then(() => {
        parent.log("PC - finished setting LocalDescription and sending signal");
        return (
          isLive &&
          signaling.send(
            JSON.stringify({ sdp: peerConnection.localDescription })
          )
        );
      })
      .catch(parent.errorLog);
  };
  peerConnection.onsignalingstatechange = () => {
    negotiating = peerConnection.signalingState != "stable";
    parent.log(
      `signaling State: ${peerConnection.signalingState}, resulting negotiating state is ${negotiating}`
    );
  };

  parent.pc = peerConnection;

  parent.setupViewer = (remoteSocketId, sdpInfo, { onsuccess }) => {
    peerConnection
      .setRemoteDescription(sdpInfo)
      .then(() => peerConnection.createAnswer())
      .then((sdp) => peerConnection.setLocalDescription(sdp))
      .then(() => {
        parent.log(
          `setRemoteDescription with sdp info, created answer, setLocalDescription with answer and sending answer over socket`
        );
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
      if (!event.candidate) {
        parent.log("PC:onicecandidate - no candidate, ignoring event");
        return;
      }
      parent.log("PC:onicecandidate - sending candidate");
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
      if (!signaling) {
        signaling = e.channel;
        signaling.onmessage = signalOnMessageHandler;
        parent.log(
          "PC:ondatachannel - no signaling, so setting signaling to channel and onmessagehandler"
        );
      }
      isLive = true;
      onsuccess();
    };
  };

  parent.setupBroadcaster = (remoteSocketId) => {
    signaling = peerConnection.createDataChannel("signaling");
    parent.log("creating signaling data channel");
    signaling.onmessage = signalOnMessageHandler;

    signaling.onopen = () => {
      parent.log("PC:signaling is open, isLive = true");
      isLive = true;
    };

    let sentSdp = false;
    peerConnection.onicecandidate = (event) => {
      if (!sentSdp) {
        sentSdp = true;
        parent.log(
          "PC:iceCandidateEvent - have not sent sdp, so sending SDP Info"
        );
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
        parent.log(
          "PC:iceCandidateEvent - already sent sdp info, there is no event candidate so not doing anything"
        );
        return parent.errorLog("not live an no candidate, should not happen");
      }
      parent.log("PC:iceCandidateEvent - sending signaling info");
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
