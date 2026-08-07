"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import PartySocket from "partysocket";
import type { GameState, ServerMessage, ClientMessage, Concept, Player } from "@/lib/game-types";
import Dial from "@/components/Dial";

// ─── Helpers ─────────────────────────────────────────────────────────────────
const AVATAR_COLORS = [
    "#8b5cf6", "#22d3ee", "#ec4899", "#f59e0b", "#10b981", "#3b82f6",
];

function getAvatarColor(id: string) {
    let hash = 0;
    for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function scoreTier(score: number): string {
    if (score >= 95) return "🎯 Perfect!";
    if (score >= 80) return "🔥 Hot!";
    if (score >= 60) return "👍 Close!";
    if (score >= 40) return "😬 Getting there…";
    return "❌ Miss!";
}

function scoreTierColor(score: number): string {
    if (score >= 95) return "#fbbf24";
    if (score >= 80) return "#f97316";
    if (score >= 60) return "#4ade80";
    if (score >= 40) return "#94a3b8";
    return "#f87171";
}

type ConnectionStatus = "connecting" | "connected" | "error";
const STATUS_LABELS: Record<ConnectionStatus, string> = {
    connecting: "Connecting…",
    connected: "Connected",
    error: "Connection error",
};

const DEFAULT_STATE: GameState = {
    phase: "lobby",
    players: [],
    hostId: null,
    clueGiverId: null,
    targetValue: 50,
    concept: null,
    clue: "",
    dialValue: 50,
    score: null,
};

// ─── Extracted Components ─────────────────────────────────────────────────────

function ConceptBadge({ concept }: { concept: Concept | null }) {
    if (!concept) return null;
    return (
        <div style={{ display: "flex", justifyContent: "center", marginBottom: "2rem", width: "100%", position: "relative" }}>
            <div className="dual-spect-bg" />
            <span className="concept-badge dual-concept-badge">
                <span className="concept-left">{concept.left}</span>
                <span className="slash">vs</span>
                <span className="concept-right">{concept.right}</span>
            </span>
        </div>
    );
}

function StatusBar({
    connStatus,
    phase,
    isHost,
    onReset
}: {
    connStatus: ConnectionStatus;
    phase: string;
    isHost: boolean;
    onReset: () => void;
}) {
    return (
        <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            marginBottom: "1.5rem", width: "100%",
        }}>
            <div style={{
                display: "flex", alignItems: "center", gap: "0.5rem",
                padding: "0.5rem 0.875rem", borderRadius: "999px",
                background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
            }}>
                <span className={`status-dot ${connStatus}`} />
                <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                    {STATUS_LABELS[connStatus]}
                </span>
            </div>

            {phase !== "lobby" && isHost && (
                <button
                    onClick={onReset}
                    className="reset-btn"
                    title="Reset game back to lobby"
                >
                    ⚙️ Reset Room
                </button>
            )}
        </div>
    );
}

function PlayerList({ players, hostId, clueGiverId, myId }: { players: Player[], hostId: string | null, clueGiverId: string | null, myId: string }) {
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {players.map(p => (
                <div key={p.id} className="player-badge">
                    <span className="avatar" style={{ background: getAvatarColor(p.id), color: "#fff" }}>
                        {p.username[0]?.toUpperCase() ?? "?"}
                    </span>
                    <span style={{ fontWeight: 500, fontSize: "0.95rem", flex: 1 }}>
                        {p.username}
                        {p.id === hostId && " 👑"}
                    </span>
                    {p.id === hostId && <span className="tag-host">Host</span>}
                    {p.id === clueGiverId && <span className="tag-cluegiver">Clue Giver</span>}
                    {p.id === myId && <span className="tag-you">You</span>}
                </div>
            ))}
        </div>
    );
}

// ─── Main Game Client ─────────────────────────────────────────────────────────

