"""AI tutor (docs/00-discovery.md §7.5, §12): explains and contextualizes
a project's REAL state via the Anthropic API. It never computes or
invents scientific results itself — the scene and the last run's result
(produced by the real adapter solver) are injected into its context
verbatim, and the system prompt forbids presenting generated text as if
it were a calculated result. This is a hard rule from the discovery doc,
not a style preference.
"""
from __future__ import annotations

import json
import os

import anthropic

from engines.registry import get_adapter

MODEL = "claude-sonnet-5-5"

SYSTEM_PROMPT = """Sos el tutor científico de Universal Science Lab, una plataforma de laboratorios virtuales de simulación científica real (no animaciones).

Reglas estrictas, no negociables:
- Nunca inventes ni recalcules resultados numéricos. Los datos que ves en el contexto ya fueron calculados por el motor científico real de la disciplina (un solver, no un modelo de lenguaje) — tu trabajo es explicarlos e interpretarlos, nunca reemplazarlos ni "corregirlos" con tu propio cálculo.
- Si la pregunta requeriría un dato que no está en el contexto (por ejemplo, un parámetro distinto al que se ejecutó), decí explícitamente que no tenés ese resultado y sugerí que el estudiante cambie el parámetro y vuelva a ejecutar el experimento — no lo estimes vos.
- Mencioná el nivel de fidelidad del adaptador (1 a 5) cuando sea relevante para la pregunta: no es lo mismo un resultado "científico" que uno "educativo cuantitativo".
- Sé conciso, concreto y pedagógico, en español, adaptado a un estudiante que está mirando esta pantalla ahora mismo.
"""


class TutorError(RuntimeError):
    pass


def _client() -> anthropic.Anthropic:
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise TutorError(
            "ANTHROPIC_API_KEY no está configurada. Copiá .env.example a .env en la raíz del "
            "repo y completá tu clave (ver README)."
        )
    return anthropic.Anthropic(api_key=api_key)


def ask(project: dict, question: str) -> str:
    if not question.strip():
        raise TutorError("La pregunta no puede estar vacía.")

    adapter = get_adapter(project["discipline"])
    last_run = project["runs"][-1] if project["runs"] else None
    context = {
        "discipline": project["discipline"],
        "adapter_metadata": adapter.ADAPTER_METADATA,
        "current_scene": project["scene"],
        "last_run_result": last_run["result"] if last_run else None,
        "note_if_no_run": None if last_run else "Todavía no se ejecutó ningún experimento en este proyecto.",
    }

    client = _client()
    try:
        message = client.messages.create(
            model=MODEL,
            max_tokens=800,
            system=SYSTEM_PROMPT,
            messages=[{
                "role": "user",
                "content": (
                    f"Estado real del experimento (JSON, generado por el motor, no por vos):\n"
                    f"{json.dumps(context, ensure_ascii=False)}\n\n"
                    f"Pregunta del estudiante: {question}"
                ),
            }],
        )
    except anthropic.APIError as exc:
        raise TutorError(f"Error llamando a la API de Anthropic: {exc}") from exc

    return "".join(block.text for block in message.content if block.type == "text")
