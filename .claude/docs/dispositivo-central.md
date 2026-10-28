# Central device (the room's shared screen)

A room can be played with a **central device** (a TV, a laptop) showing the match while players answer from their phones. Not a setting: the room is in that mode while one is connected.

- **Server:** `room.central` (`{ userId, name, avatar, isGuest, socketId, connected }`) and `room.centralRequests`. It's no player: `socketToRoom` marks it `central: true` and `requireRoom` in `sockets.js` refuses everything it sends.
- Its column shows the group's code (a group's private match) to join from a phone: "Entra a trivially y únete con este código". Opening the group's link with an account already in the group (`offerRoom`, `grupos.md`) goes the same way as opening the room.
- Three ways in: from a player's menu (`makeCentral`, `room:makeCentral`, lobby only; if it's the host's seat, the host role passes first); the host's account opening the room on another device (`joinAsCentral`); another player asking (`requestCentral`, one per 5 s) and the host answering (`answerCentralRequest`). `setCentral` replaces it; `releaseCentral` turns it back into a player or removes it. A dropped one comes back within `RECONNECT_GRACE_MS` (`reattachCentral`).
- `rooms.onRoleChange` → `room:role` tells a connection what it became. Joining the same room with the same account (`assertAccountFree`, `sameRoom`) opens `CentralOffer.jsx`; the host sees requests in `CentralRequests.jsx`. Tests `realtime/centralDevice.test.js`.
- **Client:** `isCentral` (per tab, `trivially_room_role`). `useView(room)` in `lib/store.jsx` returns `"central"` (shows everything, controls nothing, `viewerId` null), `"controller"` (a phone beside it: only the ways to answer) or `"full"`.
- The central device shows the round, clock, question, options and scoreboard, sized to fit a 720p laptop; phones get `ControllerBar`, `GetReady` and the answer controls. Encuentra el país's phones keep the map. Only the central device plays the song and the match sounds (`RoomSounds`).
- Pieces in `CentralBits.jsx`, `CentralLobby.jsx`, `CentralSpot.jsx`; styles `styles/central.css`.
