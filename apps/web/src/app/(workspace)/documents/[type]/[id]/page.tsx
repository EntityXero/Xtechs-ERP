'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  FileText,
  RefreshCw,
  Loader2,
  AlertCircle,
  ArrowLeft,
  Calendar,
  DollarSign,
  User,
  ShieldAlert,
  Send,
  MessageSquare,
  History,
  Paperclip,
  Trash2,
  Download,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  useDocumentDetails,
  useTransitionDocument,
  useAddComment,
  useUploadAttachment,
  useDeleteAttachment,
} from '@/hooks/use-api';
import { useAuthStore } from '@/store/auth-store';
import { api } from '@/lib/api-client';

// Map file types to icons
function getFileIcon(mimeType: string) {
  if (mimeType === 'application/pdf') {
    return <FileText className="h-4 w-4 text-rose-500 shrink-0" />;
  }
  if (mimeType.startsWith('image/')) {
    return <Paperclip className="h-4 w-4 text-emerald-500 shrink-0" />;
  }
  return <Paperclip className="h-4 w-4 text-muted-foreground shrink-0" />;
}

// Map workflow states to badge classes
function getWorkflowStateBadge(state: string) {
  const s = state.toLowerCase();
  let cls = 'bg-status-draft text-status-draft-foreground border-status-draft/30';
  if (s === 'pending_approval') cls = 'bg-status-pending text-status-pending-foreground border-status-pending/30';
  if (s === 'approved') cls = 'bg-status-approved text-status-approved-foreground border-status-approved/30';
  if (s === 'posted') cls = 'bg-status-posted text-status-posted-foreground border-status-posted/30';
  if (s === 'reversed') cls = 'bg-status-rejected text-status-rejected-foreground border-status-rejected/30';
  if (s === 'archived') cls = 'bg-muted text-muted-foreground border-border';
  
  return (
    <Badge variant="outline" className={`font-mono text-[9px] uppercase tracking-wider font-bold py-0.5 px-2 ${cls}`}>
      {state.replace(/_/g, ' ')}
    </Badge>
  );
}

interface PageProps {
  params: Promise<{
    type: string;
    id: string;
  }>;
}

