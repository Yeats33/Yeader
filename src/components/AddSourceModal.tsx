import { useState } from "react";
import { probeFeed, fetchFeed } from "../api.ts";
import type { FeedSource } from "../types.ts";

interface AddSourceModalProps {
  onAdd: (source: FeedSource) => void | Promise<void>;
  onClose: () => void;
}

export function AddSourceModal({ onAdd, onClose }: AddSourceModalProps) {
  const [url, setUrl] = useState("");
  const [probing, setProbing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [probeResult, setProbeResult] = useState<FeedSource | null>(null);

  const handleProbe = async () => {
    const trimmed = url.trim();
    if (!trimmed) return;

    setError(null);
    setProbing(true);
    try {
      await fetchFeed(trimmed);
      const source = await probeFeed(trimmed);
      setProbeResult(source);
    } catch (e) {
      setError(e instanceof Error ? e.message : "无法识别 RSS/Atom 订阅地址");
      setProbeResult(null);
    } finally {
      setProbing(false);
    }
  };

  const handleAdd = async () => {
    if (probeResult && !adding) {
      setAdding(true);
      setError(null);
      try {
        await onAdd(probeResult);
      } catch (e) {
        setError(e instanceof Error ? e.message : "添加订阅失败");
        setAdding(false);
        return;
      }
      setUrl("");
      setProbeResult(null);
      setError(null);
      setAdding(false);
      onClose();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleProbe();
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="add-source-modal" onClick={(e) => e.stopPropagation()}>
        <h2>添加订阅源</h2>

        <div className="field">
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="粘贴 RSS/Atom feed URL..."
            autoFocus
          />
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleProbe}
            disabled={probing || adding || !url.trim()}
          >
            {probing ? "检测中..." : "检测"}
          </button>
        </div>

        {error ? <div className="add-source-error">{error}</div> : null}

        {probeResult ? (
          <div className="probe-result">
            <h3>{probeResult.title}</h3>
            {probeResult.description ? <p>{probeResult.description}</p> : null}
            <div className="probe-meta">
              {probeResult.link ? <span>{probeResult.link} · </span> : null}
              <span>RSS/Atom</span>
            </div>
          </div>
        ) : null}

        <div className="add-source-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void handleAdd()}
            disabled={!probeResult || adding}
          >
            {adding ? "添加中..." : "添加订阅"}
          </button>
        </div>
      </div>
    </div>
  );
}
