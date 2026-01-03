import axios from 'axios';
import * as cheerio from 'cheerio';

/**
 * Scrapes preview URL from Spotify web page
 * Based on: https://github.com/lakshay007/spot
 *
 * Spotify embeds preview URLs in structured data (ld+json) for SEO,
 * even though they're not consistently available via API
 */
export class PreviewScraper {
  /**
   * Get preview URL by scraping Spotify web page
   * @param {string} trackId - Spotify track ID (not full URI)
   * @returns {Promise<Object>} Track details with preview URL
   */
  static async getPreviewUrl(trackId) {
    const url = `https://open.spotify.com/track/${trackId}`;

    try {
      const { data } = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });

      const $ = cheerio.load(data);

      // Extract preview URL from Open Graph meta tag
      const previewUrl = $('meta[property="og:audio"]').attr('content') || null;

      // Extract metadata from meta tags
      const songName = $('meta[property="og:title"]').attr('content') || 'Unknown';
      const description = $('meta[property="og:description"]').attr('content') || '';
      const imageUrl = $('meta[property="og:image"]').attr('content') || null;

      // Parse artist from description (format: "Artist · Album · Song · Year")
      const artistName = description.split(' · ')[0] || 'Unknown Artist';

      return {
        trackId,
        hasPreview: !!previewUrl,
        previewUrl,
        metadata: {
          name: songName,
          artist: artistName,
          imageUrl
        }
      };

    } catch (error) {
      console.error(`Error scraping preview for track ${trackId}:`, error.message);
      return {
        trackId,
        hasPreview: false,
        error: error.message
      };
    }
  }

  /**
   * Batch scrape preview URLs for multiple tracks
   * @param {string[]} trackIds - Array of Spotify track IDs
   * @returns {Promise<Object[]>} Array of track details with preview URLs
   */
  static async batchGetPreviewUrls(trackIds) {
    const promises = trackIds.map(id => this.getPreviewUrl(id));
    return Promise.all(promises);
  }

  /**
   * Filter tracks to only those with preview URLs available
   * @param {string[]} trackIds - Array of Spotify track IDs
   * @returns {Promise<string[]>} Array of track IDs that have previews
   */
  static async filterTracksWithPreviews(trackIds) {
    const results = await this.batchGetPreviewUrls(trackIds);
    return results
      .filter(result => result.hasPreview)
      .map(result => result.trackId);
  }
}
