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

import type { GameState, Player, ClientMessage, Concept } from "../lib/game-types";

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
    return { phase: "lobby", players: [], clueGiverId: null, targetValue: 50, concept: null, clue: "", dialValue: 50, score: null };
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

        // Route: /party/:roomId  (mirrors PartyKit's URL scheme)
        const match = url.pathname.match(/^\/party\/([^/]+)$/);
        if (!match) {
            return new Response("Not found", { status: 404 });
        }

        const roomId = match[1].toUpperCase();
        const id = env.ROOMS.idFromName(roomId);
        const stub = env.ROOMS.get(id);
        return stub.fetch(request);
    },
} satisfies ExportedHandler<Env>;

// ─── Durable Object — one instance per room ───────────────────────────────────
export class WavelengthRoom implements DurableObject {
    private state: GameState = defaultState();
    private sessions: Map<string, WebSocket> = new Map();
    private nextId = 0;

    constructor(readonly ctx: DurableObjectState, readonly env: Env) { }

    async fetch(request: Request): Promise<Response> {
        if (request.headers.get("Upgrade") !== "websocket") {
            return new Response("Expected WebSocket", { status: 426 });
        }

        const [client, server] = Object.values(new WebSocketPair()) as [WebSocket, WebSocket];
        this.ctx.acceptWebSocket(server);

        const connId = String(++this.nextId);
        this.sessions.set(connId, server);
        (server as WebSocket & { _wlId?: string })._wlId = connId;

        // Send current state immediately on connect
        server.send(this.snapshot());

        return new Response(null, { status: 101, webSocket: client });
    }

    // Cloudflare DO WebSocket lifecycle
    webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): void {
        const connId = (ws as WebSocket & { _wlId?: string })._wlId;
        if (!connId) return;
        try {
            const msg = JSON.parse(message as string) as ClientMessage;
            this.handleMessage(connId, msg, ws);
        } catch { /* ignore */ }
    }

    webSocketClose(ws: WebSocket): void {
        const connId = (ws as WebSocket & { _wlId?: string })._wlId;
        if (!connId) return;
        this.sessions.delete(connId);
        this.state.players = this.state.players.filter(p => p.id !== connId);
        if (this.state.clueGiverId === connId && this.state.phase !== "revealed") {
            this.state = { ...defaultState(), players: this.state.players };
        }
        this.broadcast(this.snapshot());
    }

    webSocketError(ws: WebSocket): void {
        this.webSocketClose(ws);
    }

    // ── Game command handlers ───────────────────────────────────────────────────
    private handleMessage(connId: string, msg: ClientMessage, _ws: WebSocket): void {
        switch (msg.type) {
            case "join": {
                const existing = this.state.players.findIndex(p => p.id === connId);
                const player: Player = { id: connId, username: msg.username };
                if (existing >= 0) { this.state.players[existing] = player; }
                else { this.state.players.push(player); }
                break;
            }
            case "start_game": {
                if (this.state.players.length < 1) return;
                const clueGiver = pick(this.state.players);
                this.state = { ...this.state, phase: "writing_clue", clueGiverId: clueGiver.id, targetValue: randomInt(5, 95), concept: pick(CONCEPTS), clue: "", dialValue: 50, score: null };
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
                this.state.score = calcScore(this.state.dialValue, this.state.targetValue);
                this.state.phase = "revealed";
                break;
            }
            case "play_again": {
                if (this.state.phase !== "revealed") return;
                this.state = { ...defaultState(), players: this.state.players };
                break;
            }
        }
        this.broadcast(this.snapshot());
    }

    private snapshot(): string {
        return JSON.stringify({ type: "game_state", state: this.state });
    }

    private broadcast(msg: string): void {
        for (const [id, ws] of this.sessions) {
            try { ws.send(msg); }
            catch { this.sessions.delete(id); }
        }
    }
}
