"use client";

import React, { useCallback, useEffect, useState } from "react";
import { LoaderCircle, ShieldCheck, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { normalizeNoteText } from "@/lib/phi/normalize";
import { redactPhi } from "@/lib/phi/redact";
import { blockingFindings, detectPhi } from "@/lib/phi/detect";
import {
  extractTextFromFile,
  type ExtractedText,
} from "@/lib/noteIngest/extractText";
import type { RedactionResult } from "@/lib/phi/types";
import { RedactedPreview, RedactionSummary } from "./RedactedPreview";
import { FileUpload } from "@/components/ui/FileUpload";

/**
 * The confirm gate.
 *
 * The user attaches a note, it is parsed and de-identified ON THIS DEVICE, and
 * nothing is sent until they have seen what was removed and ticked a box. That
 * checkbox is the point: `documents/privacy-policy.md` puts responsibility for
 * de-identification on the user, and this is the only place in the product
 * where they actually exercise it rather than being told about it in a footer.
 *
 * A modal is the right container here precisely because it traps focus -- it
 * is hard to dismiss by accident on the way to sending PHI.
 */

/**
 * State is keyed by the File it describes rather than reset imperatively.
 *
 * The obvious shape -- setPhase("reading"), setResult(null), ... at the top of
 * an effect -- triggers a cascading render on every file change, and React's
 * lint rule rejects it. Recording WHICH file the loaded state belongs to makes
 * "still reading" and "not yet confirmed" derivable instead: anything whose
 * key is not the current file simply does not describe it.
 */
interface Session {
  file: File;
  extracted?: ExtractedText;
  normalized?: string;
  result?: RedactionResult;
  error?: string;
}

export interface NoteIngestDialogProps {
  open: boolean;
  onClose: () => void;
  /** Receives the serialized query; the caller fires the screening. */
  onReady: (query: string) => void;
}

export function NoteIngestDialog({
  open,
  onClose,
  onReady,
}: NoteIngestDialogProps) {
  // The dialog owns the picked file so it can open on the dropzone and support
  // drag-and-drop, rather than the chat input having to drive a hidden input.
  const [file, setFile] = useState<File | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [confirmedFile, setConfirmedFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!file) return;
    let cancelled = false;

    (async () => {
      try {
        const extracted = await extractTextFromFile(file);
        if (cancelled) return;
        const normalized = normalizeNoteText(extracted.text);
        setSession({
          file,
          extracted,
          normalized,
          result: redactPhi(normalized),
        });
      } catch (e) {
        if (cancelled) return;
        // `extractText` authors these for a clinician. Anything else gets a
        // generic line rather than leaking internals beside a file that may
        // still hold PHI.
        setSession({
          file,
          error:
            e instanceof Error && e.name.endsWith("Error") && e.message
              ? e.message
              : "That file could not be read.",
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [file]);

  // Loaded state only counts when it describes the file currently open.
  const loaded = session && session.file === file ? session : null;
  const result = loaded?.result ?? null;
  const confirmed = !!file && confirmedFile === file;

  // Residue is what the engine still sees AFTER redacting. High-confidence
  // findings hold the button down: shipping them would defeat the point.
  const residue = result ? blockingFindings(detectPhi(result.redacted)) : [];
  const canSend = !!result && confirmed && residue.length === 0 && !sending;

  const close = useCallback(() => {
    setFile(null);
    setSession(null);
    setConfirmedFile(null);
    onClose();
  }, [onClose]);

  const send = useCallback(async () => {
    if (!loaded?.result || !loaded.extracted) return;
    setSending(true);
    try {
      const res = await fetch("/api/notes/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: loaded.result.redacted,
          sourceKind: loaded.extracted.kind,
          redactionCount: loaded.result.total,
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (data?.error === "PHI_DETECTED") {
          toast.warning("We stopped this note before it was used", {
            description:
              "Identifiers were still detected after redaction. Remove them and try again.",
          });
        } else if (data?.error === "NO_FIELDS_EXTRACTED") {
          toast.error("Nothing could be read from that note", {
            description: "Try pasting the relevant section instead.",
          });
        } else {
          toast.error("That note could not be processed.");
        }
        return;
      }

      onReady(data.query as string);
      close();
    } catch {
      toast.error("That note could not be processed.");
    } finally {
      setSending(false);
    }
  }, [loaded, onReady, close]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-success" />
            Checking for HIPAA compliance
          </DialogTitle>
          <DialogDescription>
            {file?.name
              ? `${file.name} was read on this device. Nothing has been sent yet.`
              : "Notes are de-identified on this device before anything is sent."}
          </DialogDescription>
        </DialogHeader>

        {!file ? (
          <FileUpload onFile={setFile} />
        ) : !loaded ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" />
            Reading and de-identifying…
          </div>
        ) : loaded.error ? (
          <p
            data-testid="ingest-error"
            className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {loaded.error}
          </p>
        ) : result ? (
          <div className="space-y-3">
            <RedactionSummary result={result} />
            <RedactedPreview
              original={loaded.normalized ?? ""}
              result={result}
            />

            {loaded.extracted?.truncated ? (
              <p className="text-xs text-warning">
                This note was long and only the first part will be used.
              </p>
            ) : null}

            {residue.length > 0 ? (
              <p
                data-testid="residue-warning"
                className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning"
              >
                <TriangleAlert className="mt-[1px] size-3.5 flex-shrink-0" />
                Something that still looks like an identifier was found after
                redaction. Edit the note and attach it again.
              </p>
            ) : (
              <label className="flex cursor-pointer items-start gap-2.5 text-[13px] text-foreground">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) =>
                    setConfirmedFile(e.target.checked ? file : null)
                  }
                  className="mt-[3px] size-3.5 flex-shrink-0 accent-blue-600"
                />
                I have reviewed this and confirm it contains no patient
                identifying information.
              </label>
            )}
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button
            onClick={send}
            disabled={!canSend}
            className="bg-blue-600 text-white hover:bg-blue-700"
          >
            {sending ? (
              <span className="flex items-center gap-2">
                <LoaderCircle className="size-4 animate-spin" />
                Sending…
              </span>
            ) : (
              "Use this note"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
