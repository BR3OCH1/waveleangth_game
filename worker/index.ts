/**
 * worker/index.ts
 *
 * Native Cloudflare Worker + Durable Object implementation of the
 * Wavelength game server. This replaces the PartyKit layer so we can
 * deploy directly to our own Cloudflare account via `wrangler deploy`.
 *
 * The game logic mirrors party/index.ts exactly — only the runtime
 * adapter changes (Cloudflare DO API instead of PartyKit API).
 */

import { ClientMessage, Concept, GameState, Player, ServerMessage, Team, GameMode } from "../lib/game-types";

// ─── Concept bank ─────────────────────────────────────────────────────────────
const CONCEPTS: Concept[] = [
    { left: "Cold", right: "Hot" },
    { left: "Slow", right: "Fast" },
    { left: "Ugly", right: "Beautiful" },
    { left: "Weak", right: "Powerful" },
    { left: "Boring", right: "Exciting" },
    { left: "Ancient", right: "Futuristic" },
    { left: "Silent", right: "Loud" },
    { left: "Dangerous", right: "Safe" },
    { left: "Cheap", right: "Expensive" },
    { left: "Sad", right: "Happy" },
    { left: "Simple", right: "Complex" },
    { left: "Natural", right: "Artificial" },
    { left: "Fictional", right: "Real" },
    { left: "Tiny", right: "Massive" },
];

function randomInt(min: number, max: number) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}
function pick<T>(arr: T[]): T {
    return arr[randomInt(0, arr.length - 1)];
}
function calcScore(dial: number, target: number): number {
    return Math.max(0, Math.round(100 - Math.abs(dial - target) * 2));
}
function defaultState(): GameState {
    return {
        gameMode: "coop",
        phase: "lobby",
        players: [],
        hostId: null,
        clueGiverId: null,
        activeTeam: null,
        teamScores: { cyan: 0, pink: 0 },
        coopScore: 0,
        clueGiverHistory: [],
        targetValue: 50,
        concept: null,
        clue: "",
        dialValue: 50,
        scoreThisRound: null
    };
}

// ─── Env bindings ─────────────────────────────────────────────────────────────
export interface Env {
    ROOMS: DurableObjectNamespace;
}

// ─── Main Worker — routes /party/:room over WebSocket to the DO ───────────────
export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        const url = new URL(request.url);

        // CORS preflight
        if (request.method === "OPTIONS") {
            return new Response(null, {
                headers: {
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Headers": "*",
                },
            });
        }

        // Extract room ID from any path format (/parties/main/ROOM, /party/ROOM, or /ROOM)
        const parts = url.pathname.split("/").filter(Boolean);
        if (parts.length === 0) {
            return new Response("Wavelength Game Server Live", { status: 200 });
        }

        const roomId = parts[parts.length - 1].toUpperCase();
        const id = env.ROOMS.idFromName(roomId);
        const stub = env.ROOMS.get(id);
        return stub.fetch(request);
    },
} satisfies ExportedHandler<Env>;

// ─── Durable Object — one instance per room ───────────────────────────────────
export class WavelengthRoom implements DurableObject {
    private state: GameState = defaultState();
    private nextId = 0;

    constructor(readonly ctx: DurableObjectState, readonly env: Env) {
        this.ctx.blockConcurrencyWhile(async () => {
            const storedState = await this.ctx.storage.get<GameState>("game_state");
            if (storedState) this.state = storedState;
            const storedNextId = await this.ctx.storage.get<number>("nextId");
            if (storedNextId) this.nextId = storedNextId;
        });
    }

    private saveState() {
        // Fire and forget storage writes
        this.ctx.storage.put("game_state", this.state);
        this.ctx.storage.put("nextId", this.nextId);
    }

    async fetch(request: Request): Promise<Response> {
        if (request.headers.get("Upgrade") !== "websocket") {
            return new Response("Expected WebSocket", { status: 426 });
        }

        const [client, server] = Object.values(new WebSocketPair()) as [WebSocket, WebSocket];
        const connId = `p_${++this.nextId}_${Date.now().toString(36)}`;

        this.ctx.acceptWebSocket(server);
        (server as any).serializeAttachment(connId);

        // Send init message (with this socket's server-assigned ID) + current game state
        server.send(JSON.stringify({ type: "init", id: connId }));
        server.send(this.snapshot());

        return new Response(null, { status: 101, webSocket: client });
    }

