import SpotifyWebApi from 'spotify-web-api-node';

/**
 * Spotify API client wrapper
 * Handles OAuth authentication and provides methods for searching tracks
 */
class SpotifyClient {
  constructor() {
    this.spotifyApi = new SpotifyWebApi({
      clientId: process.env.SPOTIFY_CLIENT_ID,
      clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
      redirectUri: process.env.SPOTIFY_REDIRECT_URI
    });

    // Store user sessions: Map<sessionId, { accessToken, refreshToken, expiration }>
    this.userSessions = new Map();

    // Client credentials token for non-authenticated requests (free users)
    this.clientToken = null;
    this.clientTokenExpiration = null;
  }

  /**
   * Generate authorization URL for OAuth flow
   * @returns {string} Authorization URL
   */
  getAuthorizationUrl() {
    const scopes = [
      'user-read-private',
      'user-read-email',
      'streaming',
      'user-read-playback-state',
      'user-modify-playback-state'
    ];

    return this.spotifyApi.createAuthorizeURL(scopes, 'state-' + Math.random().toString(36).substring(7));
  }

  /**
   * Exchange authorization code for access token
   * @param {string} code - Authorization code from OAuth callback
   * @returns {Promise<Object>} Session data with tokens
   */
  async exchangeCodeForToken(code) {
    try {
      const data = await this.spotifyApi.authorizationCodeGrant(code);

      const sessionId = 'session-' + Math.random().toString(36).substring(7);
      const session = {
        accessToken: data.body['access_token'],
        refreshToken: data.body['refresh_token'],
        expiration: Date.now() + (data.body['expires_in'] * 1000)
      };

      this.userSessions.set(sessionId, session);

      console.log('✓ User authenticated with Spotify');

      return {
        sessionId,
        expiresIn: data.body['expires_in']
      };
    } catch (error) {
      console.error('Failed to exchange code for token:', error);
      throw new Error('Authentication failed');
    }
  }

  /**
   * Refresh user access token
   * @param {string} sessionId - User session ID
   */
  async refreshUserToken(sessionId) {
    const session = this.userSessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    try {
      this.spotifyApi.setRefreshToken(session.refreshToken);
      const data = await this.spotifyApi.refreshAccessToken();

      session.accessToken = data.body['access_token'];
      session.expiration = Date.now() + (data.body['expires_in'] * 1000);

      console.log('✓ Refreshed user access token');
    } catch (error) {
      console.error('Failed to refresh token:', error);
      throw new Error('Token refresh failed');
    }
  }

  /**
   * Ensure user has valid access token
   * @param {string} sessionId - User session ID
   */
  async ensureUserAuthenticated(sessionId) {
    const session = this.userSessions.get(sessionId);
    if (!session) {
      throw new Error('User not authenticated');
    }

    // Refresh if token expires within 5 minutes
    if (Date.now() >= session.expiration - (5 * 60 * 1000)) {
      await this.refreshUserToken(sessionId);
    }

    this.spotifyApi.setAccessToken(session.accessToken);
  }

  /**
   * Get client credentials token for non-authenticated requests (free users)
   */
  async ensureClientAuthenticated() {
    // Refresh if token is missing or expires within 5 minutes
    if (!this.clientToken || Date.now() >= this.clientTokenExpiration - (5 * 60 * 1000)) {
      try {
        const data = await this.spotifyApi.clientCredentialsGrant();
        this.clientToken = data.body['access_token'];
        this.clientTokenExpiration = Date.now() + (data.body['expires_in'] * 1000);
        console.log('✓ Client credentials token obtained');
      } catch (error) {
        console.error('Failed to get client credentials:', error);
        throw new Error('Client authentication failed');
      }
    }

    this.spotifyApi.setAccessToken(this.clientToken);
  }

  /**
   * Search for tracks based on filters
   * @param {string|null} sessionId - User session ID (null for free users)
   * @param {Object} filters - Search filters (genres, yearRange, etc.)
   * @param {number} limit - Number of tracks to return
   * @returns {Promise<Array>} Array of track objects
   */
  async searchTracks(sessionId, filters, limit = 50) {
    // Use client credentials if no session ID (free users)
    if (sessionId) {
      await this.ensureUserAuthenticated(sessionId);
    } else {
      await this.ensureClientAuthenticated();
    }

    try {
      // Build search query
      // Start with a generic search term to get popular tracks
      let query = 'year:';  // Start simple to avoid length issues

      // Add year range filter first (most important)
      if (filters.yearRange) {
        const { start, end } = filters.yearRange;
        if (start && end) {
          query += `${start}-${end}`;
        } else {
          query += '1950-2025';
        }
      } else {
        query += '1950-2025';
      }

      // Add genre filter (use first genre only - Spotify doesn't handle OR well)
      if (filters.genres && filters.genres.length > 0) {
        // Use only the first genre (Spotify's genre filter doesn't work with OR)
        const genre = filters.genres[0];
        query = `genre:"${genre}" ${query}`;

        if (filters.genres.length > 1) {
          console.log(`Note: Using first genre (${genre}) - multiple genre selection searches first genre only`);
        }
      }

      console.log('Searching Spotify with query:', query);
      console.log('Query length:', query.length);

      // Search for tracks (don't specify market to get all available tracks)
      const searchOptions = {
        limit: Math.min(limit * 3, 50) // Request more tracks since we'll filter for previews
      };

      const result = await this.spotifyApi.searchTracks(query, searchOptions);

      // Map tracks to our format (OAuth users can play full tracks via Spotify Web Playback SDK)
      const tracks = result.body.tracks.items.map(track => ({
        id: track.id,
        uri: track.uri,  // Spotify URI for playback
        title: track.name,
        artist: track.artists.map(a => a.name).join(', '),
        album: track.album.name,
        year: track.album.release_date ? parseInt(track.album.release_date.substring(0, 4)) : null,
        imageUrl: track.album.images[0]?.url || null,
        duration: track.duration_ms,
        popularity: track.popularity
      }));

      console.log(`Found ${tracks.length} tracks`);

      return tracks.slice(0, limit); // Return requested number of tracks
    } catch (error) {
      console.error('Spotify search error:', error);
      console.error('Error details:', error.message);
      console.error('Error stack:', error.stack);
      if (error.body) {
        console.error('Error body:', error.body);
      }
      throw new Error(`Failed to search Spotify: ${error.message}`);
    }
  }

  /**
   * Get track details by ID
   * @param {string} sessionId - User session ID
   * @param {string} trackId - Spotify track ID
   * @returns {Promise<Object>} Track details
   */
  async getTrackDetails(sessionId, trackId) {
    await this.ensureUserAuthenticated(sessionId);

    try {
      const result = await this.spotifyApi.getTrack(trackId);
      const track = result.body;

      return {
        id: track.id,
        uri: track.uri,
        title: track.name,
        artist: track.artists.map(a => a.name).join(', '),
        album: track.album.name,
        year: track.album.release_date ? parseInt(track.album.release_date.substring(0, 4)) : null,
        imageUrl: track.album.images[0]?.url || null,
        duration: track.duration_ms,
        popularity: track.popularity
      };
    } catch (error) {
      console.error('Failed to get track details:', error);
      throw new Error('Track not found');
    }
  }

  /**
   * Get user session info
   * @param {string} sessionId - User session ID
   * @returns {Object|null} Session info
   */
  getSession(sessionId) {
    const session = this.userSessions.get(sessionId);
    if (!session) return null;

    return {
      accessToken: session.accessToken,
      expiresAt: session.expiration
    };
  }
}

// Export singleton instance
export const spotifyClient = new SpotifyClient();
