import { useNavigate, useParams } from "react-router-dom";
import { ReviewPanel } from "./ReviewPanel";

/** Deep-link full-page render of a single update — /admin/knowledge/review/:id. */
export default function KnowledgeReviewPage() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const updateId = Number(id);
  if (!id || Number.isNaN(updateId)) {
    return <div className="p-4 text-sm text-destructive">Invalid update id.</div>;
  }
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden max-h-[85vh] flex flex-col">
      <ReviewPanel
        updateId={updateId}
        onClose={() => nav(-1)}
        onApplied={() => nav("/admin/knowledge/queue")}
      />
    </div>
  );
}