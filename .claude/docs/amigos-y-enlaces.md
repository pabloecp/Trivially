# Friends, usernames and the link filter

## Names and friends
- Accounts (not guests) have two names: the **game name** (`user.name`, free, not unique, shown in games) and the **@username** (`user.username`, unique, used to find friends and to sign in along with the email).
- `auth/username.js`: 3–20 chars of a-z, 0-9 and `_` with a letter; reserved words; ≤ `USERNAME_CHANGES` (3) changes per 30 days; old usernames reserved 30 days (`usernameHistory`). `ensureUsernames` at boot assigns missing ones (`usernameAuto`). REST: `PATCH /api/me/username`, `GET /api/username/check`; the client gets `usernameInfo`.
- `FriendsSheet.jsx`: tabs "Amigos", "Solicitudes", "Añadir".
- Invites: `InviteFriends.jsx` under the players while the room waits; socket `friend:invite` (friends online only, once per `INVITE_GAP_MS` 15 s) → `friend:invited` → `FriendInvite.jsx` (20 s, joins whatever the join mode).

## Link filter
`moderation/links.js` `hasLink` (tests `links.test.js`) finds addresses with a scheme, "www.", or a known ending (`TLDS`), also disguised ("algo . com", "algo[.]com", "algo punto com" for the `STRONG` ones). Names with a link are refused ("El nombre no puede llevar enlaces") in `validateName`, `/api/session`, `RoomManager.create`/`addPlayer` and `updatePlayer`; chat messages too ("No se pueden enviar enlaces en el chat").
