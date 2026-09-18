import { Link } from "react-router-dom";

import bookSpine from "@/assets/book-spine.png";

type MobileAcademyBook = {
  to: string;
  title: string;
};

/**
 * The phone Hall's four physical navigation books.
 *
 * The source image is 1658×949, while its non-transparent artwork occupies a
 * roughly 1639×495 box. Each link therefore uses the visible-art ratio and
 * positions the original image inside it; the asset is displayed directly and
 * its large transparent canvas margins do not become layout height.
 *
 * Later books sit behind earlier ones. The overlap leaves about 48px of each
 * lower spine exposed at phone widths, so the visible strip — including its
 * live title — belongs to that book's own link rather than to the book painted
 * over it.
 */
export default function MobileAcademyBookStack({
  books,
  onBookClick,
}: {
  books: readonly MobileAcademyBook[];
  onBookClick?: (to: string) => void;
}) {
  const offsets = ["-1.25%", "1.4%", "-0.7%", "1%"];

  return (
    <nav
      aria-label="Academy destinations"
      data-testid="mobile-academy-book-stack"
      className="mt-1 flex w-full flex-col items-center pb-1 md:hidden"
    >
      {books.map((book, index) => (
        <Link
          key={book.to}
          to={book.to}
          aria-label={book.title}
          data-testid="mobile-academy-book"
          onClick={() => onBookClick?.(book.to)}
          className="group relative block w-[calc(100%-0.75rem)] max-w-[22rem] overflow-hidden rounded-[4px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#7ad6ff]"
          style={{
            aspectRatio: "1639 / 495",
            left: offsets[index % offsets.length],
            zIndex: books.length - index,
            // 30.2% is the visible artwork's height relative to the source
            // width. Subtracting it from 3.25rem keeps approximately 48px of
            // each following spine exposed across ordinary phone widths.
            marginTop: index === 0 ? undefined : "calc(3.25rem - 30.2%)",
          }}
        >
          <img
            src={bookSpine}
            alt=""
            aria-hidden="true"
            draggable={false}
            data-testid="mobile-academy-book-image"
            className="pointer-events-none absolute left-[-0.6%] top-[-38%] h-auto w-[101.2%] max-w-none select-none drop-shadow-[0_8px_8px_rgba(0,0,0,0.4)]"
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-[13%] top-[59%] flex h-[33%] items-center justify-center text-center font-semibold uppercase leading-none tracking-[0.13em] text-[#ead79f] [font-family:'Cinzel','Trajan_Pro','EB_Garamond',Georgia,serif] [font-size:clamp(0.72rem,3.7vw,0.95rem)] [text-shadow:0_2px_3px_rgba(0,0,0,0.95)]"
          >
            {book.title}
          </span>
        </Link>
      ))}
    </nav>
  );
}
