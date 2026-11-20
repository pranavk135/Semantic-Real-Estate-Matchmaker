'use client';

import { useState } from 'react';

const FIELDS: { name: string; label: string; numeric?: boolean; optional?: boolean }[] = [
  { name: 'title', label: 'Property title' },
  { name: 'city', label: 'City' },
  { name: 'locality', label: 'Locality' },
  { name: 'price', label: 'Price in ₹', numeric: true },
  { name: 'bedrooms', label: 'Bedrooms', numeric: true },
  { name: 'bathrooms', label: 'Bathrooms', numeric: true },
  { name: 'areaSqFt', label: 'Area (sq.ft.)', numeric: true },
  { name: 'propertyType', label: 'Property type' },
  { name: 'imageUrl', label: 'Image URL (optional)', optional: true },
];

export default function AddPropertyPage() {
  const [message, setMessage] = useState<{ text: string; cls: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const form = e.currentTarget;
    const f = new FormData(form);
    const body = {
      title: f.get('title'),
      description: f.get('description'),
      city: f.get('city'),
      locality: f.get('locality'),
      price: Number(f.get('price')),
      bedrooms: Number(f.get('bedrooms')),
      bathrooms: Number(f.get('bathrooms')),
      areaSqFt: Number(f.get('areaSqFt')),
      propertyType: f.get('propertyType'),
      listingType: f.get('listingType'),
      amenities: String(f.get('amenities') ?? '').split(',').map((x) => x.trim()).filter(Boolean),
      imageUrl: f.get('imageUrl') || undefined,
    };
    try {
      const r = await fetch('/api/properties', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Could not save property');
      setMessage(
        data.graphSynced
          ? { text: `Saved to PostgreSQL and synced to Neo4j. ID: ${data.id}`, cls: 'ok' }
          : { text: `Saved to PostgreSQL (ID: ${data.id}) but Neo4j sync failed. Run "npm run graph:sync" once Neo4j is reachable.`, cls: 'warn' }
      );
      form.reset();
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : 'Error saving property', cls: 'err' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="container">
      <h1>Add a property</h1>
      <p className="muted">Add a listing under your USER account. The property is linked to the existing user account and synced to Neo4j.</p>
      <form className="card" onSubmit={submit}>
        <div className="form">
          {FIELDS.map((f) => (
            <div key={f.name}>
              <label htmlFor={f.name}>{f.label}</label>
              <input
                id={f.name}
                name={f.name}
                required={!f.optional}
                type={f.numeric ? 'number' : 'text'}
                min={f.numeric ? '0' : undefined}
              />
            </div>
          ))}
          <div>
            <label htmlFor="listingType">Listing type</label>
            <select id="listingType" name="listingType">
              <option value="SALE">For sale</option>
              <option value="RENT">For rent</option>
            </select>
          </div>
          <div>
            <label htmlFor="amenities">Amenities (comma-separated)</label>
            <input id="amenities" name="amenities" placeholder="Metro, Garden, Parking" />
          </div>
        </div>
        <p>
          <label htmlFor="description">Description</label>
          <textarea id="description" name="description" rows={4} required minLength={20} />
        </p>
        <button disabled={busy}>{busy ? 'Saving…' : 'Save property'}</button>
        {message && <div className={`notice ${message.cls}`}>{message.text}</div>}
      </form>
    </main>
  );
}
