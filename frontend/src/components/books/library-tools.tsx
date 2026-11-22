"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, ArchiveRestore, Copy, FolderKanban, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app/app-shell";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Badge, Card, EmptyState, ErrorState, PageLoader } from "@/components/ui/misc";
import { api, errorMessage } from "@/lib/api";
import { useIsSignedIn } from "@/lib/queries";
import type { BookSummary } from "@/lib/types";

interface Project {
  id: string;
  name: string;
  description: string | null;
  archivedAt: string | null;
  _count: { books: number };
}

export function useProjects(query = "limit=100") {
  const signedIn = useIsSignedIn();
  return useQuery({
    queryKey: ["projects", query],
    queryFn: () => api.get<{ projects: Project[]; nextCursor: string | null }>(`/projects?${query}`),
    enabled: signedIn,
  });
}

/**
 * The per-book organisation controls shown under each card in the library.
 *
 * Project assignment, archiving, duplicating and deleting are all grouped here
 * rather than spread across the book card, because they act on the book rather
 * than open it.
 */
export function BookOrganization({ book }: { book: BookSummary }) {
  const qc = useQueryClient();
  const projects = useProjects();
  const [busy, setBusy] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const change = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await action();
      setCopyOpen(false);
      setConfirmDelete(false);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["books"] }),
        qc.invalidateQueries({ queryKey: ["projects"] }),
        qc.invalidateQueries({ queryKey: ["dashboard"] }),
        qc.invalidateQueries({ queryKey: ["book", book.id] }),
      ]);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 rounded-b-2xl border border-t-0 border-border bg-surface p-3">
      <Field label="Project" htmlFor={`project-for-${book.id}`}>
        <Select
          id={`project-for-${book.id}`}
          value={book.projectId ?? ""}
          disabled={busy || projects.isLoading || Boolean(projects.error)}
          onChange={(e) => void change(() => api.patch(`/books/${book.id}`, { projectId: e.target.value || null }))}
        >
          <option value="">No project</option>
          {book.projectId && !projects.data?.projects.some((p) => p.id === book.projectId) && (
            <option value={book.projectId}>Current project (not in this list)</option>
          )}
          {projects.data?.projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
      </Field>

      {projects.error && (
        <Button size="sm" variant="ghost" onClick={() => void projects.refetch()}>
          Retry loading projects
        </Button>
      )}

      <div className="flex flex-wrap gap-1">
        <Button
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() => void change(() => api.patch(`/books/${book.id}`, { archived: !book.archivedAt }))}
        >
          {book.archivedAt ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
          {book.archivedAt ? "Restore" : "Archive"}
        </Button>
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => setCopyOpen(true)}>
          <Copy className="h-3.5 w-3.5" />
          Duplicate
        </Button>
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => setConfirmDelete(true)}>
          <Trash2 className="h-3.5 w-3.5" />
          Delete
        </Button>
      </div>

      <Dialog
        open={copyOpen}
        onClose={() => !busy && setCopyOpen(false)}
        title="Duplicate book"
        description="Creates an independent book with new identities. Credits, exports, jobs and revision history are not copied. The copy starts outside any project."
      >
        <div className="flex flex-wrap gap-2">
          <Button disabled={busy} onClick={() => void change(() => api.post(`/books/${book.id}/duplicate`, { includeManuscript: false }))}>
            Copy brief and outline
          </Button>
          <Button disabled={busy} variant="secondary" onClick={() => void change(() => api.post(`/books/${book.id}/duplicate`, { includeManuscript: true }))}>
            Include manuscript
          </Button>
        </div>
      </Dialog>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => void change(() => api.delete(`/books/${book.id}`))}
        title="Delete this book?"
        description={`“${book.title}” will be removed from your library.`}
        confirmLabel="Delete book"
        busy={busy}
      >
        <p>
          This cannot be undone. Archive it instead if you want to be able to restore it later — an archived book stays
          in your library and can be brought back at any time.
        </p>
      </ConfirmDialog>
    </div>
  );
}

/**
 * The projects screen.
 *
 * A project groups books by series, client or publishing idea. Archiving one
 * keeps its books in the library, so archiving is the reversible option and
 * deleting is the one that is spelled out.
 */
