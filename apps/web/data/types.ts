/*
  Explainer: a "type" is a promise about the shape of an object — it tells
  TypeScript (and anyone reading the code) exactly which fields an Artist
  or Artwork must have, so a typo or a missing field gets caught before
  the page ever loads. `image` is a plain path string pointing into
  /public/images — wiring this up to a real API later means swapping the
  data source, not rewriting components.
*/

export type Artist = {
  id: string;
  name: string;
  discipline: string;
  location: string;
  bio: string;
  /** Path under /public, e.g. '/images/artists/artist-01.jpg' */
  image: string;
  imageAlt: string;
};

export type Artwork = {
  id: string;
  title: string;
  artist: string;
  category: string;
  /** Path under /public, e.g. '/images/artworks/artwork-01.jpg' */
  image: string;
  imageAlt: string;
  price?: number;
  size: 'lg' | 'sm';
};

export type Category = {
  id: string;
  name: string;
  count: number;
  /** Path under /public, e.g. '/images/categories/painting.jpg' */
  image: string;
  imageAlt: string;
};
