import { redirect } from "next/navigation";
import GameClient from "./GameClient";

interface PageProps {
    params: Promise<{ roomCode: string }>;
    searchParams: Promise<{ username?: string }>;
}

export async function generateMetadata({ params }: PageProps) {
    const { roomCode } = await params;
    return {
        title: `Room ${roomCode} – Wavelength`,
    };
}

export default async function RoomPage({ params, searchParams }: PageProps) {
    const { roomCode } = await params;
    const { username } = await searchParams;

    // Validate room code – must be 4 uppercase letters
    const validCode = /^[A-Z]{4}$/.test(roomCode.toUpperCase());
    if (!validCode || !username) {
        redirect("/");
    }

    return (
        <main
            style={{
                minHeight: "100vh",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                padding: "3rem 1.5rem",
                gap: "2rem",
            }}
        >
            {/* Header */}
            <div style={{ textAlign: "center", width: "100%", maxWidth: "480px" }}>
                <p style={{ color: "var(--text-muted)", fontSize: "0.8rem", marginBottom: "0.5rem" }}>
                    ROOM
                </p>
                <h1
                    className="gradient-text"
                    style={{
                        fontSize: "3rem",
                        fontWeight: 800,
                        letterSpacing: "0.2em",
                    }}
                >
                    {roomCode.toUpperCase()}
                </h1>
                <p style={{ color: "var(--text-muted)", marginTop: "0.5rem", fontSize: "0.9rem" }}>
                    Welcome,{" "}
                    <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>
                        {username}
                    </span>
                </p>
            </div>

            {/* Real-time game */}
            <GameClient
                roomCode={roomCode.toUpperCase()}
                username={username!}
            />

            {/* Back link */}
            <a
                href="/"
                style={{
                    color: "var(--text-muted)",
                    fontSize: "0.8rem",
                    textDecoration: "none",
                    borderBottom: "1px solid rgba(255,255,255,0.1)",
                    paddingBottom: "1px",
                    transition: "color 0.2s",
                }}
            >
                ← Leave room
            </a>
        </main>
    );
}
