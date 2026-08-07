"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import PartySocket from "partysocket";
import type { GameState, ServerMessage, ClientMessage } from "@/lib/game-types";
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

// ─── Default state ────────────────────────────────────────────────────────────
const DEFAULT_STATE: GameState = {
    phase: "lobby",
    players: [],
    clueGiverId: null,
    targetValue: 50,
    concept: null,
    clue: "",
    dialValue: 50,
    score: null,
};

// ─── Component ────────────────────────────────────────────────────────────────
interface GameClientProps {
    roomCode: string;
    username: string;
}

export default function GameClient({ roomCode, username }: GameClientProps) {
    const [game, setGame] = useState<GameState>(DEFAULT_STATE);
    const [connStatus, setConnStatus] = useState<ConnectionStatus>("connecting");
    const [clueInput, setClueInput] = useState("");
    const [myId, setMyId] = useState<string>("");
    const socketRef = useRef<PartySocket | null>(null);

    // ── Socket setup ────────────────────────────────────────────────────────────
    const send = useCallback((msg: ClientMessage) => {
        socketRef.current?.send(JSON.stringify(msg));
    }, []);

    useEffect(() => {
        const socket = new PartySocket({
            host: process.env.NEXT_PUBLIC_PARTYKIT_HOST ?? "localhost:1999",
            room: roomCode,
        });
        socketRef.current = socket;

        socket.addEventListener("open", () => {
            setConnStatus("connected");
            setMyId(socket.id);
            send({ type: "join", username });
        });

        socket.addEventListener("message", (ev: MessageEvent) => {
            try {
                const msg = JSON.parse(ev.data as string) as ServerMessage;
                if (msg.type === "game_state") {
                    setGame(msg.state);
                }
            } catch { /* ignore */ }
        });

        socket.addEventListener("error", () => setConnStatus("error"));
        socket.addEventListener("close", () =>
            setConnStatus(prev => prev === "connected" ? "error" : prev)
        );

        return () => { socket.close(); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [roomCode, username]);

    // Sync myId after socket reconnects (PartySocket may reassign id)
    useEffect(() => {
        if (socketRef.current?.id) setMyId(socketRef.current.id);
    });

    // ── Role flags ──────────────────────────────────────────────────────────────
    const isClueGiver = !!myId && myId === game.clueGiverId;

    // ── Dial drag handler (throttled via requestAnimationFrame) ─────────────────
    const rafRef = useRef<number | null>(null);
    const handleDialChange = useCallback((val: number) => {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(() => {
            send({ type: "update_dial", value: val });
        });
    }, [send]);

    // ── Shared UI pieces ────────────────────────────────────────────────────────
    const ConceptBadge = () =>
        game.concept ? (
            <div style={{ display: "flex", justifyContent: "center", marginBottom: "1.5rem" }}>
                <span className="concept-badge">
                    <span style={{ color: "var(--accent-cyan)" }}>{game.concept.left}</span>
                    <span className="slash">↔</span>
                    <span style={{ color: "var(--accent-pink)" }}>{game.concept.right}</span>
                </span>
            </div>
        ) : null;

    const StatusBar = () => (
        <div style={{
            display: "flex", alignItems: "center", gap: "0.5rem",
            padding: "0.5rem 0.875rem", borderRadius: "999px",
            background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
            width: "fit-content", marginBottom: "1.5rem",
        }}>
            <span className={`status-dot ${connStatus}`} />
            <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                {STATUS_LABELS[connStatus]}
            </span>
        </div>
    );

    const PlayerList = () => (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {game.players.map(p => (
                <div key={p.id} className="player-badge">
                    <span className="avatar" style={{ background: getAvatarColor(p.id), color: "#fff" }}>
                        {p.username[0]?.toUpperCase() ?? "?"}
                    </span>
                    <span style={{ fontWeight: 500, fontSize: "0.95rem", flex: 1 }}>{p.username}</span>
                    {p.id === game.clueGiverId && (
                        <span style={{
                            fontSize: "0.7rem", color: "#fbbf24",
                            background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.25)",
                            borderRadius: "999px", padding: "0.1rem 0.5rem",
                        }}>Clue Giver</span>
                    )}
                    {p.id === myId && (
                        <span style={{
                            fontSize: "0.7rem", color: "var(--accent-cyan)",
                            background: "rgba(34,211,238,0.1)", border: "1px solid rgba(34,211,238,0.2)",
                            borderRadius: "999px", padding: "0.1rem 0.5rem",
                        }}>You</span>
                    )}
                </div>
            ))}
        </div>
    );

    // ── Phase: Lobby ────────────────────────────────────────────────────────────
    const LobbyView = () => (
        <div className="phase-enter" style={{ width: "100%", maxWidth: "480px", margin: "0 auto" }}>
            <StatusBar />
            <div className="glass-card" style={{ padding: "1.5rem", marginBottom: "1rem" }}>
                <div style={{
                    display: "flex", justifyContent: "space-between",
                    alignItems: "center", marginBottom: "1rem",
                }}>
                    <h2 style={{ fontWeight: 700, fontSize: "1rem" }}>Players in Lobby</h2>
                    <span style={{
                        background: "rgba(139,92,246,0.15)", color: "var(--accent-violet)",
                        border: "1px solid rgba(139,92,246,0.3)", borderRadius: "999px",
                        padding: "0.125rem 0.625rem", fontSize: "0.75rem", fontWeight: 700,
                    }}>{game.players.length} / 8</span>
                </div>
                {game.players.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "2.5rem 1rem", color: "var(--text-muted)" }}>
                        <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>🎙️</div>
                        <p style={{ fontSize: "0.9rem" }}>Waiting for players to join…</p>
                    </div>
                ) : <PlayerList />}
            </div>

            <button
                className="wl-btn"
                onClick={() => send({ type: "start_game" })}
                disabled={game.players.length < 1}
            >
                {game.players.length < 2 ? "Waiting for more players…" : "🚀 Start Game"}
            </button>

            <p style={{ marginTop: "1rem", textAlign: "center", fontSize: "0.8rem", color: "var(--text-muted)" }}>
                Share code <strong style={{ color: "var(--text-primary)", letterSpacing: "0.08em" }}>{roomCode}</strong> with friends
            </p>
        </div>
    );

    // ── Phase: Writing Clue ─────────────────────────────────────────────────────
    const WritingClueView = () => {
        const handleSubmit = (e: React.FormEvent) => {
            e.preventDefault();
            if (!clueInput.trim()) return;
            send({ type: "submit_clue", clue: clueInput.trim() });
            setClueInput("");
        };

        if (isClueGiver) {
            return (
                <div className="phase-enter" style={{ width: "100%", maxWidth: "480px", margin: "0 auto" }}>
                    <div style={{ textAlign: "center", marginBottom: "2rem" }}>
                        <p style={{ fontSize: "0.75rem", fontWeight: 600, letterSpacing: "0.1em", color: "var(--text-muted)", textTransform: "uppercase", marginBottom: "0.5rem" }}>
                            You are the Clue Giver
                        </p>
                        <h2 style={{ fontWeight: 800, fontSize: "1.5rem", marginBottom: "1rem" }}>
                            Give a one-word clue
                        </h2>
                        <ConceptBadge />
                    </div>

                    {/* Target value card — only visible to clue giver */}
                    <div className="glass-card" style={{ padding: "1.5rem", marginBottom: "1.5rem", textAlign: "center" }}>
                        <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "0.75rem" }}>
                            🎯 Your Target
                        </p>
                        <div style={{ position: "relative", marginBottom: "0.5rem" }} className="dial-track-wrap">
                            <div className="target-marker" style={{ left: `${game.targetValue}%` }}>
                                {game.targetValue}
                            </div>
                            <Dial
                                value={game.targetValue}
                                readOnly
                                leftLabel={game.concept?.left}
                                rightLabel={game.concept?.right}
                            />
                        </div>
                        <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "1rem" }}>
                            The guessers will try to land here ↑
                        </p>
                    </div>

                    {/* Clue input */}
                    <div className="glass-card" style={{ padding: "1.5rem" }}>
                        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                            <label className="wl-label" htmlFor="clue-input">Your one-word clue</label>
                            <input
                                id="clue-input"
                                className="wl-input"
                                style={{ fontSize: "1.2rem", fontWeight: 600, textAlign: "center" }}
                                type="text"
                                placeholder="e.g. Volcano"
                                value={clueInput}
                                onChange={e => setClueInput(e.target.value.slice(0, 40))}
                                autoFocus
                                autoComplete="off"
                            />
                            <button type="submit" className="wl-btn" disabled={!clueInput.trim()}>
                                Submit Clue →
                            </button>
                        </form>
                    </div>

                    <div style={{ marginTop: "1.25rem" }}><PlayerList /></div>
                </div>
            );
        }

        // Guessers waiting
        return (
            <div className="phase-enter" style={{ width: "100%", maxWidth: "480px", margin: "0 auto", textAlign: "center" }}>
                <ConceptBadge />
                <div className="glass-card waiting-pulse" style={{ padding: "2.5rem 1.5rem", marginBottom: "1.5rem" }}>
                    <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>🤔</div>
                    <p style={{ fontWeight: 700, fontSize: "1.1rem", marginBottom: "0.5rem" }}>
                        {game.players.find(p => p.id === game.clueGiverId)?.username ?? "Someone"} is thinking…
                    </p>
                    <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>
                        Get ready to guess!
                    </p>
                </div>
                <PlayerList />
            </div>
        );
    };

    // ── Phase: Guessing ─────────────────────────────────────────────────────────
    const GuessingView = () => {
        const [localDial, setLocalDial] = useState(game.dialValue);

        const handleDrag = (v: number) => {
            setLocalDial(v);
            handleDialChange(v);
        };

        if (isClueGiver) {
            return (
                <div className="phase-enter" style={{ width: "100%", maxWidth: "480px", margin: "0 auto", textAlign: "center" }}>
                    <ConceptBadge />
                    <div className="glass-card" style={{ padding: "1.5rem", marginBottom: "1.5rem" }}>
                        <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "0.5rem" }}>
                            Your clue
                        </p>
                        <p style={{ fontWeight: 800, fontSize: "1.8rem", marginBottom: "1.5rem" }}>
                            &ldquo;{game.clue}&rdquo;
                        </p>
                        <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "1.5rem" }}>
                            The guessers are deliberating…
                        </p>
                        <div className="dial-track-wrap">
                            <div className="target-marker" style={{ left: `${game.targetValue}%` }}>
                                🎯
                            </div>
                            <Dial
                                value={game.dialValue}
                                readOnly
                                leftLabel={game.concept?.left}
                                rightLabel={game.concept?.right}
                            />
                        </div>
                    </div>
                    <PlayerList />
                </div>
            );
        }

        // Guessers
        return (
            <div className="phase-enter" style={{ width: "100%", maxWidth: "480px", margin: "0 auto" }}>
                <ConceptBadge />
                <div className="glass-card" style={{ padding: "1.5rem", marginBottom: "1.25rem" }}>
                    <div style={{ textAlign: "center", marginBottom: "1.5rem" }}>
                        <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "0.5rem" }}>
                            The clue is
                        </p>
                        <p style={{ fontWeight: 800, fontSize: "2rem" }}>&ldquo;{game.clue}&rdquo;</p>
                    </div>

                    <div className="dial-track-wrap" style={{ marginBottom: "1.5rem" }}>
                        <Dial
                            value={localDial}
                            onChange={handleDrag}
                            leftLabel={game.concept?.left}
                            rightLabel={game.concept?.right}
                        />
                    </div>

                    <button
                        className="wl-btn"
                        onClick={() => send({ type: "lock_in" })}
                    >
                        🔒 Lock In — {Math.round(localDial)}
                    </button>
                </div>
                <PlayerList />
            </div>
        );
    };

    // ── Phase: Revealed ─────────────────────────────────────────────────────────
    const RevealedView = () => {
        const score = game.score ?? 0;
        const tier = scoreTier(score);
        const color = scoreTierColor(score);

        return (
            <div className="phase-enter" style={{ width: "100%", maxWidth: "480px", margin: "0 auto" }}>
                <ConceptBadge />

                {/* Score card */}
                <div className="glass-card" style={{
                    padding: "2rem 1.5rem", marginBottom: "1.25rem", textAlign: "center",
                }}>
                    <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "1rem" }}>
                        Result
                    </p>
                    <div className="score-number" style={{ color }}>{score}</div>
                    <div style={{ fontSize: "1.2rem", fontWeight: 700, marginTop: "0.5rem", marginBottom: "1.75rem", color }}>
                        {tier}
                    </div>

                    {/* Dual-marker dial */}
                    <div className="dial-track-wrap" style={{ marginBottom: "0.75rem" }}>
                        {/* Target (gold) */}
                        <div className="target-marker" style={{ left: `${game.targetValue}%` }}>
                            {game.targetValue}
                        </div>
                        {/* Guessed value (purple dot) */}
                        <div style={{
                            position: "absolute", top: "-0.6rem",
                            left: `${game.dialValue}%`,
                            width: "1.2rem", height: "1.2rem",
                            background: "var(--accent-violet)",
                            borderRadius: "50%",
                            border: "2px solid #fff",
                            transform: "translateX(-50%)",
                            zIndex: 3,
                        }} />
                        <Dial
                            value={game.dialValue}
                            readOnly
                            leftLabel={game.concept?.left}
                            rightLabel={game.concept?.right}
                        />
                    </div>
                    <p style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                        🟡 Target: {game.targetValue} &nbsp;•&nbsp; 🟣 Guess: {game.dialValue}
                    </p>
                </div>

                <button className="wl-btn" onClick={() => send({ type: "play_again" })}>
                    🔄 Play Again
                </button>

                <div style={{ marginTop: "1.25rem" }}><PlayerList /></div>
            </div>
        );
    };

    // ── Phase router ────────────────────────────────────────────────────────────
    const renderPhase = () => {
        switch (game.phase) {
            case "lobby": return <LobbyView />;
            case "writing_clue": return <WritingClueView />;
            case "guessing": return <GuessingView />;
            case "revealed": return <RevealedView />;
        }
    };

    return <>{renderPhase()}</>;
}
