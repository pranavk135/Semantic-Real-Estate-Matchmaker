'use client';

import { useState } from 'react';

type Result = {
  id: string;
  title: string;
  city: string;
  locality: string;
  price: number;
  bedrooms: number;
  bathrooms: number;
  areaSqFt: number;
  description: string;
  matchScore: number;
  matchReasons: string[];
  amenities: { amenity: { name: string } }[];
};

const RANKING_LABEL: Record<string, { text: string; cls: string }> = {
  neo4j: { text: 'Ranking: Neo4j graph + keywords', cls: 'graph' },
  'sql-fallback': { text: 'Neo4j unreachable - PostgreSQL fallback', cls: 'fallback' },
  'keyword-only': { text: 'Ranking: keywords only (add amenities to use the graph)', cls: 'kw' },
};

export default function SearchPage() {
  const [query, setQuery] = useState('A peaceful home near public transport with good natural light');
  const [city, setCity] = useState('Bengaluru');
  const [maxPrice, setMaxPrice] = useState('10000000');
  const [bedrooms, setBedrooms] = useState('2');
  const [amenities, setAmenities] = useState('Metro, Garden');
  const [results, setResults] = useState<Result[]>([]);
  const [ranking, setRanking] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const r = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          city: city.trim() || undefined,
          maxPrice: Number(maxPrice) || undefined,
          bedrooms: bedrooms === '' ? undefined : Number(bedrooms),
          amenities: amenities.split(',').map((x) => x.trim()).filter(Boolean),
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Search failed');
      setResults(data.results);
      setRanking(data.ranking);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  const label = RANKING_LABEL[ranking];

  return (
    <main className="container">
      <h1>Find your match</h1>
      <p className="muted">Describe what matters to you, pick amenities, then narrow results with structured filters.</p>

      <form className="card" onSubmit={search}>
        <label>What are you looking for?</label>
        <textarea rows={3} value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="form" style={{ marginTop: 14 }}>
          <div><label>City</label><input value={city} onChange={(e) => setCity(e.target.value)} /></div>
          <div><label>Maximum price (₹)</label><input type="number" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} /></div>
          <div><label>Bedrooms</label><input type="number" min="0" value={bedrooms} onChange={(e) => setBedrooms(e.target.value)} /></div>
          <div>
            <label>Amenities (comma-separated)</label>
            <input value={amenities} onChange={(e) => setAmenities(e.target.value)} placeholder="Metro, Garden, Parking" />
          </div>
        </div>
        <p><button disabled={loading}>{loading ? 'Searching…' : 'Search properties'}</button></p>
      </form>

      {error && <div className="notice err">{error}</div>}
      {label && <p><span className={`badge ${label.cls}`}>{label.text}</span></p>}

      <h2>{results.length} matching properties</h2>
      <div className="grid">
        {results.map((p) => (
          <article className="card" key={p.id}>
            <div className="muted">{p.locality}, {p.city}</div>
            <h3>{p.title}</h3>
            <p className="price">₹{p.price.toLocaleString('en-IN')}</p>
            <p>{p.bedrooms} BHK · {p.bathrooms} bathrooms · {p.areaSqFt} sq.ft.</p>
            <p>{p.description}</p>
            <strong>Match score: {p.matchScore}%</strong>
            <div>{p.amenities.map((a) => <span className="tag" key={a.amenity.name}>{a.amenity.name}</span>)}</div>
            <ul>{p.matchReasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
          </article>
        ))}
      </div>
    </main>
  );
}
