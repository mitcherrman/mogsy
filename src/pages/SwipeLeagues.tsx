import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";

// SwipeLeagues now redirects to Play, which is the unified hub
export default function SwipeLeagues() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    navigate("/play", { replace: true, state: location.state });
  }, []);

  return null;
}
