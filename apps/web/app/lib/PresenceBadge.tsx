"use client";

export default function PresenceBadge({ connected, count }: { connected: boolean; count: number }) {
  if (!connected) return null;
  return (
    <span className="badge" style={{ marginLeft: 8 }}>
      <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: "var(--good)", marginRight: 5 }} />
      {count > 1 ? `${count} conectados en vivo` : "en vivo"}
    </span>
  );
}
