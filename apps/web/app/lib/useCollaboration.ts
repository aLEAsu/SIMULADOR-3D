"use client";

import { useEffect, useRef, useState } from "react";
import { Project, Run } from "./api";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const WS_URL = API_URL.replace(/^http/, "ws");

interface Options<TScene, TResult> {
  projectId: string | null;
  onSceneUpdated: (scene: TScene) => void;
  onRunAdded: (run: Run<TResult>) => void;
}

/**
 * Minimal real-time collaboration: one WebSocket per open project. Any
 * client that saves a scene or runs an experiment broadcasts to every
 * other client connected to the same project (see
 * apps/api/connection_manager.py). Last write wins — no conflict
 * resolution, which is a real, named limitation, not a hidden one.
 */
export function useCollaboration<TScene, TResult>({ projectId, onSceneUpdated, onRunAdded }: Options<TScene, TResult>) {
  const [connectedCount, setConnectedCount] = useState(1);
  const [connected, setConnected] = useState(false);
  const callbacksRef = useRef({ onSceneUpdated, onRunAdded });
  callbacksRef.current = { onSceneUpdated, onRunAdded };

  useEffect(() => {
    if (!projectId) return;
    const ws = new WebSocket(`${WS_URL}/ws/projects/${projectId}`);

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === "presence") {
        setConnectedCount(msg.count);
      } else if (msg.type === "scene_updated") {
        callbacksRef.current.onSceneUpdated((msg.project as Project<TScene>).scene);
      } else if (msg.type === "run_added") {
        callbacksRef.current.onRunAdded(msg.run as Run<TResult>);
      }
    };

    return () => ws.close();
  }, [projectId]);

  return { connectedCount, connected };
}