export default function GameClient({ roomCode, username }: { roomCode: string; username: string }) {
    const [game, setGame] = useState<GameState>(DEFAULT_STATE);
    const [connStatus, setConnStatus] = useState<ConnectionStatus>("connecting");
    const [clueInput, setClueInput] = useState("");
    const [myId, setMyId] = useState("");
    const [localDial, setLocalDial] = useState(50);
    const socketRef = useRef<PartySocket | null>(null);
    const usernameRef = useRef(username); // Stable ref for reconnection

    // Keep username ref current
    useEffect(() => { usernameRef.current = username; }, [username]);

    // Reset localDial when entering guessing phase
    useEffect(() => {
        if (game.phase === "guessing") {
            setLocalDial(game.dialValue);
        }
    }, [game.phase]); // eslint-disable-line react-hooks/exhaustive-deps

    const send = useCallback((msg: ClientMessage) => {
        socketRef.current?.send(JSON.stringify(msg));
    }, []);

    useEffect(() => {
        const rawHost = process.env.NEXT_PUBLIC_PARTYKIT_HOST ?? "localhost:1999";
        const host = rawHost.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
        const socket = new PartySocket({ host, room: roomCode });
        socketRef.current = socket;

        // "open" fires on initial connect AND on every auto-reconnect
        socket.addEventListener("open", () => {
            setConnStatus("connected");
            socket.send(JSON.stringify({ type: "join", username: usernameRef.current }));
        });

        socket.addEventListener("message", (ev: MessageEvent) => {
            try {
                const msg = JSON.parse(ev.data as string) as ServerMessage;
                if (msg.type === "init") {
                    setMyId(msg.id);
                } else if (msg.type === "game_state") {
                    setGame(msg.state);
                }
            } catch { /* ignore malformed */ }
        });

        socket.addEventListener("error", () => setConnStatus("error"));
        socket.addEventListener("close", () =>
            setConnStatus(prev => prev === "connected" ? "error" : prev)
        );

        return () => { socket.close(); };
    }, [roomCode]); // Intentional: don't re-create socket when username changes, use ref instead

    const isClueGiver = !!myId && myId === game.clueGiverId;
    const isHost = !!myId && myId === game.hostId;

    const rafRef = useRef<number | null>(null);
    const handleDialChange = useCallback((val: number) => {
        setLocalDial(val);
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(() => {
            send({ type: "update_dial", value: val });
        });
    }, [send]);

    const handleReset = useCallback(() => send({ type: "reset_game" }), [send]);
    const handlePlayAgain = useCallback(() => send({ type: "play_again" }), [send]);

    // ─── PHASE: LOBBY ─────────────────────────────────────────────────────────
    if (game.phase === "lobby") {
        return (
            <div className="phase-enter" style={{ width: "100%", maxWidth: "480px", margin: "0 auto" }}>
                <StatusBar connStatus={connStatus} phase={game.phase} isHost={isHost} onReset={handleReset} />
                <div className="glass-card dual-border" style={{ padding: "1.5rem", marginBottom: "1rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                        <h2 style={{ fontWeight: 700, fontSize: "1rem" }}>Players in Lobby</h2>
                        <span className="player-count-badge">{game.players.length} / 8</span>
                    </div>
                    {game.players.length === 0 ? (
                        <div style={{ textAlign: "center", padding: "2.5rem 1rem", color: "var(--text-muted)" }}>
                            <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>🎙️</div>
                            <p style={{ fontSize: "0.9rem" }}>Waiting for players to join…</p>
                        </div>
                    ) : (
                        <PlayerList players={game.players} hostId={game.hostId} clueGiverId={game.clueGiverId} myId={myId} />
                    )}
                </div>

                {isHost ? (
                    <button
                        className="wl-btn dual-btn"
                        onClick={() => send({ type: "start_game" })}
                        disabled={game.players.length < 2}
                    >
                        🚀 {game.players.length < 2 ? "Need 2+ players" : "Start Game"}
                    </button>
                ) : (
                    <div className="waiting-host-msg">
                        ⏳ Waiting for Host ({game.players.find(p => p.id === game.hostId)?.username ?? "…"}) to start…
                    </div>
                )}

                <p style={{ marginTop: "1rem", textAlign: "center", fontSize: "0.8rem", color: "var(--text-muted)" }}>
                    Share code <strong style={{ color: "var(--text-primary)", letterSpacing: "0.08em" }}>{roomCode}</strong> with friends
                </p>
            </div>
        );
    }

    // ─── PHASE: WRITING CLUE ──────────────────────────────────────────────────
    if (game.phase === "writing_clue") {
        return (
            <div className="phase-enter" style={{ width: "100%", maxWidth: "480px", margin: "0 auto" }}>
                <StatusBar connStatus={connStatus} phase={game.phase} isHost={isHost} onReset={handleReset} />
                <ConceptBadge concept={game.concept} />

                {isClueGiver ? (
                    <>
                        <div style={{ textAlign: "center", marginBottom: "1.5rem" }}>
                            <p className="role-super-title">You are the Clue Giver</p>
                            <h2 style={{ fontWeight: 800, fontSize: "1.5rem", marginBottom: "1rem" }}>
                                Give a one-word clue
                            </h2>
                        </div>

                        {/* Target Dial — read-only, shows where the target is */}
                        <div className="glass-card dual-border" style={{ padding: "1.5rem", marginBottom: "1.5rem", textAlign: "center" }}>
                            <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "0.5rem" }}>
                                🎯 Your Target Position
                            </p>
                            <Dial
                                value={game.targetValue}
                                readOnly
                                leftLabel={game.concept?.left}
                                rightLabel={game.concept?.right}
                                targetValue={game.targetValue}
                            />
                            <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "0.5rem" }}>
                                The guessers will try to land on the gold marker ↑
                            </p>
                        </div>

                        {/* Clue input form */}
                        <div className="glass-card" style={{ padding: "1.5rem" }}>
                            <form
                                onSubmit={(e) => {
                                    e.preventDefault();
                                    if (!clueInput.trim()) return;
                                    send({ type: "submit_clue", clue: clueInput.trim() });
                                    setClueInput("");
                                }}
                                style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
                            >
                                <label className="wl-label" htmlFor="clue-input">Your one-word clue</label>
                                <input
                                    id="clue-input"
                                    className="wl-input"
                                    style={{ fontSize: "1.2rem", fontWeight: 600, textAlign: "center" }}
                                    type="text"
                                    placeholder="e.g. Volcano"
                                    value={clueInput}
                                    onChange={(e) => setClueInput(e.target.value.slice(0, 40))}
                                    autoFocus
                                    autoComplete="off"
                                />
                                <button type="submit" className="wl-btn dual-btn" disabled={!clueInput.trim()}>
                                    Submit Clue →
                                </button>
                            </form>
                        </div>
                    </>
                ) : (
                    <div className="glass-card waiting-pulse dual-border" style={{ padding: "3rem 1.5rem", textAlign: "center", marginBottom: "1.5rem" }}>
                        <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>🤔</div>
                        <p style={{ fontWeight: 700, fontSize: "1.1rem", marginBottom: "0.5rem" }}>
                            {game.players.find(p => p.id === game.clueGiverId)?.username ?? "Someone"} is thinking…
                        </p>
                        <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>
                            Get ready to guess!
                        </p>
                    </div>
                )}

                <div style={{ marginTop: "1.25rem" }}>
                    <PlayerList players={game.players} hostId={game.hostId} clueGiverId={game.clueGiverId} myId={myId} />
                </div>
            </div>
        );
    }

    // ─── PHASE: GUESSING ──────────────────────────────────────────────────────
    if (game.phase === "guessing") {
        return (
            <div className="phase-enter" style={{ width: "100%", maxWidth: "480px", margin: "0 auto" }}>
                <StatusBar connStatus={connStatus} phase={game.phase} isHost={isHost} onReset={handleReset} />
                <ConceptBadge concept={game.concept} />

                <div className="glass-card dual-border" style={{ padding: "1.5rem", marginBottom: "1.25rem" }}>
                    <div style={{ textAlign: "center", marginBottom: "1rem" }}>
                        <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "0.5rem" }}>
                            {isClueGiver ? "Your clue" : "The clue is"}
                        </p>
                        <p className="clue-display">&ldquo;{game.clue}&rdquo;</p>
                    </div>

                    <Dial
                        value={isClueGiver ? game.dialValue : localDial}
                        onChange={isClueGiver ? undefined : handleDialChange}
                        readOnly={isClueGiver}
                        leftLabel={game.concept?.left}
                        rightLabel={game.concept?.right}
                        targetValue={isClueGiver ? game.targetValue : undefined}
                    />

                    {!isClueGiver && (
                        <button
                            className="wl-btn dual-btn"
                            onClick={() => send({ type: "lock_in" })}
                            style={{ marginTop: "1rem" }}
                        >
                            🔒 Lock In — {Math.round(localDial)}
                        </button>
                    )}
                    {isClueGiver && (
                        <p style={{ textAlign: "center", fontSize: "0.8rem", color: "var(--text-muted)", fontStyle: "italic", marginTop: "1rem" }}>
                            Watching the guessers move the needle…
                        </p>
                    )}
                </div>

                <PlayerList players={game.players} hostId={game.hostId} clueGiverId={game.clueGiverId} myId={myId} />
            </div>
        );
    }

    // ─── PHASE: REVEALED ──────────────────────────────────────────────────────
    if (game.phase === "revealed") {
        const score = game.score ?? 0;
        const tier = scoreTier(score);
        const color = scoreTierColor(score);

        return (
            <div className="phase-enter" style={{ width: "100%", maxWidth: "480px", margin: "0 auto" }}>
                <StatusBar connStatus={connStatus} phase={game.phase} isHost={isHost} onReset={handleReset} />
                <ConceptBadge concept={game.concept} />

                <div className="glass-card dual-border" style={{ padding: "2rem 1.5rem", marginBottom: "1.25rem", textAlign: "center" }}>
                    <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "1rem" }}>
                        Result
                    </p>
                    <div className="score-number" style={{ color }}>{score}</div>
                    <div style={{ fontSize: "1.2rem", fontWeight: 700, marginTop: "0.5rem", marginBottom: "1.5rem", color }}>
                        {tier}
                    </div>

                    <Dial
                        value={game.dialValue}
                        readOnly
                        leftLabel={game.concept?.left}
                        rightLabel={game.concept?.right}
                        targetValue={game.targetValue}
                        guessValue={game.dialValue}
                    />
                    <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "0.75rem" }}>
                        🟡 Target: {game.targetValue} &nbsp;•&nbsp; 🟣 Guess: {game.dialValue}
                    </p>
                </div>

                {isHost ? (
                    <button className="wl-btn dual-btn" onClick={handlePlayAgain}>
                        🔄 Play Again
                    </button>
                ) : (
                    <div className="waiting-host-msg">
                        ⏳ Waiting for Host to start next round…
                    </div>
                )}

                <div style={{ marginTop: "1.25rem" }}>
                    <PlayerList players={game.players} hostId={game.hostId} clueGiverId={game.clueGiverId} myId={myId} />
                </div>
            </div>
        );
    }

    return null;
}
