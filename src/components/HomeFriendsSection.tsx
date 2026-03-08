import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Users } from "lucide-react";
import UserAvatar from "@/components/UserAvatar";
import { useFriends } from "@/hooks/useFriends";

export default function HomeFriendsSection() {
  const navigate = useNavigate();
  const { friends, loading } = useFriends();

  if (loading || friends.length === 0) return null;

  return (
    <section className="mb-8">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" /> Friends
        </h2>
        <span className="text-xs text-muted-foreground">{friends.length} friends</span>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
        {friends.map((f, i) => (
          <motion.button
            key={f.id}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.04 }}
            onClick={() => navigate(`/user/${f.profile.id}`)}
            className="flex flex-col items-center gap-1.5 flex-shrink-0"
          >
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full border-2 border-primary/20 overflow-hidden hover:border-primary/50 transition-colors">
              <UserAvatar src={f.profile.avatar_url} name={f.profile.display_name || ""} size="lg" className="w-full h-full" />
            </div>
            <span className="text-[10px] font-medium text-foreground truncate max-w-[60px]">
              {f.profile.display_name || "User"}
            </span>
          </motion.button>
        ))}
      </div>
    </section>
  );
}
