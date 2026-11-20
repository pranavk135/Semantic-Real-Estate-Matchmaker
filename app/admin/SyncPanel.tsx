'use client';
import { useState } from 'react';
export default function SyncPanel() {
  const [msg, setMsg] = useState('');
  return (
    <div>
      <button onClick={async () => { setMsg('Syncing…'); const r = await fetch('/api/sync', { method: 'POST' }); const d = await r.json(); setMsg(r.ok ? `Done: ${d.toNeo} to Neo4j, ${d.toPg} to PostgreSQL` : `Error: ${d.error}`); }}>Run full sync now</button>
      {msg && <span className="muted" style={{ marginLeft: 12 }}>{msg}</span>}
    </div>
  );
}
