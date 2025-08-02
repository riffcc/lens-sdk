import { Role } from '../acl/rbac';
import type { ContentCategoryData, ContentCategoryMetadataField } from './types';

export const defaultSiteRoles = [
  new Role('moderator', [
    'release:create',
    'release:edit:any',
    'release:delete',
    'featured:manage',
    'category:manage',
    'blocklist:manage',
    'subscription:manage',
  ]),
  new Role('member', [
    'release:create',
    'release:edit:own',
  ]),
];

export const defaultSiteContentCategories: ContentCategoryData<ContentCategoryMetadataField>[] = [
  {
    categoryId: 'music',
    displayName: 'Music',
    featured: true,
    metadataSchema: {
      description: {
        type: 'string',
        description: 'Brief description of the music content',
      },
      totalSongs: {
        type: 'number',
        description: 'Total number of songs in this category',
      },
      totalDuration: {
        type: 'string',
        description: 'Total duration of all songs (e.g., in HH:MM:SS format)',
      },
      genres: {
        type: 'array',
        description: 'List of genres represented in this category',
      },
      tags: {
        type: 'string',
        description: 'Tags associated with the music release',
      },
      musicBrainzID: {
        type: 'string',
        description: 'MusicBrainz identifier for the release',
      },
      albumTitle: {
        type: 'string',
        description: 'Title of the album',
      },
      releaseYear: {
        type: 'number',
        description: 'Year of release',
      },
      releaseType: {
        type: 'string',
        description: 'Type of music release',
        options: [
          'Album',
          'Soundtrack',
          'EP',
          'Anthology',
          'Compilation',
          'Single',
          'Live Album',
          'Remix',
          'Bootleg',
          'Interview',
          'Mixtape',
          'Demo',
          'Concert Recording',
          'DJ Mix',
          'Unknown',
        ],
      },
      fileFormat: {
        type: 'string',
        description: 'Audio file format',
        options: ['MP3', 'FLAC', 'AAC', 'AC3', 'DTS'],
      },
      bitrate: {
        type: 'string',
        description: 'Audio bitrate (e.g., 320kbps)',
      },
      mediaFormat: {
        type: 'string',
        description: 'Physical media format if applicable',
        options: ['CD', 'DVD', 'Vinyl', 'Soundboard', 'SACD', 'DAT', 'WEB', 'Blu-Ray'],
      },
      cover: {
        type: 'string',
        description: 'Content ID for the cover image (used in carousel/featured display)',
      },
      author: {
        type: 'string',
        description: 'Author or artist name',
      },
      trackMetadata: {
        type: 'string',
        description: 'JSON array of track metadata objects with title, artist, and duration',
      },
    },
  },
  {
    categoryId: 'videos',
    displayName: 'Videos',
    metadataSchema: {
      title: {
        type: 'string',
        description: 'Title of the video',
      },
      description: {
        type: 'string',
        description: 'Brief description of the video content',
      },
      duration: {
        type: 'string',
        description: 'Length of the video (e.g., HH:MM:SS)',
      },
      resolution: {
        type: 'string',
        description: 'Video resolution (e.g., 1920x1080)',
      },
      format: {
        type: 'string',
        description: 'File format of the video (e.g., mp4, mov)',
      },
      tags: {
        type: 'array',
        description: 'User-defined tags for searchability (e.g., tutorial, vlog, funny)',
      },
      uploader: {
        type: 'string',
        description: 'Name or ID of the uploader/creator',
      },
      uploadDate: {
        type: 'string',
        description: 'Date the video was uploaded (e.g., YYYY-MM-DD)',
      },
      sourceUrl: {
        type: 'string',
        description: 'Original URL if sourced from an online platform (e.g., YouTube link)',
      },
      cover: {
        type: 'string',
        description: 'Content ID for the cover image (used in carousel/featured display)',
      },
      author: {
        type: 'string',
        description: 'Video creator or uploader name',
      },
    },
  },
  {
    categoryId: 'movies',
    displayName: 'Movies',
    featured: true,
    metadataSchema: {
      description: {
        type: 'string',
        description: 'Brief description of the movie',
      },
      resolution: {
        type: 'string',
        description: 'Video resolution (e.g., 1920x1080)',
      },
      format: {
        type: 'string',
        description: 'File format of the video (e.g., mp4, mov)',
      },
      genres: {
        type: 'array',
        description: 'Genres associated with the video (e.g., action, drama)',
      },
      tags: {
        type: 'array',
        description: 'User-defined tags for searchability (e.g., funny, tutorial)',
      },
      cover: {
        type: 'string',
        description: 'Content ID for the cover image (used in carousel/featured display)',
      },
      TMDBID: {
        type: 'string',
        description: 'The Movie Database identifier',
      },
      IMDBID: {
        type: 'string',
        description: 'Internet Movie Database identifier',
      },
      releaseType: {
        type: 'string',
        description: 'Type of movie release',
      },
      releaseYear: {
        type: 'number',
        description: 'Year of release',
      },
      classification: {
        type: 'string',
        description: 'Content rating/classification (e.g., PG-13)',
      },
      duration: {
        type: 'string',
        description: 'Length of the movie',
      },
      author: {
        type: 'string',
        description: 'Director or filmmaker name',
      },
    },
  },
  {
    categoryId: 'tv-shows',
    displayName: 'TV Shows',
    featured: true,
    metadataSchema: {
      description: {
        type: 'string',
        description: 'Brief description of the TV show',
      },
      seasons: {
        type: 'number',
        description: 'Number of seasons in the TV show',
      },
      totalEpisodes: {
        type: 'number',
        description: 'Total number of episodes aired across all seasons',
      },
      genres: {
        type: 'array',
        description: 'Genres associated with the TV show (e.g., comedy, sci-fi)',
      },
      firstAiredYear: {
        type: 'number',
        description: 'Year the TV show first aired',
      },
      status: {
        type: 'string',
        description: 'Current status of the TV show',
        options: ['Returning Series', 'Ended', 'Canceled', 'In Production', 'Pilot', 'Unknown'],
      },
      TMDBID: {
        type: 'string',
        description: 'The Movie Database identifier for the TV show',
      },
      IMDBID: {
        type: 'string',
        description: 'Internet Movie Database identifier for the TV show',
      },
      cover: {
        type: 'string',
        description: 'Content ID for the cover image (used in carousel/featured display)',
      },
      classification: {
        type: 'string',
        description: 'Content rating/classification (e.g., TV-MA, TV-14)',
      },
      network: {
        type: 'string',
        description: 'Original television network or streaming service',
      },
      averageEpisodeDuration: {
        type: 'string',
        description: 'Average duration of an episode (e.g., ~45 min, 00:45:00)',
      },
      author: {
        type: 'string',
        description: 'Creator or showrunner name',
      },
    },
  },
];

