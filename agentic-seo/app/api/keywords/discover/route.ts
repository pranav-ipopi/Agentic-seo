import { NextResponse } from 'next/server';
import googleTrends from 'google-trends-api';

export async function POST(req: Request) {
  try {
    const { keywords, limit = 50 } = await req.json();

    if (!keywords || typeof keywords !== 'string') {
      return NextResponse.json({ error: 'Keywords string is required' }, { status: 400 });
    }

    const seedKeywords = keywords.split(',').map(k => k.trim()).filter(Boolean);
    if (seedKeywords.length === 0) {
      return NextResponse.json({ error: 'At least one valid keyword is required' }, { status: 400 });
    }

    // 1. Fetch autocomplete suggestions for each seed keyword
    const allSuggestions = new Set<string>();
    
    // Add seed keywords first
    seedKeywords.forEach(k => allSuggestions.add(k));

    // Simple one-level autocomplete expansion
    for (const seed of seedKeywords) {
      if (allSuggestions.size >= limit * 2) break;
      try {
        const res = await fetch(`https://suggestqueries.google.com/complete/search?client=firefox&q=${encodeURIComponent(seed)}`);
        const data = await res.json();
        const suggestions = data[1] || [];
        suggestions.forEach((s: string) => allSuggestions.add(s));
      } catch (err) {
        console.error(`Failed to fetch autocomplete for ${seed}:`, err);
      }
    }

    // Convert Set to Array and limit
    let expandedKeywords = Array.from(allSuggestions).slice(0, limit);

    // 2. Mock or Approximate Metrics (Volume, Difficulty, CPC)
    // To keep it fast and free, we'll use heuristic calculations based on keyword length and words.
    // In a real app, this is where you'd call DataForSEO or Ahrefs.

    // 3. Try to get Google Trends data for a few top keywords to establish a baseline
    let trendBaseline = 50; // default middle
    try {
      const topSeed = seedKeywords[0];
      const trendsResult = await googleTrends.interestOverTime({ keyword: topSeed, startTime: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000) });
      const parsed = JSON.parse(trendsResult);
      const timelineData = parsed.default.timelineData;
      if (timelineData && timelineData.length > 0) {
        const lastValues = timelineData.slice(-4).map((d: any) => d.value[0]);
        const avg = lastValues.reduce((a: number, b: number) => a + b, 0) / lastValues.length;
        trendBaseline = avg;
      }
    } catch (e) {
      console.error('Google Trends failed:', e);
    }

    // Generate mock but realistic-looking data based on the keywords themselves
    const results = expandedKeywords.map((kw, index) => {
      const wordCount = kw.split(' ').length;
      const charCount = kw.length;
      
      // Longer keywords (long-tail) generally have lower volume and lower difficulty
      const volumeBase = Math.max(10, 10000 - (wordCount * 1500) - (charCount * 50));
      const randomVolNoise = Math.random() * 500;
      let volume = Math.round(Math.max(10, volumeBase + randomVolNoise));
      
      const difficultyBase = Math.max(1, 80 - (wordCount * 12));
      const randomDiffNoise = Math.random() * 10 - 5;
      let difficulty = Math.round(Math.max(1, Math.min(100, difficultyBase + randomDiffNoise)));

      // Format volume for display
      let volumeStr = volume.toString();
      if (volume >= 1000) {
        volumeStr = (volume / 1000).toFixed(1) + 'K';
      }

      // CPC approximation
      const cpc = (Math.random() * 4 + 0.5).toFixed(2);

      // Trend
      const trends = ['up', 'down', 'flat'];
      const trend = trends[Math.floor(Math.random() * trends.length)];

      // Potential
      let potential = 'Low';
      if (difficulty < 30 && volume > 1000) potential = 'High';
      else if (difficulty < 50 && volume > 500) potential = 'Medium';
      else if (volume > 5000) potential = 'High';

      return {
        keyword: kw,
        volume: volumeStr,
        rawVolume: volume,
        difficulty,
        cpc: `$${cpc}`,
        trend,
        potential
      };
    });

    // Sort by raw volume descending
    results.sort((a, b) => b.rawVolume - a.rawVolume);

    return NextResponse.json({
      success: true,
      data: {
        keywords: results,
        summary: {
          total: expandedKeywords.length,
          avgDifficulty: Math.round(results.reduce((acc, curr) => acc + curr.difficulty, 0) / results.length) || 0,
          avgVolume: Math.round(results.reduce((acc, curr) => acc + curr.rawVolume, 0) / results.length) || 0,
        }
      }
    });
  } catch (error: any) {
    console.error('Keyword Discovery Error:', error);
    return NextResponse.json({ error: error.message || 'Failed to discover keywords' }, { status: 500 });
  }
}
