# Gateway WebSocket authentication

The gateway uses the same handshake authentication for `/ws/lessons` and `/ws/chat`. The browser supplies the `playsay` subprotocol and its bearer credential in the requested protocol list. An allowed origin and a valid token with a nonblank subject are required before the connection can be upgraded. The selected response protocol is `playsay`; the credential is never selected or echoed as a protocol.

An unapproved or missing origin, absent `playsay` protocol, missing or invalid credential, or blank token subject rejects the handshake with HTTP 403 and does not open a WebSocket. A successfully authenticated chat connection is still subject to the existing role and conversation access rules.
