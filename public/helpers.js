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

function Peer(remoteSocketId, sdpInfo) {
  const log = (msg) => {
    debug.log(`Peer-${msg}`, remoteSocketId);
  };
  const errLog = (msg) => {
    debug.log(`PeerERROR-${msg}`, remoteSocketId);
  };
  const peerConnection = new RTCPeerConnection(peerConfig);

  const signalOnMessageHandler = (e) => {
    log(`Signaling message handler`);
    return wait(0)
      .then(() => {
        const msg = JSON.parse(e.data);
        if (msg.sdp) {
          const desc = new RTCSessionDescription(JSON.parse(e.data).sdp);
          if (desc.type == "offer") {
            log(
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
              .catch(errLog);
          } else {
            log(
              `PC:signaling: sdp message is not an offer - setting remote description`
            );
            peerConnection.setRemoteDescription(desc).catch(errLog);
          }
        }
      })
      .catch(errLog);
  };

  let isLive = false;
  const startSendingMedia = () => {
    isLive = true;

    log(
      "setupViewer SUCCESS! - adding video/audio streams and screenshare streams to peer connection"
    );
    const stream = localVideo.srcObject;
    stream.getTracks().forEach((track) => {
      peerConnection.addTrack(track, stream);
    });
    screenShares.forEach((ss) => {
      const ssStream = ss.getStream();
      // not ready yet
      if (!ssStream) return;
      ssStream.getTracks().forEach((track) => {
        peerConnection.addTrack(track, ssStream);
      });
    });
  };

  let isInitiator = true;
  // Used for sending renegotiation data
  let signaling;
  if (sdpInfo) {
    log(
      `new Peer - not initiator, so setting remote description based on sdp, creating answer and setting the answer as local description and send answer oversocket. Peer has local and remote!`
    );
    isInitiator = false;
    peerConnection
      .setRemoteDescription(sdpInfo)
      .then(() => peerConnection.createAnswer())
      .then((sdp) => peerConnection.setLocalDescription(sdp))
      .then(() => {
        // Not exactly live yet, live is when the other peer has finished setting up remote description
        // But its close enough, hopefully it doesn't cause issues
        return socket.emit("direct", {
          socketId: remoteSocketId,
          eventName: "connectionAnswer",
          data: {
            from: socket.id,
            sdpInfo: peerConnection.localDescription,
          },
        });
      });
    peerConnection.ondatachannel = (e) => {
      log("PC:ondatachannel event, signaling is open, isLive = true");
      if (!signaling) {
        signaling = e.channel;
        signaling.onmessage = signalOnMessageHandler;
        log(
          "PC:ondatachannel - no signaling, so setting signaling to channel and onmessagehandler"
        );
      }
      startSendingMedia();
    };
  } else {
    log(
      `new Peer - initiator, so create offer, set local description, and send sdp information over socket. Initiator creates the signaling!`
    );
    peerConnection
      .createOffer()
      .then((d) => peerConnection.setLocalDescription(d))
      .then(() => {
        return socket.emit("direct", {
          eventName: "sdpInfo",
          socketId: remoteSocketId,
          data: {
            sdpInfo: peerConnection.localDescription,
            from: socket.id,
          },
        });
      })
      .catch(errLog);
    // setting up signaling - Only done by the Initiator
    signaling = peerConnection.createDataChannel("signaling");
    signaling.onmessage = signalOnMessageHandler;
    signaling.onopen = () => {
      log("PC:signaling is open, isLive = true");
      startSendingMedia();
    };
  }

  /* About ice candidates:
   * ICE candidates start firing from a peer as soon as the peer's setLocalDescription's success callback has completed, which means your signaling channel - provided it preserves order - looks like this: offer, candidate, candidate, candidate, one way, and answer, candidate, candidate, candidate the other. Basically, if you see a candidate, add it!
   */
  peerConnection.onicecandidate = (event) => {
    if (!event.candidate) {
      log("PC:onicecandidate - no candidate, ignoring event");
      return;
    }
    log("PC:onicecandidate - sending candidate");
    return socket.emit("direct", {
      socketId: remoteSocketId,
      eventName: "iceCandidate",
      data: {
        from: socket.id,
        candidate: event.candidate,
      },
    });
  };

  this.completeConnection = (newSdpInfo) => {
    log("sdpInfo Received, local and remote peer config complete");
    peerConnection.setRemoteDescription(newSdpInfo);
  };

  this.addIceCandidate = (candidate) => {
    peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
  };

  let streams = {};
  peerConnection.ontrack = (event) => {
    log(`PCEvent:ontrack - ${event.streams.length} streams`);
    event.streams.forEach((stream) => {
      if (streams[stream.id]) {
        return;
      }
      log(`Creating a new stream object`);
      streams[stream.id] = new Stream(stream);
    });
  };

  /* Renegotiation
   * Renegotiation is needed when realtime media streams changes (ie new screenshare is created)
   * We use our handy dataChannel to renegotiate!
   */
  let negotiating; // Chrome workaround
  peerConnection.onnegotiationneeded = () => {
    if (negotiating) return;
    log(
      "PC:negotiations needed - creating offer and setting localDescription to offer, then sending offer as sdp over peerConnection signal data channel"
    );
    negotiating = true;
    peerConnection
      .createOffer()
      .then((d) => peerConnection.setLocalDescription(d))
      .then(() => {
        log("PC - finished setting LocalDescription and sending signal");
        return (
          isLive &&
          signaling.send(
            JSON.stringify({ sdp: peerConnection.localDescription })
          )
        );
      })
      .catch(errLog);
  };
  peerConnection.onsignalingstatechange = () => {
    negotiating = peerConnection.signalingState != "stable";
    log(
      `signaling State: ${peerConnection.signalingState}, resulting negotiating state is ${negotiating}`
    );
  };

  this.addStream = (ssStream) => {
    log("adding new stream");
    ssStream.getTracks().forEach((track) => {
      peerConnection.addTrack(track, ssStream);
    });
  };

  this.unselect = () => {
    Object.values(streams).forEach((s) => s.unselect());
  };

  this.remove = () => {
    log(
      "removing all streams, removing broadcaster object, and closing peer connection"
    );
    try {
      Object.values(streams).forEach((s) => s.remove());
      peerConnection.close();
    } catch (e) {
      errLog(e);
    }
    delete allPeers[remoteSocketId];
  };
}
