"use client";

import { useState } from "react";
import { api } from "./api";

export default function TutorPanel({ projectId }: { projectId: string | null }) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function ask() {
    if (!projectId || !question.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.askTutor(projectId, question);
      setAnswer(res.answer);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setAnswer(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <h3 style={{ marginTop: 0 }}>Tutor científico (IA)</h3>
      <p style={{ fontSize: 12, color: "var(--muted)" }}>
        Responde en base al estado real de este experimento (escena + última corrida). No recalcula
        ni inventa resultados — si necesitás un dato distinto, ejecutá de nuevo con otros parámetros.
      </p>
      <div className="row">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && ask()}
          placeholder={projectId ? "Preguntale algo sobre este experimento…" : "Ejecutá el experimento primero"}
          disabled={!projectId}
          style={{ flex: 1, minWidth: 220 }}
        />
        <button onClick={ask} disabled={!projectId || busy || !question.trim()}>
          {busy ? "Pensando…" : "Preguntar"}
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      {answer && (
        <p style={{ whiteSpace: "pre-wrap", marginTop: 10, fontSize: 14, lineHeight: 1.5 }}>{answer}</p>
      )}
    </section>
  );
}
