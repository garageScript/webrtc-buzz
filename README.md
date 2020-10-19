# Intro

Visit demo at [webrtc.buzz](https://webrtc.buzz)

# File Descriptions
* [`package.json`](https://github.com/garageScript/webrtc-buzz/blob/master/package.json) - app libraries
* [`index.js`](https://github.com/garageScript/webrtc-buzz/blob/master/index.js) - Server side code
* [`/public/index.html`](https://github.com/garageScript/webrtc-buzz/blob/master/public/index.html) - Client side index.html
* [`/public/app.js`](https://github.com/garageScript/webrtc-buzz/blob/master/public/app.js) - Client side main logic: Getting the webcam, starting the socket connections, starting the peer connections
* [`/public/helpers.js`](https://github.com/garageScript/webrtc-buzz/blob/master/public/helpers.js) - Client side peerConnection logic: setting local / remote descriptions, renegotiations on media stream changes, etc.
* [`/public/debugger.js`](https://github.com/garageScript/webrtc-buzz/blob/master/public/debugger.js) - Client side logging: Allows you to run `debug.start()` to see and filter out logs by user connections.
* [`/public/screenshare.js`](https://github.com/garageScript/webrtc-buzz/blob/master/public/screenshare.js) - Client side screenshare class object for screenshare interactions.

# Starting the app
* `node index.js` - Then visit your app at the specified port. 

# Basic knowledge
* If A and B needs to connect
  * A needs a peerConnection object
  * B needs a peerConnection object
  * These 2 peerConnection objects talk to each other.
* Negotiation - How do 2 peerConnection objects talk to each other?
  * Each peerConnection needs to set a localDescription and a remoteDescription. (If you are new, repeat this out loud a few times, its fundamental)
  * Example (A and B needs to talk to each other)
    * A creates a peerConnection object. Creates an offer and sets its peerConnection's localDescription to the offer. Sends the offer to B. 
      * Offer is just a string to represent who the client is, required to start a connection.
    * B gets the offer. B creates a peerConnection and sets its remoteDescription to the offer. Creates an answer (a string to represent who the client is based on the offer) and sets its peerConnection's localDescription to the answer. Sends the answer to A
      * Note B's peerConnection object is done because it has both a localDescription and a remoteDescription. 
    * A receives the answer, it sets its peerConnection's remoteDescription to the answer. Now A's peerConnection is also done
    * Both A's peerConnection and B's peerConnection is complete!
    * Right after localDescriptions are set, `iceCandidates` events starts firing. Send iceCandidates to the other person, who will add it to their peerConnection object. This helps establish the offer / answer connection.
      * iceCandidates is used to help establish connection between the 2 parties
      * iceCandidates events will fire **before** remote descriptions are set.
  * [socket.io](https://socket.io/) is used to send offer / answer between clients
* If you are video chatting with 4 other users, you will have 4 other peerConnections
* When realtime media changes, the 2 peerConnection objects will need to renegotiate (offer / answer exchange to set new local/remote descriptions)
