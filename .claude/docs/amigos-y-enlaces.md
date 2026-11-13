# Friends, usernames and the link filter

## Names and friends
- Accounts (not guests) have two names: the **game name** (`user.name`, free, not unique, shown in games) and the **@username** (`user.username`, unique, used to find friends and to sign in along with the email).
- `auth/username.js`: 3–20 chars of a-z, 0-9 and `_` with a letter; reserved words; ≤ `USERNAME_CHANGES` (3) changes per 30 days; old usernames reserved 30 days (`usernameHistory`). `ensureUsernames` at boot assigns missing ones (`usernameAuto`). REST: `PATCH /api/me/username`, `GET /api/username/check`; the client gets `usernameInfo`.
- `FriendsSheet.jsx` (in `Modal`, like every panel): "Tu usuario" box with a copy button, tabs "Amigos" and "Solicitudes", and on "Amigos" an always-visible "Añadir un amigo" box (search by @username) over the friends, "En línea" first and then "Desconectados". `FriendsGuestSheet.jsx` is the same window for guests.
- Friends join **groups**, not matches (`grupos.md`): `friend:join` by the group's join mode ("abierta" straight in, "solicitud" asks the leader: `group:answerJoin`, "invitacion" only by invite; the leader sets it in `FriendsRoomControls`, `group:joinMode`). A friend playing alone in a match shows where they are but has nothing to join (`room.group` false). A friend with no group and no match can be asked anyway: the server makes them a group (they lead it) and the request waits there (`friend:groupMade`).
- Invites: `InviteFriends.jsx` in "Tu grupo"; socket `friend:invite` (needs a group; friends online only, once per `INVITE_GAP_MS` 15 s) → `friend:invited` with the group's code → `FriendInvite.jsx` (20 s, joins whatever the join mode).

## Link filter
`moderation/links.js` `hasLink` (tests `links.test.js`) finds addresses with a scheme, "www.", or a known ending (`TLDS`), also disguised ("algo . com", "algo[.]com", "algo punto com" for the `STRONG` ones). Names with a link are refused ("El nombre no puede llevar enlaces") in `validateName`, `/api/session`, `RoomManager.create`/`addPlayer` and `updatePlayer`; chat messages too ("No se pueden enviar enlaces en el chat").
