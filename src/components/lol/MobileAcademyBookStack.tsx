import { Link } from "react-router-dom";

import bookSpine from "@/assets/book-spine-flat-v2.png";

type MobileAcademyBook = {
  to: string;
  title: string;
};

/**
 * The phone Hall's four physical navigation books.
 *
 * The source image is 2172×724, while its solid artwork occupies a roughly
 * 2071×336 box. Each link uses that visible-art ratio and positions the
 * original image inside it, so the transparent canvas does not recreate the
 * taller cover silhouette from the previous asset.
 *
 * Later books sit behind earlier ones. The twelve-pixel overlap makes the
 * volumes read as one physical stack while leaving roughly 44px of every
 * lower spine exposed as an unambiguous tap target at phone widths.
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
          className="group relative block min-h-12 w-[calc(100%-0.75rem)] max-w-[22rem] overflow-hidden rounded-[4px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#7ad6ff]"
          style={{
            aspectRatio: "2071 / 336",
            left: offsets[index % offsets.length],
            zIndex: books.length - index,
            marginTop: index === 0 ? undefined : "-0.75rem",
          }}
        >
          <img
            src={bookSpine}
            alt=""
            aria-hidden="true"
            draggable={false}
            data-testid="mobile-academy-book-image"
            className="pointer-events-none absolute left-[-2.41%] top-[-61.9%] h-auto w-[104.88%] max-w-none select-none drop-shadow-[0_6px_6px_rgba(0,0,0,0.42)]"
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute bottom-[14%] left-[27.25%] right-[27.69%] top-[29%] flex items-center justify-center whitespace-nowrap text-center font-semibold uppercase leading-none tracking-[0.025em] text-[#ead79f] [font-family:'Cinzel','Trajan_Pro','EB_Garamond',Georgia,serif] [font-size:clamp(0.68rem,3.05vw,0.76rem)] [text-shadow:0_2px_3px_rgba(0,0,0,0.95)]"
          >
            {book.title}
          </span>
        </Link>
      ))}
    </nav>
  );
}
