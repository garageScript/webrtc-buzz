# Unreleased

# 1.1.0 - Oct 18, 2020
* Fix - media stream error
* Sending logs to server when no problem was reported
* Removes unused files
* Reduced the number of peerconnections! Instead of having 2 peer connections (one outgoing and one incoming), we now use 1 peerconnection to handle both streams (outgoing and incoming).
* Debugger - Easier way to debug logs, run debug.start() or debug.end() in the console.
* Ability to save logs to identify hard to fix bugs.


