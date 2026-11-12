/**
 * CINEVERSE — Static Sample Preview Picks
 *
 * Used strictly by PersonalisedPreview with an explicit UI disclaimer
 * until the ML recommendation engine replaces it with live personalized picks.
 */

export interface MovieFixture {
  id: number;
  title: string;
  tagline: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string;
  vote_average: number;
  vote_count: number;
  genres: string[];
  runtime: number; // minutes
  original_language: string;
}

/** ── Hero Feature ───────────────────────────────────────────────────────── */
export const HERO_MOVIE: MovieFixture = {
  id: 157336,
  title: 'Interstellar',
  tagline: 'Mankind was born on Earth. It was never meant to die here.',
  overview:
    'The adventures of a group of explorers who make use of a newly discovered wormhole to surpass the limitations on human space travel and conquer the vast distances involved in an interstellar voyage.',
  poster_path: '/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg',
  backdrop_path: '/xJHokMbljvjADYdit5fK5VQsXEG.jpg',
  release_date: '2014-11-05',
  vote_average: 8.4,
  vote_count: 35802,
  genres: ['Science Fiction', 'Adventure', 'Drama'],
  runtime: 169,
  original_language: 'en',
};

/** ── Trending Now ───────────────────────────────────────────────────────── */
export const TRENDING_MOVIES: MovieFixture[] = [
  {
    id: 872585,
    title: 'Oppenheimer',
    tagline: 'The world forever changes.',
    overview: 'The story of J. Robert Oppenheimer\'s role in the development of the atomic bomb during World War II.',
    poster_path: '/8Gxv8gSFCU0XGDykEGv7zR1n2ua.jpg',
    backdrop_path: '/fm6KqXpk3M2HVveHwCrBSSBaO0V.jpg',
    release_date: '2023-07-19',
    vote_average: 8.1,
    vote_count: 20045,
    genres: ['Drama', 'History'],
    runtime: 180,
    original_language: 'en',
  },
  {
    id: 346698,
    title: 'Barbie',
    tagline: 'She\'s everything. He\'s just Ken.',
    overview: 'Barbie and Ken are having the time of their lives in the colorful and seemingly perfect world of Barbie Land.',
    poster_path: null,
    backdrop_path: null,
    release_date: '2023-07-19',
    vote_average: 7.1,
    vote_count: 16823,
    genres: ['Comedy', 'Adventure', 'Fantasy'],
    runtime: 114,
    original_language: 'en',
  },
  {
    id: 695721,
    title: 'The Hunger Games: The Ballad of Songbirds & Snakes',
    tagline: 'The world will know his name.',
    overview: 'An origin story of President Snow before he was president — 64 years before the events of The Hunger Games.',
    poster_path: '/5a4JdoFwll5DRtKMe7JLuGQ9yJm.jpg',
    backdrop_path: '/rngMlUKQKunHNIBnuJVBZcMoqP8.jpg',
    release_date: '2023-11-15',
    vote_average: 7.2,
    vote_count: 7623,
    genres: ['Action', 'Adventure', 'Science Fiction'],
    runtime: 157,
    original_language: 'en',
  },
  {
    id: 594767,
    title: 'Shazam! Fury of the Gods',
    tagline: 'The gods have come to collect.',
    overview: 'Billy Batson and his foster siblings must discover how to use their superpowers to defend Earth from the vengeful daughters of Atlas.',
    poster_path: '/A3ZbZsmsvNGdprRi2lKgGEeVLEH.jpg',
    backdrop_path: '/bQS43HSMadbf5rEL6W9DxJlkRkj.jpg',
    release_date: '2023-03-15',
    vote_average: 6.4,
    vote_count: 4823,
    genres: ['Action', 'Fantasy', 'Comedy'],
    runtime: 130,
    original_language: 'en',
  },
  {
    id: 758323,
    title: 'The Pope\'s Exorcist',
    tagline: 'Based on the actual files of the Vatican.',
    overview: 'Father Gabriele Amorth, the Vatican\'s leading exorcist, investigates the possession of a boy and uncovers a conspiracy the Vatican has tried to keep secret.',
    poster_path: '/9JBEPLTPSm0d1mbEcLxULjJq9Eh.jpg',
    backdrop_path: '/hiHGRbyTcbZoLsYYkO4QiCLYe34.jpg',
    release_date: '2023-04-05',
    vote_average: 6.8,
    vote_count: 4312,
    genres: ['Horror', 'Mystery', 'Thriller'],
    runtime: 103,
    original_language: 'en',
  },
  {
    id: 502356,
    title: 'The Super Mario Bros. Movie',
    tagline: 'The mission begins.',
    overview: 'A plumber named Mario travels through an underground labyrinth with his brother, Luigi, trying to save a captured princess.',
    poster_path: '/qNBAXBIQlnOThrVvA6mA2B5ggV6.jpg',
    backdrop_path: '/9n2tJBplPbgR2ca05hS5CKXwP2c.jpg',
    release_date: '2023-04-05',
    vote_average: 7.6,
    vote_count: 11234,
    genres: ['Animation', 'Adventure', 'Family'],
    runtime: 92,
    original_language: 'en',
  },
  {
    id: 385687,
    title: 'Fast X',
    tagline: 'The end of the road begins.',
    overview: 'Dom Toretto and his family are targeted by the vengeful son of drug lord Hernan Reyes.',
    poster_path: null,
    backdrop_path: null,
    release_date: '2023-05-17',
    vote_average: 7.2,
    vote_count: 7421,
    genres: ['Action', 'Crime', 'Thriller'],
    runtime: 141,
    original_language: 'en',
  },
  {
    id: 298618,
    title: 'The Flash',
    tagline: 'Worlds collide.',
    overview: 'Barry Allen uses his super speed to change the past, but his attempt to save his family creates a world without super heroes.',
    poster_path: '/rktDFPbfHfUbArZ6OOOKsXcv0Bm.jpg',
    backdrop_path: '/yF1eOkaYvwiORauRCPWznV9xVvi.jpg',
    release_date: '2023-06-14',
    vote_average: 6.9,
    vote_count: 6834,
    genres: ['Action', 'Adventure', 'Science Fiction'],
    runtime: 144,
    original_language: 'en',
  },
];

