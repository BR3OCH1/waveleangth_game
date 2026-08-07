"use client";

import { useEffect, useRef, useState } from "react";
import PartySocket from "partysocket";

interface Player {
    id: string;
    username: string;
}

interface PlayersMessage {
    type: "players";
    players: Player[];
}

const AVATAR_COLORS = [
    "#8b5cf6",
    "#22d3ee",
    "#ec4899",
    "#f59e0b",
    "#10b981",
    "#3b82f6",
];

function getAvatarColor(id: string) {
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
        hash = id.charCodeAt(i) + ((hash << 5) - hash);
    }
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

type ConnectionStatus = "connecting" | "connected" | "error";

const STATUS_LABELS: Record<ConnectionStatus, string> = {
    connecting: "Connecting…",
    connected: "Connected",
    error: "Connection error",
};

interface LobbyClientProps {
    roomCode: string;
    username: string;
}

export default function LobbyClient({ roomCode, username }: LobbyClientProps) {
    const [players, setPlayers] = useState<Player[]>([]);
    const [status, setStatus] = useState<ConnectionStatus>("connecting");
    const socketRef = useRef<PartySocket | null>(null);

    useEffect(() => {
        const socket = new PartySocket({
            host: process.env.NEXT_PUBLIC_PARTYKIT_HOST ?? "localhost:1999",
            room: roomCode,
        });

        socketRef.current = socket;

        socket.addEventListener("open", () => {
            setStatus("connected");
            // Announce ourselves to the room
            socket.send(JSON.stringify({ type: "join", username }));
        });

        socket.addEventListener("message", (event: MessageEvent) => {
            try {
                const data = JSON.parse(event.data as string) as PlayersMessage;
                if (data.type === "players") {
                    setPlayers(data.players);
                }
            } catch {
                // ignore malformed messages
            }
        });

        socket.addEventListener("error", () => {
            setStatus("error");
        });

        socket.addEventListener("close", () => {
            // Only set error if we were previously connected (not a normal teardown on unmount)
            setStatus((prev) => (prev === "connected" ? "error" : prev));
        });

        return () => {
            socket.close();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [roomCode, username]);

    return (
        <div style={{ width: "100%", maxWidth: "480px", margin: "0 auto" }}>
            {/* Connection status banner */}
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    padding: "0.5rem 0.875rem",
                    borderRadius: "999px",
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    width: "fit-content",
                    marginBottom: "1.5rem",
                }}
            >
                <span className={`status-dot ${status}`} />
                <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                    {STATUS_LABELS[status]}
                </span>
            </div>

            {/* Players list */}
            <div className="glass-card" style={{ padding: "1.5rem" }}>
                <div
                    style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: "1rem",
                    }}
                >
                    <h2 style={{ fontWeight: 700, fontSize: "1rem" }}>
                        Players in Lobby
                    </h2>
                    <span
                        style={{
                            background: "rgba(139, 92, 246, 0.15)",
                            color: "var(--accent-violet)",
                            border: "1px solid rgba(139, 92, 246, 0.3)",
                            borderRadius: "999px",
                            padding: "0.125rem 0.625rem",
                            fontSize: "0.75rem",
                            fontWeight: 700,
                        }}
                    >
                        {players.length} / 8
                    </span>
                </div>

                {players.length === 0 ? (
                    <div
                        style={{
                            textAlign: "center",
                            padding: "2.5rem 1rem",
                            color: "var(--text-muted)",
                        }}
                    >
                        <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>🎙️</div>
                        <p style={{ fontSize: "0.9rem" }}>Waiting for players to join…</p>
                    </div>
                ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                        {players.map((player) => (
                            <div key={player.id} className="player-badge">
                                <span
                                    className="avatar"
                                    style={{
                                        background: getAvatarColor(player.id),
                                        color: "#fff",
                                    }}
                                >
                                    {player.username[0]?.toUpperCase() ?? "?"}
                                </span>
                                <span style={{ fontWeight: 500, fontSize: "0.95rem", flex: 1 }}>
                                    {player.username}
                                </span>
                                {player.username === username && (
                                    <span
                                        style={{
                                            fontSize: "0.7rem",
                                            color: "var(--accent-cyan)",
                                            background: "rgba(34, 211, 238, 0.1)",
                                            border: "1px solid rgba(34, 211, 238, 0.2)",
                                            borderRadius: "999px",
                                            padding: "0.1rem 0.5rem",
                                        }}
                                    >
                                        You
                                    </span>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <p
                style={{
                    marginTop: "1.25rem",
                    fontSize: "0.8rem",
                    color: "var(--text-muted)",
                    textAlign: "center",
                }}
            >
                Share room code{" "}
                <strong style={{ color: "var(--text-primary)", letterSpacing: "0.08em" }}>
                    {roomCode}
                </strong>{" "}
                with friends • Max 8 players
            </p>
        </div>
    );
}