export default function DocumentDetailsPage({ params }: PageProps) {
  const router = useRouter();
  const resolvedParams = React.use(params);
  const { type, id } = resolvedParams;

  const { data: doc, isLoading, isError, refetch } = useDocumentDetails(type, id);

  const transitionMutation = useTransitionDocument(type, id);
  const commentMutation = useAddComment(type, id);
  const uploadMutation = useUploadAttachment(type, id);
  const deleteMutation = useDeleteAttachment(type, id);

  const { user } = useAuthStore();
  const [commentContent, setCommentContent] = React.useState('');
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [isUploading, setIsUploading] = React.useState(false);

  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Available transitions based on current document workflow state
  const getEligibleTransitions = (state: string) => {
    const s = state.toLowerCase();
    if (s === 'draft') {
      return [
        { event: 'submit', label: 'Submit for Approval', variant: 'default' as const },
        { event: 'archive', label: 'Archive', variant: 'secondary' as const },
      ];
    }
    if (s === 'pending_approval') {
      return [
        { event: 'approve', label: 'Approve', variant: 'default' as const },
        { event: 'reject', label: 'Reject to Draft', variant: 'destructive' as const },
      ];
    }
    if (s === 'approved') {
      return [
        { event: 'post', label: 'Post to Ledger', variant: 'default' as const },
        { event: 'reject', label: 'Reject to Draft', variant: 'destructive' as const },
      ];
    }
    if (s === 'posted') {
      return [
        { event: 'reverse', label: 'Reverse Document', variant: 'destructive' as const },
        { event: 'archive', label: 'Archive', variant: 'secondary' as const },
      ];
    }
    if (s === 'reversed') {
      return [
        { event: 'archive', label: 'Archive', variant: 'secondary' as const },
      ];
    }
    return [];
  };

  const handleTransition = async (event: string) => {
    setErrorMessage(null);
    try {
      await transitionMutation.mutateAsync(event);
    } catch (err: any) {
      setErrorMessage(err.message || `Failed to transition document via event: ${event}`);
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentContent.trim()) return;

    setErrorMessage(null);
    try {
      await commentMutation.mutateAsync(commentContent.trim());
      setCommentContent('');
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to submit comment.');
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMessage(null);
    setIsUploading(true);

    try {
      await uploadMutation.mutateAsync(file);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'File upload failed. Check file type and size.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteAttachment = async (attachmentId: string) => {
    setErrorMessage(null);
    try {
      await deleteMutation.mutateAsync(attachmentId);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to delete attachment.');
    }
  };

  const handleDownloadAttachment = async (attachmentId: string) => {
    try {
      const res = await api.get<{ downloadUrl: string }>(
        `/api/v1/attachments/${attachmentId}/download-link`
      );
      // Access the backend direct download url using the signed token
      const baseApiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
      window.open(`${baseApiUrl}${res.downloadUrl}`, '_blank');
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to generate download link.');
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-32">
        <Loader2 className="h-6 w-6 animate-spin text-primary mb-3" />
        <p className="text-xs text-muted-foreground font-mono">Retrieving document details...</p>
      </div>
    );
  }

  if (isError || !doc) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-4">
        <AlertCircle className="h-10 w-10 text-destructive mb-3" />
        <h2 className="text-sm font-bold text-foreground">Failed to Load Document</h2>
        <p className="text-xs text-muted-foreground text-center mt-1 font-mono max-w-[400px]">
          The document could not be found or you do not have permission to view it.
        </p>
        <div className="flex gap-2 mt-4">
          <Button variant="outline" size="sm" onClick={() => router.back()} className="text-xs h-8 border-border">
            Go Back
          </Button>
          <Button variant="default" size="sm" onClick={() => refetch()} className="text-xs h-8">
            Retry
          </Button>
        </div>
      </div>
    );
  }

  // Calculate totals
  const subtotal = doc.lines.reduce((sum, line) => sum + parseFloat(line.amount || '0'), 0);
  const tax = subtotal * 0.15; // 15% Standard Tax Mock
  const totalAmount = subtotal + tax;

  const transitions = getEligibleTransitions(doc.workflowState);

  return (
    <div className="flex flex-col gap-6">
      {/* Top action bar */}
      <div className="flex items-center justify-between border-b border-border/60 pb-4">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="icon"
            onClick={() => router.back()}
            className="h-7 w-7 border-border hover:bg-muted"
            title="Go Back"
          >
            <ArrowLeft className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold tracking-tight text-foreground font-sans">
                {doc.docNumber || 'Draft Document'}
              </h1>
              {getWorkflowStateBadge(doc.workflowState)}
            </div>
            <p className="text-[10px] text-muted-foreground font-mono mt-0.5 uppercase tracking-wider">
              Type: {doc.documentType.replace(/_/g, ' ')} · ID: {doc.id.slice(0, 8)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs border-border gap-1.5"
            onClick={() => refetch()}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Main content grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left Column: Details, Lines, Timeline */}
        <div className="lg:col-span-2 space-y-6">
          {/* Error Message Alert */}
          {errorMessage && (
            <div className="flex items-start gap-2.5 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 select-none">
              <ShieldAlert className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-destructive">Action Failed</p>
                <p className="text-[11px] text-destructive/80 font-mono mt-0.5">{errorMessage}</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setErrorMessage(null)}
                className="h-5 text-[10px] text-destructive hover:bg-destructive/10 px-1.5"
              >
                Dismiss
              </Button>
            </div>
          )}

          {/* Document Metadata Card */}
          <div className="rounded-md border border-border bg-card p-4 space-y-4">
            <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground font-mono border-b border-border/40 pb-2">
              Document Scope & Metadata
            </h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 select-none">
              <div className="space-y-1">
                <span className="text-[10px] text-muted-foreground font-mono uppercase block">Posting Date</span>
                <span className="text-xs font-medium text-foreground font-sans flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                  {new Date(doc.createdAt).toLocaleDateString('en-GB', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                  })}
                </span>
              </div>
              <div className="space-y-1">
                <span className="text-[10px] text-muted-foreground font-mono uppercase block">Partner Entity</span>
                <span className="text-xs font-medium text-foreground font-sans">
                  {doc.metadata?.partnerName as string ?? 'Acme General Services'}
                </span>
              </div>
              <div className="space-y-1">
                <span className="text-[10px] text-muted-foreground font-mono uppercase block">Created By</span>
                <span className="text-xs font-medium text-foreground font-sans flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5 text-muted-foreground" />
                  System Administrator
                </span>
              </div>
              <div className="space-y-1">
                <span className="text-[10px] text-muted-foreground font-mono uppercase block">Total Value</span>
                <span className="text-xs font-bold text-foreground font-mono flex items-center gap-0.5">
                  <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
                  {totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>

          {/* Dense lines table */}
          <div className="rounded-md border border-border bg-card overflow-hidden">
            <div className="border-b border-border/60 bg-muted/30 px-4 py-2">
              <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground font-mono">
                Document Line Items
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-border bg-muted/10 font-mono text-[10px] uppercase text-muted-foreground tracking-wider select-none">
                    <th className="py-2.5 px-4 w-12 text-center">Line</th>
                    <th className="py-2.5 px-2">Item / Account</th>
                    <th className="py-2.5 px-2">Description</th>
                    <th className="py-2.5 px-2 text-right w-20">Quantity</th>
                    <th className="py-2.5 px-2 text-right w-28">Rate</th>
                    <th className="py-2.5 px-4 text-right w-32">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60 text-xs font-sans">
                  {doc.lines.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-muted-foreground italic font-mono select-none">
                        No lines recorded on this document.
                      </td>
                    </tr>
                  ) : (
                    doc.lines.map((line, index) => (
                      <tr key={line.id} className="hover:bg-muted/30 transition-colors">
                        <td className="py-2 px-4 text-center font-mono text-muted-foreground">{index + 1}</td>
                        <td className="py-2 px-2 font-medium text-foreground">
                          {line.data?.itemName ?? line.data?.accountCode ?? 'General Service'}
                          {line.data?.itemId && <span className="font-mono text-[9px] text-muted-foreground block">SKU: {String(line.data.itemId).slice(0, 8)}</span>}
                        </td>
                        <td className="py-2 px-2 text-muted-foreground">{line.description ?? '—'}</td>
                        <td className="py-2 px-2 text-right font-mono">{parseFloat(line.quantity).toLocaleString()}</td>
                        <td className="py-2 px-2 text-right font-mono">
                          {parseFloat(line.unitPrice).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                        </td>
                        <td className="py-2 px-4 text-right font-mono font-semibold text-foreground">
                          {parseFloat(line.amount).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Calculations summary block */}
            <div className="border-t border-border/80 bg-muted/20 p-4 flex justify-end select-none">
              <div className="w-64 space-y-1.5 text-xs font-mono">
                <div className="flex justify-between text-muted-foreground">
                  <span>Subtotal:</span>
                  <span className="font-semibold">{subtotal.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Tax (15% MTD):</span>
                  <span className="font-semibold">{tax.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</span>
                </div>
                <div className="flex justify-between text-foreground border-t border-border/60 pt-1.5 text-sm font-bold">
                  <span>Total Amount:</span>
                  <span className="text-primary">{totalAmount.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Comments Feed and Activity timelines */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Timeline activity list */}
            <div className="rounded-md border border-border bg-card p-4 space-y-4">
              <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground font-mono border-b border-border/40 pb-2 flex items-center gap-1.5 select-none">
                <History className="h-4 w-4" />
                Workflow Activity Trail
              </h2>
              <div className="relative pl-4 border-l border-border/80 space-y-4 py-1">
                {doc.activities.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground italic font-mono select-none">
                    No transition activities logged.
                  </p>
                ) : (
                  doc.activities.map((act) => (
                    <div key={act.id} className="relative">
                      {/* Circle indicator */}
                      <span className="absolute -left-[21px] top-1 rounded-full bg-primary h-2 w-2 ring-4 ring-background" />
                      <div className="flex justify-between items-start gap-2">
                        <span className="text-xs font-bold text-foreground">
                          {act.activityType.replace(/_/g, ' ').toUpperCase()}
                        </span>
                        <span className="font-mono text-[9px] text-muted-foreground">
                          {new Date(act.createdAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{act.description}</p>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Comment timeline */}
            <div className="rounded-md border border-border bg-card p-4 flex flex-col justify-between">
              <div className="space-y-4">
                <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground font-mono border-b border-border/40 pb-2 flex items-center gap-1.5 select-none">
                  <MessageSquare className="h-4 w-4" />
                  Collaborative Comments
                </h2>
                <div className="space-y-3 max-h-[220px] overflow-y-auto pr-1">
                  {doc.comments.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground italic font-mono py-4 select-none">
                      No comments posted yet.
                    </p>
                  ) : (
                    doc.comments.map((comment) => (
                      <div key={comment.id} className="rounded-md bg-muted/40 p-2.5 border border-border/40 space-y-1">
                        <div className="flex justify-between items-center select-none">
                          <span className="text-[10px] font-bold text-foreground font-mono">
                            {comment.userId.slice(0, 8)} (User)
                          </span>
                          <span className="text-[9px] text-muted-foreground font-mono">
                            {new Date(comment.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                          </span>
                        </div>
                        <p className="text-[11px] text-foreground font-sans leading-relaxed">{comment.content}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Comment submission form */}
              <form onSubmit={handleAddComment} className="flex gap-2 mt-4 pt-3 border-t border-border/40">
                <Input
                  value={commentContent}
                  onChange={(e) => setCommentContent(e.target.value)}
                  placeholder="Ask a question or leave a note..."
                  className="h-8 text-xs font-sans border-border bg-background"
                  disabled={commentMutation.isPending}
                />
                <Button
                  type="submit"
                  size="sm"
                  className="h-8 w-8 p-0 shrink-0"
                  disabled={commentMutation.isPending || !commentContent.trim()}
                >
                  {commentMutation.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Send className="h-3.5 w-3.5" />
                  )}
                </Button>
              </form>
            </div>
          </div>
        </div>

        {/* Right Column: Workflow Control Panel & Attachments */}
        <div className="space-y-6">
          {/* Workflow control panel */}
          <div className="rounded-md border border-border bg-card p-4 space-y-4">
            <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground font-mono border-b border-border/40 pb-2 select-none">
              Workflow Status Cockpit
            </h2>
            <div className="space-y-3 select-none">
              <div className="flex justify-between items-center">
                <span className="text-xs font-semibold text-muted-foreground font-sans">Current State:</span>
                <span className="font-mono text-xs font-bold uppercase text-foreground">{doc.workflowState}</span>
              </div>
              <div className="flex justify-between items-center border-b border-border/30 pb-2">
                <span className="text-xs font-semibold text-muted-foreground font-sans">Final Posting:</span>
                <span className="flex items-center gap-1 font-mono text-xs font-bold text-foreground">
                  {doc.workflowState === 'posted' ? (
                    <>
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                      FINALIZED
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                      PENDING
                    </>
                  )}
                </span>
              </div>
            </div>

            {/* Workflow state transitions buttons */}
            <div className="space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground font-mono block select-none">
                Available Actions
              </span>
              {transitions.length === 0 ? (
                <p className="text-[11px] text-muted-foreground italic font-mono select-none">
                  No workflow transitions available from this state.
                </p>
              ) : (
                transitions.map((btn) => (
                  <Button
                    key={btn.event}
                    variant={btn.variant}
                    className="w-full text-xs font-semibold h-9"
                    onClick={() => handleTransition(btn.event)}
                    disabled={transitionMutation.isPending}
                  >
                    {transitionMutation.isPending && transitionMutation.variables === btn.event ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                    ) : null}
                    {btn.label}
                  </Button>
                ))
              )}
            </div>
          </div>

          {/* Attachments Section */}
          <div className="rounded-md border border-border bg-card p-4 space-y-4">
            <div className="flex justify-between items-center border-b border-border/40 pb-2 select-none">
              <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground font-mono">
                Document Attachments
              </h2>
              <Badge variant="secondary" className="font-mono text-[9px] px-1.5">
                {doc.attachments.length} files
              </Badge>
            </div>

            {/* Hidden native input */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              className="hidden"
              accept=".pdf,image/png,image/jpeg,image/webp"
              disabled={isUploading}
            />

            {/* Upload trigger dropzone */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="w-full rounded border border-dashed border-border bg-muted/10 hover:bg-muted/30 transition-colors p-4 flex flex-col items-center justify-center gap-1.5 cursor-pointer outline-none select-none"
            >
              {isUploading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  <span className="text-[11px] font-mono text-muted-foreground">Uploading file stream...</span>
                </>
              ) : (
                <>
                  <Paperclip className="h-5 w-5 text-muted-foreground" />
                  <span className="text-[11px] font-bold text-foreground">Attach File</span>
                  <span className="text-[9px] text-muted-foreground font-mono">PDF, PNG, JPEG up to 10MB</span>
                </>
              )}
            </button>

            {/* Attachment list */}
            <div className="space-y-2">
              {doc.attachments.length === 0 ? (
                <p className="text-[11px] text-muted-foreground italic font-mono text-center py-4 select-none">
                  No files attached.
                </p>
              ) : (
                doc.attachments.map((file) => (
                  <div
                    key={file.id}
                    className="flex items-center justify-between gap-3 p-2 rounded-md border border-border/40 bg-muted/20 group hover:bg-muted/40 transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {getFileIcon(file.fileType)}
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-foreground truncate max-w-[140px] font-sans">
                          {file.fileName}
                        </p>
                        <p className="text-[9px] text-muted-foreground font-mono">
                          {(file.fileSize / 1024).toFixed(1)} KB
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDownloadAttachment(file.id)}
                        className="h-7 w-7 border border-transparent hover:border-border hover:bg-background rounded"
                        title="Download / View File"
                      >
                        <Download className="h-3.5 w-3.5 text-muted-foreground" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteAttachment(file.id)}
                        className="h-7 w-7 border border-transparent hover:border-border hover:bg-background rounded text-destructive hover:text-destructive/80"
                        title="Delete Attachment"
                        disabled={deleteMutation.isPending}
                      >
                        {deleteMutation.isPending && deleteMutation.variables === file.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
