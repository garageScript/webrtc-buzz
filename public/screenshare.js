const screenshareRoot = document.querySelector(".screenshareRoot");

function Screenshare(cb) {
  let isReady = false;
  const localVideo = document.createElement("video");
  navigator.mediaDevices.getDisplayMedia({ video: true }).then((stream) => {
    localVideo.srcObject = stream;
    localVideo.setAttribute("autoplay", true);
    screenshareRoot.append(localVideo);
    isReady = true;
    cb(stream);
  });

  this.getStream = () => {
    if (!isReady) return;
    return localVideo.srcObject;
  };
}
