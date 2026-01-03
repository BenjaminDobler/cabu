import { spotifyClient } from './spotify.js';
import { PreviewScraper } from './preview-scraper.js';

/**
 * Generate quiz questions from Spotify tracks
 */
export class QuizGenerator {
  /**
   * Generate quiz questions based on game settings
   * @param {string|null} sessionId - User session ID for Spotify authentication (null for free users)
   * @param {Object} settings - Game settings (filters, rounds, questionTypes, useAuth)
   * @returns {Promise<Array>} Array of quiz questions
   */
  async generateQuestions(sessionId, settings) {
    const { filters, rounds, questionTypes, useAuthentication, useAuth } = settings;
    // Support both useAuth and useAuthentication (frontend sends useAuthentication)
    const shouldUseAuth = useAuth !== undefined ? useAuth : (useAuthentication !== undefined ? useAuthentication : true);

    console.log(`Quiz generation mode: ${shouldUseAuth ? 'Premium (Full Tracks)' : 'Free (Preview URLs)'}`);

    // Search for tracks based on filters
    // For free mode, request many more tracks since we'll filter for preview URLs (~30% have previews)
    const searchLimit = shouldUseAuth ? Math.min(rounds * 2, 50) : 50;
    const tracks = await spotifyClient.searchTracks(sessionId, filters, searchLimit);

    console.log(`Fetched ${tracks.length} tracks from Spotify`);

    if (tracks.length === 0) {
      throw new Error('No tracks found with the specified filters');
    }

    if (tracks.length < rounds) {
      console.warn(`Only found ${tracks.length} tracks, but ${rounds} rounds requested`);
    }

    // Shuffle tracks to ensure randomness
    const shuffledTracks = this.shuffleArray([...tracks]);

    // Generate questions (one per round)
    const questions = [];
    let trackIndex = 0;

    while (questions.length < rounds && trackIndex < shuffledTracks.length) {
      const track = shuffledTracks[trackIndex];
      trackIndex++;

      // Pick a random question type from the configured types
      const questionType = questionTypes[Math.floor(Math.random() * questionTypes.length)];

      const question = await this.createQuestion(track, questionType, questions.length + 1, shouldUseAuth);

      // For free users, skip tracks without preview URLs
      if (!shouldUseAuth && !question.hasPreview) {
        console.warn(`⚠️ Skipping track "${track.title}" - no preview URL available`);
        continue;
      }

      questions.push(question);
    }

    // If we couldn't generate enough questions, throw error
    if (questions.length < rounds) {
      throw new Error(`Only found ${questions.length} tracks with preview URLs. Try selecting different genres or year range.`);
    }

    return questions;
  }

  /**
   * Create a single question from a track
   * @param {Object} track - Track data from Spotify
   * @param {string} questionType - Type of question to create
   * @param {number} roundNumber - Round number for the question
   * @param {boolean} useAuth - Whether user is authenticated (Premium)
   * @returns {Promise<Object>} Quiz question object
   */
  async createQuestion(track, questionType, roundNumber, useAuth = true) {
    const difficulty = this.getDifficultyMultiplier(questionType);
    let correctAnswer;
    let questionText;
    let previewUrl = null;

    // For free users, scrape preview URL from Spotify web page
    if (!useAuth) {
      try {
        const previewData = await PreviewScraper.getPreviewUrl(track.id);
        if (previewData.hasPreview) {
          previewUrl = previewData.previewUrl;
          console.log(`✓ Preview URL found for: ${track.title}`);
        } else {
          console.warn(`✗ No preview URL for: ${track.title}`);
        }
      } catch (error) {
        console.error(`Error scraping preview for ${track.id}:`, error.message);
      }
    }

    switch (questionType) {
      case 'song-title':
        correctAnswer = track.title;
        questionText = 'What is the song title?';
        break;

      case 'artist':
        correctAnswer = track.artist;
        questionText = 'Who is the artist?';
        break;

      case 'album':
        correctAnswer = track.album;
        questionText = 'What album is this from?';
        break;

      case 'release-year':
        correctAnswer = track.year?.toString() || 'Unknown';
        questionText = 'What year was this released?';
        break;

      case 'release-decade':
        if (track.year) {
          const decade = Math.floor(track.year / 10) * 10;
          correctAnswer = `${decade}s`;
        } else {
          correctAnswer = 'Unknown';
        }
        questionText = 'What decade was this released?';
        break;

      case 'producer':
        // Note: Spotify API doesn't provide producer info in basic track data
        // This would require additional API calls to get full album details
        // For MVP, we'll skip this or return 'Unknown'
        correctAnswer = 'Unknown';
        questionText = 'Who produced this track?';
        break;

      default:
        correctAnswer = track.title;
        questionText = 'What is the song title?';
    }

    return {
      id: `q${roundNumber}-${track.id}`,
      round: roundNumber,
      trackId: track.id,
      trackUri: track.uri,  // Spotify URI for playback (Premium users)
      previewUrl,  // 30-second MP3 URL (Free users)
      hasPreview: !!previewUrl,
      imageUrl: track.imageUrl,
      type: questionType,
      question: questionText,
      correctAnswer,
      difficulty,
      metadata: {
        title: track.title,
        artist: track.artist,
        album: track.album,
        year: track.year,
        duration: track.duration,
        popularity: track.popularity
      }
    };
  }

  /**
   * Get difficulty multiplier for a question type
   * @param {string} questionType - Type of question
   * @returns {number} Difficulty multiplier (1.0 - 2.0)
   */
  getDifficultyMultiplier(questionType) {
    const difficulties = {
      'song-title': 1.0,
      'artist': 1.0,
      'album': 1.2,
      'release-year': 1.5,
      'release-decade': 1.0,
      'producer': 2.0
    };

    return difficulties[questionType] || 1.0;
  }

  /**
   * Shuffle an array (Fisher-Yates algorithm)
   * @param {Array} array - Array to shuffle
   * @returns {Array} Shuffled array
   */
  shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }
}

// Export singleton instance
export const quizGenerator = new QuizGenerator();