/** ── Hidden Gems ────────────────────────────────────────────────────────── */
export const HIDDEN_GEMS: MovieFixture[] = [
  {
    id: 545611,
    title: 'Everything Everywhere All at Once',
    tagline: 'The universe is so much bigger than you realize.',
    overview: 'An aging Chinese immigrant is swept up in an insane adventure, in which she alone can save what\'s important to her by connecting with the lives she could have led in other universes.',
    poster_path: '/w3LxiVYdWWRvEVdn5RYq6jIqkb1.jpg',
    backdrop_path: '/ss0Os3uWJfQAENILHZUdX8Tt1OC.jpg',
    release_date: '2022-03-25',
    vote_average: 7.8,
    vote_count: 11234,
    genres: ['Action', 'Adventure', 'Science Fiction'],
    runtime: 139,
    original_language: 'en',
  },
  {
    id: 646385,
    title: 'Nope',
    tagline: 'What\'s a bad miracle?',
    overview: 'The residents of a lonely gulch in inland California bear witness to an uncanny and chilling discovery.',
    poster_path: '/AcKVlWaNVVVFQwro3nLXqPljcYA.jpg',
    backdrop_path: null,
    release_date: '2022-07-20',
    vote_average: 7.0,
    vote_count: 7891,
    genres: ['Horror', 'Mystery', 'Science Fiction'],
    runtime: 130,
    original_language: 'en',
  },
  {
    id: 497698,
    title: 'Blackout',
    tagline: '',
    overview: 'A man wakes up in a hospital unable to remember who he is, and finds himself pursued by dangerous figures who seem to know the truth.',
    poster_path: null,
    backdrop_path: null,
    release_date: '2022-09-01',
    vote_average: 6.0,
    vote_count: 1823,
    genres: ['Action', 'Thriller'],
    runtime: 101,
    original_language: 'en',
  },
  {
    id: 718821,
    title: 'Tár',
    tagline: 'Music is power.',
    overview: 'Set in the international world of classical music, the film centers on Lydia Tár, widely considered one of the greatest living composer-conductors.',
    poster_path: null,
    backdrop_path: null,
    release_date: '2022-10-07',
    vote_average: 7.3,
    vote_count: 4901,
    genres: ['Drama', 'Music'],
    runtime: 158,
    original_language: 'en',
  },
];

/** ── Personalised Preview (sample content) ─────────────────────────────── */
export const SAMPLE_PICKS: MovieFixture[] = [
  {
    id: 157336,
    title: 'Interstellar',
    tagline: 'Mankind was born on Earth. It was never meant to die here.',
    overview: 'A team of explorers travel through a wormhole in space in an attempt to ensure humanity\'s survival.',
    poster_path: '/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg',
    backdrop_path: '/xJHokMbljvjADYdit5fK5VQsXEG.jpg',
    release_date: '2014-11-05',
    vote_average: 8.4,
    vote_count: 35802,
    genres: ['Science Fiction', 'Adventure'],
    runtime: 169,
    original_language: 'en',
  },
  {
    id: 238,
    title: 'The Godfather',
    tagline: 'An offer you can\'t refuse.',
    overview: 'The aging patriarch of an organized crime dynasty transfers control of his clandestine empire to his reluctant son.',
    poster_path: '/3bhkrj58Vtu7enYsRolD1fZdja1.jpg',
    backdrop_path: '/tmU7GeKVybMWFButWEGl2M4GeiP.jpg',
    release_date: '1972-03-14',
    vote_average: 8.7,
    vote_count: 20934,
    genres: ['Drama', 'Crime'],
    runtime: 175,
    original_language: 'en',
  },
  {
    id: 278,
    title: 'The Shawshank Redemption',
    tagline: 'Fear can hold you prisoner. Hope can set you free.',
    overview: 'Two imprisoned men bond over a number of years, finding solace and eventual redemption through acts of common decency.',
    poster_path: '/q6y0Go1tsGEsmtFryDOJo3dEmqu.jpg',
    backdrop_path: '/kXfqcdQKsToO0OUXHcrrNCHDBaR.jpg',
    release_date: '1994-09-23',
    vote_average: 8.7,
    vote_count: 26987,
    genres: ['Drama', 'Crime'],
    runtime: 142,
    original_language: 'en',
  },
  {
    id: 680,
    title: 'Pulp Fiction',
    tagline: 'You won\'t know the facts until you\'ve seen the fiction.',
    overview: 'The lives of two mob hitmen, a boxer, a gangster and his wife, and a pair of diner bandits intertwine in four tales of violence and redemption.',
    poster_path: '/d5iIlFn5s0ImszYzBPb8JPIfbXD.jpg',
    backdrop_path: '/suaEOtk1N1sgg2MTM7oZd2cfVp3.jpg',
    release_date: '1994-10-14',
    vote_average: 8.5,
    vote_count: 28543,
    genres: ['Thriller', 'Crime'],
    runtime: 154,
    original_language: 'en',
  },
];
