"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  Edit2,
  Layers,
  Palette,
  Plus,
  Save,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Card, PageLoader } from "@/components/ui/misc";
import {
  useAddColoringPage,
  useColoringBook,
  useDeleteColoringPage,
  useUpdateColoringPage,
  useUpdateColoringPlan,
} from "@/lib/coloring-queries";

export default function ColoringBookPlanPage({ params }: { params: Promise<{ bookId: string }> }) {
  const { bookId } = use(params);
  const router = useRouter();
  const { data: detail, isLoading } = useColoringBook(bookId);

  const updatePlan = useUpdateColoringPlan(bookId);
  const updatePage = useUpdateColoringPage(bookId);
  const addPage = useAddColoringPage(bookId);
  const deletePage = useDeleteColoringPage(bookId);

  const [editingPageId, setEditingPageId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editPrompt, setEditPrompt] = useState("");
  const [newPageOpen, setNewPageOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newPrompt, setNewPrompt] = useState("");

  if (isLoading) {
    return <PageLoader label="Loading book plan…" />;
  }

  const book = detail?.book;
  const plan = detail?.plan;
  const pages = detail?.pages ?? [];

  const handleStartEdit = (p: { id: string; title: string; prompt: string }) => {
    setEditingPageId(p.id);
    setEditTitle(p.title);
    setEditPrompt(p.prompt);
  };

  const handleSavePage = async (pageId: string) => {
    try {
      await updatePage.mutateAsync({
        pageId,
        updates: { title: editTitle, prompt: editPrompt },
      });
      setEditingPageId(null);
      toast.success("Page updated");
    } catch {
      toast.error("Failed to update page");
    }
  };

  const handleAddPage = async () => {
    if (!newTitle.trim() || !newPrompt.trim()) {
      toast.error("Title and prompt are required");
      return;
    }
    try {
      await addPage.mutateAsync({ title: newTitle, prompt: newPrompt });
      setNewPageOpen(false);
      setNewTitle("");
      setNewPrompt("");
      toast.success("New page added");
    } catch {
      toast.error("Failed to add page");
    }
  };

  const handleDeletePage = async (pageId: string) => {
    if (pages.length <= 1) {
      toast.error("A coloring book must have at least one page");
      return;
    }
    if (!confirm("Are you sure you want to delete this page?")) return;
    try {
      await deletePage.mutateAsync(pageId);
      toast.success("Page removed");
    } catch {
      toast.error("Failed to delete page");
    }
  };

  const handleApprove = async () => {
    try {
      await updatePlan.mutateAsync({ approved: true });
      toast.success("Plan approved! Moving to Page Generation…");
      router.push(`/app/coloring-book/${bookId}/pages`);
    } catch {
      toast.error("Failed to approve plan");
    }
  };

  return (
    <div className="space-y-8">
      {/* Plan Header Banner */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-border bg-surface p-6 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-bold text-lg">{book?.title}</span>
            {plan?.approvedAt ? (
              <Badge tone="success" className="gap-1">
                <CheckCircle2 className="h-3 w-3" /> Approved
              </Badge>
            ) : (
              <Badge tone="primary">Concept Plan Ready</Badge>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Review the planned collection of scenes. You can edit any scene prompt or add new pages before generating
            illustrations.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="secondary" onClick={() => setNewPageOpen(true)} className="gap-1.5">
            <Plus className="h-4 w-4" /> Add Page
          </Button>
          <Button onClick={handleApprove} loading={updatePlan.isPending} className="gap-2 shadow-md">
            Approve Plan & Generate <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* New Page Modal/Card */}
      {newPageOpen && (
        <Card className="border-primary/40 bg-primary-soft/10 p-6">
          <h3 className="font-bold text-sm">Add a New Scene</h3>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input
              type="text"
              placeholder="Scene Title (e.g. Baby Duck in Water Lilies)"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className="rounded-xl border border-border bg-surface px-3 py-2 text-sm"
            />
            <input
              type="text"
              placeholder="Scene Line-Art Prompt"
              value={newPrompt}
              onChange={(e) => setNewPrompt(e.target.value)}
              className="rounded-xl border border-border bg-surface px-3 py-2 text-sm"
            />
          </div>
          <div className="mt-3 flex items-center justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setNewPageOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleAddPage} loading={addPage.isPending}>
              Add Scene
            </Button>
          </div>
        </Card>
      )}

      {/* Pages List */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Planned Illustrations ({pages.length} Pages)
          </span>
          <span className="text-xs text-muted-foreground">Planning cost: 0 credits (Free)</span>
        </div>

        <div className="grid grid-cols-1 gap-3">
          {pages.map((p) => {
            const isEditing = editingPageId === p.id;

            return (
              <Card
                key={p.id}
                className="group flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 transition-colors hover:border-border/80"
              >
                <div className="flex items-start gap-4 min-w-0 flex-1">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted text-xs font-bold text-foreground">
                    #{p.pageNumber}
                  </div>

                  {isEditing ? (
                    <div className="w-full space-y-2">
                      <input
                        type="text"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm font-semibold"
                        placeholder="Scene Title"
                      />
                      <textarea
                        value={editPrompt}
                        onChange={(e) => setEditPrompt(e.target.value)}
                        rows={2}
                        className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs text-muted-foreground"
                        placeholder="Scene Line Art Prompt"
                      />
                    </div>
                  ) : (
                    <div className="min-w-0">
                      <h4 className="font-semibold text-sm text-foreground">{p.title}</h4>
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{p.prompt}</p>
                    </div>
                  )}
                </div>

                <div className="mt-3 sm:mt-0 sm:ms-4 flex shrink-0 items-center gap-2">
                  {isEditing ? (
                    <>
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => handleSavePage(p.id)}
                        loading={updatePage.isPending}
                        className="gap-1"
                      >
                        <Save className="h-3.5 w-3.5" /> Save
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingPageId(null)}>
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleStartEdit(p)}
                        className="text-muted-foreground hover:text-foreground"
                        title="Edit Scene Prompt"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDeletePage(p.id)}
                        className="text-muted-foreground hover:text-danger"
                        title="Delete Page"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
