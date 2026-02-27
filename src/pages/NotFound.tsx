import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";
import mogsyIcon from "@/assets/mogsy-icon.png";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <img src={mogsyIcon} alt="Mogsy" className="h-16 w-16 rounded-2xl" />
      <h1 className="text-4xl font-bold text-foreground">404</h1>
      <p className="text-xl text-muted-foreground">Oops! Page not found</p>
      <Link to="/" className="text-primary font-semibold hover:underline">
        Return to Home
      </Link>
    </div>
  );
};

export default NotFound;
