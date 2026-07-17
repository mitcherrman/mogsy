import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";
import mogsyIcon from "@/assets/mogsy-icon.png";
import SEOHead from "@/components/SEOHead";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4">
      {/* SPA host serves HTTP 200, so noindex marks this as a true not-found
          for crawlers and keeps soft-404s out of the index. */}
      <SEOHead
        title="Page not found — Mogzy"
        description="The page you’re looking for doesn’t exist on Mogzy."
        noindex
      />
      <img src={mogsyIcon} alt="Mogzy" className="h-16 w-16 rounded-2xl" />
      <h1 className="text-4xl font-bold text-foreground">Page not found</h1>
      <p className="text-xl text-muted-foreground">That page doesn’t exist (404).</p>
      <div className="flex flex-wrap items-center justify-center gap-4 text-sm font-semibold">
        <Link to="/lol" className="text-primary hover:underline">League hub</Link>
        <Link to="/quiz" className="text-primary hover:underline">Quiz</Link>
        <Link to="/lol/docs" className="text-primary hover:underline">League Docs</Link>
        <Link to="/combat-lab" className="text-primary hover:underline">Combat Lab</Link>
      </div>
    </div>
  );
};

export default NotFound;
