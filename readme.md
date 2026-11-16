# Digital Company Virtual Office

Operational cockpit of the Digital Company Hermes fleet: a read-only office
map where the 11 agents walk to the room matching their live Hermes Kanban
status, plus John's Control Center, Piccolo's FinOps, Bulma's compliance view
and an activity/ITSM timeline. No LLM calls.

Originally a fork of SkyOffice. `master` and the tag
`skyoffice-vanilla-baseline` keep the vanilla code. The multiplayer, WebRTC,
chat, whiteboard and login parts were removed on the `digital-company` branch.

## Production: Hermes Dashboard plugin

The Office is the **Office** tab of the Hermes Dashboard
(`http://127.0.0.1:9119/digital-company`):

| Path | Contents |
|---|---|
| `hermes-plugin/digital-company/` | `plugin.yaml`, a no-op `__init__.py` and `dashboard/` |
| `dashboard/plugin_api.py` | Thin read-only data API at `/api/plugins/digital-company/`, behind the Dashboard's auth |
| `client/src/plugin` | Frontend bundle (`yarn build:plugin`): React from the Dashboard SDK, Phaser bundled |
| `shared/digital-company` | Pure, tested logic used in the browser and by the dev server |

Install or update it from the `digital-company` repo with
`bootstrap\install-office-plugin.ps1`, or with `-FromCi` to use the CI-built
bundle.

## Development

**Runtime:** Node.js 26 LTS on the workstation (`.nvmrc`; `engines` accepts
22–26, both tested in CI) and Yarn 1.22.22 (`npm install -g yarn@1.22.22`).

```powershell
yarn install --frozen-lockfile
cd client; yarn install --frozen-lockfile; cd ..
yarn test                # server, shared and plugin data-source tests
yarn start               # dev API (read-only Hermes adapter) on 127.0.0.1:2567
cd client; yarn dev      # same Office view on http://127.0.0.1:5173
```

Plugin backend tests: `pip install -r hermes-plugin/requirements-dev.txt` and
then `pytest hermes-plugin/tests`. Set `HERMES_SRC` to a Hermes checkout to
also run the contract test.

| Variable | Default | Purpose |
|---|---|---|
| `HERMES_EXE` | `%LOCALAPPDATA%\hermes\hermes-agent\venv\Scripts\hermes.exe`, then `bin\hermes.exe`, then PATH | Hermes CLI used by the dev adapter (`.exe` only) |
| `HOST` / `PORT` | `127.0.0.1` / `2567` | Dev API bind address |
| `DC_ALLOWED_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` | CORS allowlist |
| `DC_DASHBOARD_TOKEN_FILE` | set by `ops\start-company.ps1` | Dashboard session token file (FinOps and activity in dev mode) |
| `DC_COMPANY_ROOT` | sibling `digital-company` repo | Project Memory for the compliance and ITSM views |

---

# SkyOffice ![License](https://img.shields.io/badge/license-MIT-blue) ![PRs Welcome](https://img.shields.io/badge/PRs-welcome-green.svg)

<img alt="Logo" align="right" src="https://user-images.githubusercontent.com/11501902/139942585-a6b044ce-3695-460a-91bd-dd9f1d4611c8.png" width="20%" />

An immersive virtual office - Winner of [2021 Monte Jade Innovation Competition](https://www.montejadese.org/innovation-competition)

- Come try it out - [Official Website](https://skyoffice.netlify.app)
- Why we built this - [Concept Video](https://www.youtube.com/watch?v=BpDqGTPh8pc)
- 🙌 Get latest updates? Follow our [Twitter](https://twitter.com/SkyOfficeApp).
- 💕 Love this project? Consider [buy me a coffee](https://www.buymeacoffee.com/skyoffice).

SkyOffice works on all PC browsers (mobile browsers are currently not supported)

## Built with

- [Phaser3](https://github.com/photonstorm/phaser) - Game engine
- [Colyseus](https://github.com/colyseus/colyseus) - WebSocket-based server framework
- [React/Redux](https://github.com/facebook/react) - Front-end framework
- [PeerJS](https://github.com/peers/peerjs) - WebRTC for video/screen sharing
- [TypeScript](https://github.com/microsoft/TypeScript) and [ES6](https://github.com/eslint/eslint) - for both client and server sides

## Features

- [Proximity Chat](#proximity-chat-distance-based-interactive-system)
- [Flexible Screen Sharing](#flexible--immediate-screen-sharing)
- [Multifunctional Rooms](#multifunctional-rooms)
- [Text Message Chat](#text-message-chat-with-real-time-dialog-bubbles)
- [Custom/Private Rooms](#customprivate-rooms)
- [Embedded Whiteboards](#embedded-whiteboards) (iframe embed of [WBO](https://github.com/lovasoa/whitebophir))

### Proximity Chat (distance-based interactive system)

![image](https://user-images.githubusercontent.com/11501902/139960852-cf0e0883-8fbe-459d-bb11-3707d0ae1360.png)

### Multifunctional Rooms

![image](https://user-images.githubusercontent.com/11501902/139961091-1801bd4d-fbd6-4400-8503-85ece744e979.png)

### Flexible & Immediate Screen Sharing

![image](https://user-images.githubusercontent.com/11501902/139961155-44a85cd9-ac25-4563-9d82-6537ed7435f6.png)

### Text Message Chat (with real time dialog bubbles)

![image](https://user-images.githubusercontent.com/11501902/145925423-3b5b9026-d3b9-429d-920b-98b0bcd6300a.png)

### Embedded Whiteboards

![image](https://user-images.githubusercontent.com/11501902/147785323-19dbf0e6-056d-44c5-8efe-e969297bbe52.png)

### Custom/Private Rooms

![image](https://user-images.githubusercontent.com/11501902/147784118-15ef50bf-0f67-4704-89d7-81b2fa7f8ceb.png)

## Controls

- `W, A, S, D, or arrow keys` to move (video chat will start if you are close to someone else)
- `E` to sit down
- `R` to use computer (for screen sharing)
- `Enter` to open chat
- `ESC` to close chat

## Prerequisites

You'll need [Node.js](https://nodejs.org/en/), [npm](https://www.npmjs.com/) installed.

## Getting Started

Clone this repository to your local machine:

```bash
git clone https://github.com/kevinshen56714/SkyOffice.git
```

This will create a folder named `SkyOffice`. You can specify a different folder name like this:

```bash
git clone https://github.com/kevinshen56714/SkyOffice.git my-folder-name
```

To start a server, go into the project folder and install dependencies/run start command:

```bash
cd SkyOffice or 'my-folder-name'
yarn && yarn start
```

To start a client, go into the client folder and install dependencies/run start command:

```bash
cd SkyOffice/client or 'my-folder-name/client'
yarn && yarn dev
```

## Credits 🎉

Big thanks to this great repo - [ourcade/phaser3-typescript-parcel-template](https://github.com/ourcade/phaser3-typescript-parcel-template)

Big thanks to pixel artist - [LimeZu](https://limezu.itch.io/)

Big thanks to open-source whiteboard project - [WBO](https://github.com/lovasoa/whitebophir)

## License

This project is licensed under MIT.

If you're using SkyOffice to power your virtual office or using our code in other projects, please consider [buy me a coffee](https://www.buymeacoffee.com/skyoffice). Thank you :)
