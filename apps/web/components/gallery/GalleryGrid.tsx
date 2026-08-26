import { Reveal } from '../ui/Reveal';
import { GalleryArtworkCard } from './GalleryArtworkCard';
import type { ArtworkSummary } from '../../lib/artworksApi';

export function GalleryGrid({ artworks }: { artworks: ArtworkSummary[] }) {
  return (
    <div className="mt-12 grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
      {artworks.map((artwork, index) => (
        // Delay is capped so a large grid's last items don't wait
        // multiple seconds to reveal — calm, not sluggish.
        <Reveal key={artwork.id} delay={Math.min(index, 8) * 60}>
          <GalleryArtworkCard artwork={artwork} />
        </Reveal>
      ))}
    </div>
  );
}
