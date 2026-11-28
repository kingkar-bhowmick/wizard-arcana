# Wizard Arcana

A trick-taking card game about predicting exactly how many tricks you’ll win. Play online with friends, share one device, or practice against bots. Choose Classic for the full progression or Quick for six rounds. All modes support optional plus/minus bidding.

- [Learn how to play](docs/how-to-play.md)
- [Find your way around the codebase](docs/architecture.md)
- [Repository guidance for contributors and coding agents](../AGENTS.md)

## Install and open in VS Code

1. Install Git, VS Code, and Node.js with npm. The app declares Node.js 20 or newer. Use Node.js 24 LTS for a new setup. [Node.js downloads](https://nodejs.org/en/download/), [VS Code downloads](https://code.visualstudio.com/download), [Git downloads](https://git-scm.com/downloads)
2. If you already have the repository on your machine, open that copy. Otherwise, clone it from a terminal.

   ```sh
   git clone https://github.com/kingkar-bhowmick/wizard-arcana.git
   cd wizard-arcana
   ```

3. In VS Code, choose **File → Open Folder** and select the repository folder that contains `AGENTS.md`. You can also run `code .` from that folder if the VS Code command is on your PATH.
4. Choose **Terminal → New Terminal** in VS Code and run the commands below. Run npm commands from the inner `wizard-arcana/` folder, which contains `package.json`, `package-lock.json`, and `vite.config.ts`. If you opened that inner folder directly, skip the `cd wizard-arcana` line. [VS Code integrated terminal](https://code.visualstudio.com/docs/terminal/basics)

   ```sh
   node --version
   npm --version
   cd wizard-arcana
   npm ci
   ```

Run `npm ci` again after pulling a change to `package-lock.json`. It installs the locked dependencies. [npm ci reference](https://docs.npmjs.com/cli/npm-ci/)

## Start the game locally

```sh
npm run build
npm start
```

Open [http://localhost:3000](http://localhost:3000). The build writes the browser app to `dist/client/`. Express serves those files and runs online rooms on the same port. Keep the terminal open while playing. Press **Ctrl+C** in the terminal to stop the server. After changing frontend code, run `npm run build` again and refresh the browser.

To check that the server is listening, open [http://localhost:3000/health](http://localhost:3000/health) in a browser or run:

```sh
curl http://localhost:3000/health
```

The response includes `ok: true`, the online room count, and a `persistent` flag indicating whether Redis is configured.

### Develop with live frontend updates

Open two terminals in VS Code. Both should be in the inner app folder.

| Terminal | Command | What it runs |
| --- | --- | --- |
| 1 | `npm run dev:server` | Express and Socket.IO on port 3000 |
| 2 | `npm run dev:client` | Vite, usually on port 5173 |

Open the URL printed by Vite, usually [http://localhost:5173](http://localhost:5173). Vite reloads frontend edits and forwards online-room traffic to the server on port 3000. Restart terminal 1 after editing the server. If you already started the game with `npm start`, stop that process before starting `dev:server` on the same port.

### Run the checks

```sh
npm test
npm run typecheck
npm run build
```

With `npm start` running, open a second terminal in the app folder and run the online smoke test:

```sh
node tests/smoke.mjs
```

The smoke test creates a room, checks hand privacy and reconnects a seat, completes a Quick match, and starts a rematch.

### Local settings

The default port is 3000. Redis is optional. Either set `PORT` and `REDIS_URL` in your shell or use an explicit env-file launch. For the env-file approach, copy `.env.example` to `.env` in the app folder and edit it. Remove the `REDIS_URL` line unless you have a running Redis instance. Build the client first, then run:

```sh
node --env-file=.env --import tsx server/index.ts
```

The normal `npm start` command reads the shell environment. Use the default port for the two-terminal development setup because the Vite proxy targets port 3000.

## Play and resume

- **Solo practice** seats you with two to five bots. Quick is the default.
- **Pass & play** supports three to six people on one device. Give the device to the named player before revealing the next hand. Each local mode keeps its own save in that browser. Local play works without a live server after the page has loaded.
- **Online multiplayer** uses a private six-character room code or invite link. The host chooses the format and starts when three to six players are connected. Reloading the same tab restores its seat. An active match reserves disconnected players’ seats until they return.

The sound toggle is at the top of the app. Your preference is stored in the browser. Browsers allow audio after you interact with the page.

## Deploy to Render

Use a **Node Web Service** so Express can serve the game and keep WebSocket connections open for online rooms. Render builds from a GitHub branch. Commit your intended changes in VS Code’s **Source Control** view, then push the branch you want Render to deploy. For `main`, run:

```sh
git status
git push origin main
```

### Create or update a Web Service manually

1. In Render, choose **New → Web Service**, connect GitHub, and select the repository. For an existing service, open its **Settings** instead.
2. Set the following fields. Render runs the build and start commands from the configured root directory. [Render Web Service setup](https://render.com/docs/your-first-deploy), [Render root directory settings](https://render.com/docs/monorepo-support)

| Setting | Value |
| --- | --- |
| Runtime | Node |
| Branch | `main` or the branch you pushed |
| Root directory | `wizard-arcana` |
| Build command | `npm ci && npm run build` |
| Start command | `npm start` |
| Health check | `/health` |

Set the environment variable `NODE_VERSION` to `24` to match the suggested local major version. Render supplies `PORT` automatically. Create the service or save the changes, then watch the build and startup logs. [Render Node.js versions](https://render.com/docs/node-version), [Render environment variables](https://render.com/docs/environment-variables)

### Use the repository Blueprint

For a fresh Blueprint-managed deploy, use **New → Blueprint**, connect the repository and branch, and select the top-level `render.yaml` as the Blueprint path. The file defines the Web Service, commands, and health check. It currently pins Node.js 20. Set `NODE_VERSION` in that file to `"24"` before pushing if you want the Blueprint to use the same major version as this guide. If the Blueprint form asks for a Redis URL and you want an in-memory deployment, use the manual Web Service setup and leave `REDIS_URL` unset. [Render Blueprint setup](https://render.com/docs/infrastructure-as-code), [Render Blueprint environment variables](https://render.com/docs/blueprint-spec#prompting-for-secret-values)

### Verify and update the deployment

Open the deployed service URL and append `/health` to check the server. Open the game in three separate tabs or browser profiles, create a room, and join from the other two with the invite link. The deployed URL lets players on other devices reach the same server.

For updates, push to the service’s linked branch. With auto-deploy enabled, changes under `wizard-arcana/` trigger a new deploy. If auto-deploy is off, start one from the service’s **Manual Deploy** menu. Check the logs and `/health` after it finishes. [Render monorepo deploy behavior](https://render.com/docs/monorepo-support)

### Keep rooms across restarts

Without `REDIS_URL`, online rooms live in memory and clear when the app restarts. To restore rooms after an app restart, set `REDIS_URL` in the Render service’s **Environment** settings to a Redis-compatible connection URL. For Render Key Value in the same workspace and region, use its internal connection URL. Check `/health` for `persistent: true` after deployment. Choose a durable data-store plan if rooms also need to survive a data-store restart. Room snapshots expire three days after their last update. Solo and pass-and-play saves live in each player’s browser. [Render Key Value connections and persistence](https://render.com/docs/key-value)

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| `npm` is missing | Install Node.js, reopen VS Code, and run `node --version` and `npm --version`. |
| `Missing script: "build"` or `ENOENT` for `package.json` | Open a terminal in the inner `wizard-arcana/` folder and rerun the command. |
| `vite: not found` while building | Run `npm ci` in the app folder. If the build environment explicitly sets `NODE_ENV=production`, use `npm ci --include=dev && npm run build` so npm installs Vite. |
| Browser says `Run npm run build` | Build from the app folder, then start Express from that same folder. |
| `EADDRINUSE` on port 3000 | Stop the other server first. Keep only one copy of `npm start` or `npm run dev:server` on that port. |
| Vite loads, but online rooms keep reconnecting | Confirm `http://localhost:3000/health` responds and keep both development terminals open. |
| Render builds, but the game is unavailable | Check the deployed branch, root directory, and start command, then look for server errors in the Render logs. |
