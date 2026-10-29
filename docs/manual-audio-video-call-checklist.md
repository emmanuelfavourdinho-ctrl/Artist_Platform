# Audio and video call manual check

Use two separate browser profiles and two active accounts that share an open conversation. Serve the web app over HTTPS outside localhost so browsers allow media capture. Grant microphone and camera access when prompted.

1. Open the same conversation in both profiles. Start an audio call from one side; verify the other profile sees the caller and can accept or decline. Repeat with video.
2. Accept a video call. Verify remote audio is audible, remote video appears, the local preview is muted, and mute/camera controls affect only the local tracks. End from either side and verify both interfaces close and device indicators turn off.
3. Decline an incoming call, cancel a ringing outgoing call, and leave a call unanswered for 45 seconds. Verify the correct terminal message appears in the other profile.
4. Deny microphone access, disconnect the network while ringing, and disconnect it during a connected call. Verify actionable errors, reconnect feedback, and cleanup after the bounded reconnect period.
5. Try a user outside the conversation, a closed conversation, and two simultaneous call attempts. Verify the server refuses unauthorized, closed, and duplicate active calls.
6. Test from networks with restrictive NAT/firewall rules. Configure `WEBRTC_STUN_URLS` and `WEBRTC_TURN_URLS` on the API; when TURN is configured also set a Coturn-compatible `WEBRTC_TURN_SHARED_SECRET` of at least 32 characters. Confirm the browser receives only short-lived per-user TURN credentials, never the shared secret. Without TURN, confirm the UI warns that calls may fail on restrictive networks.

Call sessions live in API process memory and are not persisted. Run one API signaling process (or add a shared call-state/Socket.IO adapter before horizontal scaling). Calls do not create message or order records.