export function ProjectManager() {
  const qc = useQueryClient();
  const [archived, setArchived] = useState("active");
  const [cursor, setCursor] = useState("");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Project | "new" | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<Project | null>(null);

  const projects = useProjects(
    new URLSearchParams({ archived, search, limit: "24", ...(cursor ? { cursor } : {}) }).toString(),
  );

  const change = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await action();
      setEditing(null);
      setDeleting(null);
      await qc.invalidateQueries({ queryKey: ["projects"] });
      await qc.invalidateQueries({ queryKey: ["books"] });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-8">
      <PageHeader
        title="Projects"
        description="Group books by series, client or publishing idea. Archiving a project keeps its books in the library."
        actions={
          <Button
            onClick={() => {
              setEditing("new");
              setName("");
              setDescription("");
            }}
          >
            New project
          </Button>
        }
      />

      <div className="mb-6 flex flex-wrap items-end gap-3">
        <Field label="Search" htmlFor="project-search" className="min-w-56 flex-1">
          <Input
            id="project-search"
            placeholder="Search projects"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setCursor("");
            }}
          />
        </Field>
        <Field label="Show" htmlFor="project-archive-filter">
          <Select
            id="project-archive-filter"
            value={archived}
            onChange={(e) => {
              setArchived(e.target.value);
              setCursor("");
            }}
          >
            <option value="active">Active projects</option>
            <option value="archived">Archived projects</option>
            <option value="all">All projects</option>
          </Select>
        </Field>
      </div>

      {projects.isPending && !projects.error ? (
        <PageLoader />
      ) : projects.error ? (
        <ErrorState
          message={errorMessage(projects.error)}
          onRetry={() => (cursor ? setCursor("") : void projects.refetch())}
        />
      ) : projects.data && projects.data.projects.length > 0 ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            {projects.data.projects.map((p) => (
              <Card key={p.id} className="flex flex-col p-5">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-lg font-semibold">
                    <Link
                      href={`/app/books?projectId=${encodeURIComponent(p.id)}&archived=all`}
                      className="hover:text-primary-hover"
                    >
                      {p.name}
                    </Link>
                  </h2>
                  <Badge tone={p.archivedAt ? "neutral" : "success"}>{p.archivedAt ? "Archived" : "Active"}</Badge>
                </div>

                {p.description && <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{p.description}</p>}
                <p className="mt-2 text-xs text-muted-foreground">
                  {p._count.books} {p._count.books === 1 ? "book" : "books"}
                </p>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busy}
                    onClick={() => {
                      setEditing(p);
                      setName(p.name);
                      setDescription(p.description ?? "");
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busy}
                    onClick={() => void change(() => api.patch(`/projects/${p.id}`, { archived: !p.archivedAt }))}
                  >
                    {p.archivedAt ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
                    {p.archivedAt ? "Restore" : "Archive"}
                  </Button>
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => setDeleting(p)}>
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </Button>
                </div>
              </Card>
            ))}
          </div>

          <div className="mt-6 flex gap-2">
            <Button variant="secondary" disabled={!cursor} onClick={() => setCursor("")}>
              First page
            </Button>
            <Button variant="secondary" disabled={!projects.data.nextCursor} onClick={() => setCursor(projects.data!.nextCursor!)}>
              Next projects
            </Button>
          </div>
        </>
      ) : (
        <EmptyState
          icon={<FolderKanban className="h-6 w-6" />}
          title={search ? "No projects match that search" : "No projects yet"}
          description={
            search
              ? "Try a different name, or clear the search to see every project."
              : "Projects group books by series, client or publishing idea. Create one to start."
          }
          action={
            search ? (
              <Button
                variant="secondary"
                onClick={() => {
                  setSearch("");
                  setCursor("");
                }}
              >
                Clear search
              </Button>
            ) : (
              <Button
                onClick={() => {
                  setEditing("new");
                  setName("");
                  setDescription("");
                }}
              >
                New project
              </Button>
            )
          }
        />
      )}

      <Dialog
        open={Boolean(editing)}
        onClose={() => !busy && setEditing(null)}
        title={editing === "new" ? "New project" : "Edit project"}
        description={editing === "new" ? "Give the project a name so it can be found later." : undefined}
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!editing) return;
            void change(() =>
              editing === "new"
                ? api.post("/projects", { name, description })
                : api.patch(`/projects/${editing.id}`, { name, description }),
            );
          }}
        >
          <Field label="Name" htmlFor="project-name">
            <Input
              id="project-name"
              required
              maxLength={120}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="The Sourdough Series"
            />
          </Field>
          <Field label="Description" htmlFor="project-description" hint="Optional. What this project collects.">
            <Textarea
              id="project-description"
              maxLength={1000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>
          <Button type="submit" loading={busy} disabled={!name.trim()}>
            Save project
          </Button>
        </form>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={() => {
          if (!deleting) return;
          void change(() => api.delete(`/projects/${deleting.id}`));
        }}
        title="Delete this project?"
        description={deleting ? `“${deleting.name}” will be removed.` : undefined}
        confirmLabel="Delete project"
        busy={busy}
      >
        <p>
          Its books stay in your library without a project, so nothing you have written is lost. Archive the project
          instead if you want to keep it out of the way and bring it back later.
        </p>
      </ConfirmDialog>
    </div>
  );
}