    // Cloudflare DO WebSocket lifecycle
    webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): void {
        const connId = (ws as any).deserializeAttachment() as string | null;
        if (!connId) return;
        try {
            const msg = JSON.parse(message as string) as ClientMessage;
            this.handleMessage(connId, msg, ws);
        } catch { /* ignore */ }
    }

    webSocketClose(ws: WebSocket): void {
        const connId = (ws as any).deserializeAttachment() as string | null;
        if (!connId) return;
        this.state.players = this.state.players.filter(p => p.id !== connId);
        this.updateHostId();
        if (this.state.clueGiverId === connId && this.state.phase !== "revealed") {
            this.state = { ...defaultState(), players: this.state.players, hostId: this.state.hostId };
        }
        this.saveState();
        this.broadcast(this.snapshot());
    }

    webSocketError(ws: WebSocket): void {
        this.webSocketClose(ws);
    }

    private updateHostId(): void {
        if (this.state.players.length > 0) {
            // Keep current host if still connected, otherwise promote first player
            const hostStillHere = this.state.players.some(p => p.id === this.state.hostId);
            if (!hostStillHere) {
                this.state.hostId = this.state.players[0].id;
            }
        } else {
            this.state.hostId = null;
        }
    }

    // ── Game command handlers ───────────────────────────────────────────────────
    private handleMessage(connId: string, msg: ClientMessage, ws: WebSocket): void {
        switch (msg.type) {
            case "join": {
                const existing = this.state.players.findIndex(p => p.id === connId);
                const player: Player = { id: connId, username: msg.username, team: null }; // default unassigned
                if (existing >= 0) {
                    // Preserve existing team if they are already in the array
                    player.team = this.state.players[existing].team;
                    this.state.players[existing] = player;
                }
                else { this.state.players.push(player); }
                this.updateHostId();
                break;
            }
            case "toggle_team": {
                if (this.state.phase !== "lobby") return;
                const existing = this.state.players.find(p => p.id === connId);
                if (existing) {
                    existing.team = msg.team;
                }
                break;
            }
            case "toggle_mode": {
                if (this.state.phase !== "lobby") return;
                if (connId !== this.state.hostId) return;
                this.state.gameMode = msg.mode;
                break;
            }
            case "start_game": {
                if (connId !== this.state.hostId) return;

                let startTeam: Team | null = null;
                let activePlayers = this.state.players;

                if (this.state.gameMode === "teams") {
                    const cyanPlayers = this.state.players.filter(p => p.team === "cyan");
                    const pinkPlayers = this.state.players.filter(p => p.team === "pink");
                    if (cyanPlayers.length < 1 || pinkPlayers.length < 1) return; // Need at least 1 player per team

                    startTeam = Math.random() < 0.5 ? "cyan" : "pink";
                    activePlayers = startTeam === "cyan" ? cyanPlayers : pinkPlayers;
                } else {
                    if (this.state.players.length < 2) return; // Need 2+ for coop
                }

                const clueGiver = pick(activePlayers);

                this.state = {
                    ...this.state,
                    phase: "writing_clue",
                    activeTeam: startTeam,
                    clueGiverId: clueGiver.id,
                    clueGiverHistory: [clueGiver.id],
                    teamScores: { cyan: 0, pink: 0 },
                    coopScore: 0,
                    targetValue: randomInt(5, 95),
                    concept: pick(CONCEPTS),
                    clue: "",
                    dialValue: 50,
                    scoreThisRound: null,
                };
                break;
            }
            case "submit_clue": {
                if (this.state.phase !== "writing_clue" || connId !== this.state.clueGiverId) return;
                this.state.clue = msg.clue.trim().slice(0, 40);
                this.state.phase = "guessing";
                break;
            }
            case "update_dial": {
                if (this.state.phase !== "guessing" || connId === this.state.clueGiverId) return;
                this.state.dialValue = Math.max(0, Math.min(100, Math.round(msg.value)));
                break;
            }
            case "lock_in": {
                if (this.state.phase !== "guessing" || connId === this.state.clueGiverId) return;

                if (this.state.gameMode === "teams") {
                    const lockingPlayer = this.state.players.find(p => p.id === connId);
                    if (lockingPlayer?.team !== this.state.activeTeam) return;
                }

                const score = calcScore(this.state.dialValue, this.state.targetValue);
                this.state.scoreThisRound = score;
                this.state.phase = "revealed";

                if (this.state.gameMode === "teams") {
                    if (this.state.activeTeam === "cyan") this.state.teamScores.cyan += score;
                    if (this.state.activeTeam === "pink") this.state.teamScores.pink += score;
                } else {
                    this.state.coopScore += score;
                }
                break;
            }
            case "play_again": {
                if (this.state.phase !== "revealed") return;
                if (connId !== this.state.hostId) return; // Host-only

                let nextTeam = this.state.activeTeam;
                let activePlayers = this.state.players;

                if (this.state.gameMode === "teams") {
                    nextTeam = this.state.activeTeam === "cyan" ? "pink" : "cyan";
                    activePlayers = this.state.players.filter(p => p.team === nextTeam);
                }

                // Round-robin clue giver selection
                let availableGivers = activePlayers.filter(p => !this.state.clueGiverHistory.includes(p.id));
                if (availableGivers.length === 0) {
                    if (this.state.gameMode === "teams") {
                        const otherTeamHistory = this.state.clueGiverHistory.filter(id => {
                            const p = this.state.players.find(x => x.id === id);
                            return p?.team !== nextTeam;
                        });
                        this.state.clueGiverHistory = otherTeamHistory;
                    } else {
                        this.state.clueGiverHistory = [];
                    }
                    availableGivers = activePlayers;
                }

                const nextGiver = pick(availableGivers);
                this.state.clueGiverHistory.push(nextGiver.id);

                this.state = {
                    ...this.state,
                    phase: "writing_clue",
                    activeTeam: nextTeam,
                    clueGiverId: nextGiver.id,
                    targetValue: randomInt(5, 95),
                    concept: pick(CONCEPTS),
                    clue: "",
                    dialValue: 50,
                    scoreThisRound: null,
                };
                break;
            }
            case "reset_game": {
                // Host can reset at any time
                if (connId !== this.state.hostId) return;
                this.state = { ...defaultState(), players: this.state.players, hostId: this.state.hostId };
                break;
            }
        }
        this.saveState();
        this.broadcast(this.snapshot());
    }

    private snapshot(): string {
        return JSON.stringify({ type: "game_state", state: this.state });
    }

    private broadcast(msg: string): void {
        const sockets = this.ctx.getWebSockets();
        for (const ws of sockets) {
            try { ws.send(msg); }
            catch { /* ignore */ }
        }
    }
}
